import { MIGRATION_SCHEMA_VERSION } from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '../../core/types.js';
import { archiveClosedPullRequests } from './pr-archiver.js';
import { recreatePullRequest } from './pr-recreator.js';
import type {
  ArchivePullRequestsPayload,
  CreatePullRequestPayload,
  MigrationPullRequest,
  MigrationPullRequestComment,
  PullRequestsMigrationData,
  RawApiPullComment,
  RawApiPullRequest,
} from './types.js';

function mapApiPullRequest(raw: RawApiPullRequest): MigrationPullRequest {
  const labels: string[] = Array.isArray(raw.labels)
    ? raw.labels.map((l) => (typeof l === 'string' ? l : l.name))
    : [];

  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state === 'open' ? 'open' : 'closed',
    merged: Boolean(raw.merged_at),
    headRef: raw.head?.ref ?? 'unknown',
    baseRef: raw.base?.ref ?? 'main',
    author: raw.user?.login ?? 'unknown',
    labels,
    milestone: raw.milestone?.number,
    commentsCount: raw.comments ?? 0,
    reviewCommentsCount: raw.review_comments ?? 0,
    createdAt: raw.created_at,
    closedAt: raw.closed_at,
    mergedAt: raw.merged_at,
  };
}

export class PullRequestsMigrationModule implements MigrationModule<PullRequestsMigrationData> {
  readonly id = 'pull-requests';
  readonly displayName = 'Pull Requests & Historical Archival';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  /**
   * Discovers pull requests (open and closed) from source repository.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<PullRequestsMigrationData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'PullRequestsMigrationModule requires sourceRepo in migration context.',
      );
    }

    let rawPulls: RawApiPullRequest[] = [];

    // 1. Check cachedData if available
    if (cachedData && typeof cachedData === 'object') {
      const bundle = cachedData as { entities?: unknown[] };
      if (Array.isArray(bundle.entities)) {
        const repoEntity = bundle.entities.find(
          (e: unknown): e is Record<string, unknown> =>
            typeof e === 'object' &&
            e !== null &&
            'kind' in e &&
            (e as { kind: string }).kind === 'repository' &&
            'name' in e &&
            (e as { name: string }).name === repo,
        );
        if (
          repoEntity &&
          'pullRequests' in repoEntity &&
          Array.isArray(repoEntity.pullRequests)
        ) {
          rawPulls = repoEntity.pullRequests as RawApiPullRequest[];
        }
      }
    }

    // 2. Fetch live via GitHub API if not in cache
    if (rawPulls.length === 0) {
      try {
        const pullsRes = await ctx.sourceClient.fetchAll<RawApiPullRequest>(
          {
            id: 'rest.pulls.listPulls',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/pulls',
            pathParams: { owner: ctx.scope.sourceOrg, repo },
            queryParams: { state: 'all', per_page: 100 },
          },
          ctx.signal,
        );
        if (pullsRes?.items) {
          rawPulls = [...pullsRes.items];
        }
      } catch (err: unknown) {
        ctx.logger.warn?.(
          `Failed to fetch pull requests for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const openPullRequests: MigrationPullRequest[] = [];
    const closedPullRequests: MigrationPullRequest[] = [];
    const commentsByPrNumber: Record<number, MigrationPullRequestComment[]> =
      {};

    for (const raw of rawPulls) {
      const pr = mapApiPullRequest(raw);
      if (pr.state === 'open') {
        openPullRequests.push(pr);

        // Fetch comments for open PRs
        if (pr.commentsCount > 0) {
          try {
            const commentsRes =
              await ctx.sourceClient.fetchAll<RawApiPullComment>(
                {
                  id: 'rest.issues.listComments',
                  transport: 'rest',
                  verifiedReadOnly: true,
                  path: '/repos/{owner}/{repo}/issues/{issue_number}/comments',
                  pathParams: {
                    owner: ctx.scope.sourceOrg,
                    repo,
                    issue_number: String(pr.number),
                  },
                  queryParams: { per_page: 100 },
                },
                ctx.signal,
              );
            if (commentsRes?.items) {
              commentsByPrNumber[pr.number] = commentsRes.items.map((c) => ({
                id: c.id,
                body: c.body,
                createdAt: c.created_at,
                author: c.user?.login,
              }));
            }
          } catch {
            // Non-fatal if comments fetch fails
          }
        }
      } else {
        closedPullRequests.push(pr);
      }
    }

    return {
      repo,
      openPullRequests,
      closedPullRequests,
      commentsByPrNumber,
    };
  }

  /**
   * Plans recreation of open PRs and archival of closed/merged PRs.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: PullRequestsMigrationData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const operations: PlannedOperation[] = [];

    // Query target for existing PRs
    let targetPulls: RawApiPullRequest[] = [];
    try {
      const tpRes = await ctx.targetClient.fetchAll<RawApiPullRequest>(
        {
          id: 'rest.pulls.listTargetPulls',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/pulls',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (tpRes?.items) targetPulls = [...tpRes.items];
    } catch {
      // In offline harness or if repo is not found
    }

    // Query target for existing archive issue
    let archiveExists = false;
    try {
      const issuesRes = await ctx.targetClient.fetchAll<{
        title: string;
        labels?: readonly ({ name: string } | string)[];
      }>(
        {
          id: 'rest.issues.listTargetIssues',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/issues',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (issuesRes?.items) {
        archiveExists = issuesRes.items.some(
          (i) =>
            i.title.toLowerCase() ===
            'Historical Pull Requests Archive'.toLowerCase(),
        );
      }
    } catch {
      // Non-fatal
    }

    // 1. Plan Open Pull Requests
    const targetPullTitles = new Set(
      targetPulls.map((p) => p.title.toLowerCase()),
    );
    for (const pr of sourceData.openPullRequests) {
      const exists = targetPullTitles.has(pr.title.toLowerCase());
      const payload: CreatePullRequestPayload = {
        sourceNumber: pr.number,
        title: pr.title,
        body: pr.body,
        head: pr.headRef,
        base: pr.baseRef,
        labels: pr.labels,
        milestone: pr.milestone,
        comments: sourceData.commentsByPrNumber[pr.number] ?? [],
      };

      operations.push({
        id: targetRepo ? `pull-request:${targetRepo}:${pr.number}` : `pull-request:${pr.number}`,
        resourceType: 'pull-request',
        resourceName: `#${pr.number} ${pr.title}`,
        operation: exists ? 'noop' : 'create',
        reason: exists
          ? `Pull request #${pr.number} "${pr.title}" already exists on target.`
          : `Recreate open pull request #${pr.number} "${pr.title}".`,
        payload,
      });
    }

    // 2. Plan Closed Pull Requests Archive
    if (sourceData.closedPullRequests.length > 0) {
      const payload: ArchivePullRequestsPayload = {
        archiveTitle: 'Historical Pull Requests Archive',
        closedPrs: sourceData.closedPullRequests,
      };

      operations.push({
        id: targetRepo ? `pull-requests-archive:${targetRepo}` : 'pull-requests-archive',
        resourceType: 'pull-requests-archive',
        resourceName: 'Historical Pull Requests Archive',
        operation: archiveExists ? 'noop' : 'create',
        reason: archiveExists
          ? 'Historical pull requests archive already exists on target repository.'
          : `Archive ${sourceData.closedPullRequests.length} closed/merged pull requests into historical audit issue.`,
        payload,
      });
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${ctx.scope.targetOrg}/${targetRepo}`,
      operations,
      warnings: [],
    };
  }

  /**
   * Applies planned PR recreations and PR archival.
   */
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const startTime = Date.now();

    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

    const results: OperationExecutionResult[] = [];

    for (const op of plan.operations) {
      if (ctx.signal.aborted) {
        results.push({
          operationId: op.id,
          status: 'failed',
          error: 'Migration execution aborted',
          completedAt: new Date().toISOString(),
        });
        break;
      }

      if (op.operation === 'noop') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt: new Date().toISOString(),
        });
        continue;
      }

      if (ctx.dryRun) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt: new Date().toISOString(),
        });
        continue;
      }

      try {
        if (op.resourceType === 'pull-request' && op.operation === 'create') {
          const payload = op.payload as CreatePullRequestPayload;
          const prRes = await recreatePullRequest(
            ctx.targetWriteClient!,
            ctx.scope.targetOrg,
            targetRepo,
            payload,
            ctx.signal,
            ctx.dryRun,
          );

          if (prRes.success) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: 201,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              error: prRes.error,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        } else if (
          op.resourceType === 'pull-requests-archive' &&
          op.operation === 'create'
        ) {
          const payload = op.payload as ArchivePullRequestsPayload;
          const archiveRes = await archiveClosedPullRequests(
            ctx.targetWriteClient!,
            ctx.scope.targetOrg,
            targetRepo,
            payload,
            ctx.signal,
            ctx.dryRun,
          );

          if (archiveRes.success) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: 201,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              error: archiveRes.error,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          operationId: op.id,
          status: 'failed',
          error: msg,
          completedAt: new Date().toISOString(),
        });
        if (!ctx.continueOnError) break;
      }
    }

    const hasFailed = results.some((r) => r.status === 'failed');
    const hasSucceeded = results.some((r) => r.status === 'succeeded');
    let overallStatus: ModuleExecutionResult['status'];

    if (!hasFailed && hasSucceeded) {
      overallStatus = 'complete';
    } else if (hasFailed && hasSucceeded) {
      overallStatus = 'partial';
    } else if (hasFailed && !hasSucceeded) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'skipped';
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: overallStatus,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verifies destination repository has recreated open PRs and archive record.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    let targetPulls: RawApiPullRequest[] = [];
    try {
      const tpRes = await ctx.targetClient.fetchAll<RawApiPullRequest>(
        {
          id: 'rest.pulls.listTargetPulls',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/pulls',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (tpRes?.items) targetPulls = [...tpRes.items];
    } catch {
      // In offline harness
    }

    let archiveFound = false;
    try {
      const issuesRes = await ctx.targetClient.fetchAll<{
        title: string;
      }>(
        {
          id: 'rest.issues.listTargetIssues',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/issues',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (issuesRes?.items) {
        archiveFound = issuesRes.items.some(
          (i) =>
            i.title.toLowerCase() ===
            'Historical Pull Requests Archive'.toLowerCase(),
        );
      }
    } catch {
      // In offline harness
    }

    const targetPullTitles = new Set(
      targetPulls.map((p) => p.title.toLowerCase()),
    );

    for (const action of plan.operations) {
      if (action.operation !== 'create') continue;

      if (action.resourceType === 'pull-request') {
        const payload = action.payload as CreatePullRequestPayload;
        if (!targetPullTitles.has(payload.title.toLowerCase())) {
          discrepancies.push({
            resourceName: action.resourceName,
            expected: payload.title,
            actual: null,
            message: `Target repository is missing open pull request: ${action.resourceName}`,
          });
        }
      } else if (action.resourceType === 'pull-requests-archive') {
        if (!archiveFound) {
          discrepancies.push({
            resourceName: 'Historical Pull Requests Archive',
            expected: 'present',
            actual: 'missing',
            message:
              'Target repository is missing historical pull requests archive issue.',
          });
        }
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
