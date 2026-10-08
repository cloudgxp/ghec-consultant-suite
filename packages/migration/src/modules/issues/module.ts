import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
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
import { executeIssueImport } from './issue-importer.js';
import type {
  IssueImportPayload,
  IssuesMigrationData,
  MigrationIssue,
  MigrationIssueComment,
  MigrationLabel,
  MigrationMilestone,
  RawApiIssue,
  RawApiIssueComment,
  RawApiLabel,
  RawApiMilestone,
} from './types.js';

function mapApiMilestone(raw: RawApiMilestone): MigrationMilestone {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    description: raw.description,
    state: raw.state === 'closed' ? 'closed' : 'open',
    dueOn: raw.due_on,
  };
}

function mapApiLabel(raw: RawApiLabel | string): MigrationLabel {
  if (typeof raw === 'string') {
    return { name: raw, color: 'ededed' };
  }
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color || 'ededed',
    description: raw.description,
  };
}

function mapApiComment(raw: RawApiIssueComment): MigrationIssueComment {
  return {
    id: raw.id,
    body: raw.body,
    createdAt: raw.created_at,
    user: raw.user ? { login: raw.user.login } : undefined,
  };
}

function mapApiIssue(
  raw: RawApiIssue,
  comments: readonly MigrationIssueComment[] = [],
): MigrationIssue {
  const labels: MigrationLabel[] = Array.isArray(raw.labels)
    ? raw.labels.map(mapApiLabel)
    : [];

  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    state: raw.state === 'closed' ? 'closed' : 'open',
    createdAt: raw.created_at,
    closedAt: raw.closed_at,
    user: raw.user ? { login: raw.user.login } : undefined,
    milestone: raw.milestone ? mapApiMilestone(raw.milestone) : undefined,
    labels,
    comments,
  };
}

export class IssuesMigrationModule implements MigrationModule<IssuesMigrationData> {
  readonly id = 'issues';
  readonly displayName = 'Issues & Milestones Migration';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  /**
   * Discovers milestones, labels, issues, and comments from source repository.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<IssuesMigrationData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'IssuesMigrationModule requires sourceRepo in migration context.',
      );
    }

    // 1. Cached discovery bundle mode
    if (cachedData && typeof cachedData === 'object') {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const repoEntity = bundle.entities.find(
          (e) => e.kind === 'repository' && e.name === repo,
        );
        if (repoEntity && 'issues' in repoEntity) {
          const custom = repoEntity as unknown as {
            milestones?: RawApiMilestone[];
            labels?: RawApiLabel[];
            issues?: RawApiIssue[];
          };
          return {
            repo,
            milestones: (custom.milestones ?? []).map(mapApiMilestone),
            labels: (custom.labels ?? []).map(mapApiLabel),
            issues: (custom.issues ?? [])
              .filter((i) => !i.pull_request)
              .map((i) => mapApiIssue(i)),
          };
        }
      }
    }

    // 2. Live GitHub API mode
    let milestones: MigrationMilestone[] = [];
    try {
      const mRes = await ctx.sourceClient.fetchAll<RawApiMilestone>(
        {
          id: 'rest.issues.listMilestones',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/milestones',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (mRes?.items) {
        milestones = mRes.items.map(mapApiMilestone);
      }
    } catch (err: unknown) {
      ctx.logger.warn?.(
        `Failed to fetch milestones for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let labels: MigrationLabel[] = [];
    try {
      const lRes = await ctx.sourceClient.fetchAll<RawApiLabel>(
        {
          id: 'rest.issues.listLabels',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/labels',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );
      if (lRes?.items) {
        labels = lRes.items.map(mapApiLabel);
      }
    } catch (err: unknown) {
      ctx.logger.warn?.(
        `Failed to fetch labels for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let rawIssues: RawApiIssue[] = [];
    try {
      const iRes = await ctx.sourceClient.fetchAll<RawApiIssue>(
        {
          id: 'rest.issues.listIssues',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/issues',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
          queryParams: { state: 'all', filter: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (iRes?.items) {
        rawIssues = iRes.items.filter((i) => !i.pull_request);
      }
    } catch (err: unknown) {
      ctx.logger.warn?.(
        `Failed to fetch issues for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fetch comments for issues that have comments
    const issues: MigrationIssue[] = [];
    for (const rawIssue of rawIssues) {
      let comments: MigrationIssueComment[] = [];
      if (rawIssue.comments && rawIssue.comments > 0) {
        try {
          const cRes = await ctx.sourceClient.fetchAll<RawApiIssueComment>(
            {
              id: 'rest.issues.listComments',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}/issues/{issue_number}/comments',
              pathParams: {
                owner: ctx.scope.sourceOrg,
                repo,
                issue_number: String(rawIssue.number),
              },
              queryParams: { per_page: 100 },
            },
            ctx.signal,
          );
          if (cRes?.items) {
            comments = cRes.items.map(mapApiComment);
          }
        } catch {
          // If comments fetch fails, continue with issue metadata
        }
      }
      issues.push(mapApiIssue(rawIssue, comments));
    }

    return {
      repo,
      milestones,
      labels,
      issues,
    };
  }

  /**
   * Plans creation of missing milestones, labels, and issues at target.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: IssuesMigrationData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const operations: PlannedOperation[] = [];

    // Query target repository
    let targetMilestones: RawApiMilestone[] = [];
    let targetLabels: RawApiLabel[] = [];
    let targetIssues: RawApiIssue[] = [];

    try {
      const tmRes = await ctx.targetClient.fetchAll<RawApiMilestone>(
        {
          id: 'rest.issues.listMilestones',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/milestones',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (tmRes?.items) targetMilestones = [...tmRes.items];
    } catch {
      // Repository may not exist or be empty
    }

    try {
      const tlRes = await ctx.targetClient.fetchAll<RawApiLabel>(
        {
          id: 'rest.issues.listLabels',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/labels',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );
      if (tlRes?.items) targetLabels = [...tlRes.items];
    } catch {
      // Repository may not exist or be empty
    }

    try {
      const tiRes = await ctx.targetClient.fetchAll<RawApiIssue>(
        {
          id: 'rest.issues.listIssues',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/issues',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', filter: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (tiRes?.items) {
        targetIssues = tiRes.items.filter((i) => !i.pull_request);
      }
    } catch {
      // Repository may not exist or be empty
    }

    // 1. Plan Labels
    const targetLabelNames = new Set(
      targetLabels.map((l) => l.name.toLowerCase()),
    );
    for (const label of sourceData.labels) {
      const exists = targetLabelNames.has(label.name.toLowerCase());
      operations.push({
        id: `label:${label.name}`,
        resourceType: 'issue-label',
        resourceName: label.name,
        operation: exists ? 'noop' : 'create',
        reason: exists
          ? `Label "${label.name}" already exists on target.`
          : `Create label "${label.name}".`,
        payload: {
          name: label.name,
          color: label.color,
          description: label.description,
        },
      });
    }

    // 2. Plan Milestones
    const targetMilestoneTitles = new Set(
      targetMilestones.map((m) => m.title.toLowerCase()),
    );
    for (const milestone of sourceData.milestones) {
      const exists = targetMilestoneTitles.has(milestone.title.toLowerCase());
      operations.push({
        id: `milestone:${milestone.title}`,
        resourceType: 'issue-milestone',
        resourceName: milestone.title,
        operation: exists ? 'noop' : 'create',
        reason: exists
          ? `Milestone "${milestone.title}" already exists on target.`
          : `Create milestone "${milestone.title}".`,
        payload: {
          sourceNumber: milestone.number,
          title: milestone.title,
          state: milestone.state,
          description: milestone.description,
          due_on: milestone.dueOn,
        },
      });
    }

    // 3. Plan Issues
    const targetIssueTitles = new Set(
      targetIssues.map((i) => i.title.toLowerCase()),
    );
    for (const issue of sourceData.issues) {
      const exists = targetIssueTitles.has(issue.title.toLowerCase());
      const importPayload: IssueImportPayload = {
        issue: {
          title: issue.title,
          body: issue.body ?? '',
          created_at: issue.createdAt,
          closed: issue.state === 'closed',
          closed_at: issue.closedAt ?? undefined,
          labels: issue.labels.map((l) => l.name),
          milestone: issue.milestone?.number,
        },
        comments: issue.comments.map((c) => ({
          created_at: c.createdAt,
          body: c.body,
        })),
      };

      operations.push({
        id: `issue:${issue.number}`,
        resourceType: 'issue',
        resourceName: `#${issue.number} ${issue.title}`,
        operation: exists ? 'noop' : 'create',
        reason: exists
          ? `Issue #${issue.number} "${issue.title}" already exists on target.`
          : `Import issue #${issue.number} "${issue.title}".`,
        payload: importPayload,
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
   * Applies planned label creations, milestone creations, and issue imports.
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
    const milestoneNumberMap = new Map<number, number>();

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
        if (op.resourceType === 'issue-label' && op.operation === 'create') {
          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.issues.createLabel',
              method: 'POST',
              path: '/repos/{owner}/{repo}/labels',
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
              body: op.payload,
            },
            ctx.signal,
          );

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (
          op.resourceType === 'issue-milestone' &&
          op.operation === 'create'
        ) {
          const rawPayload = op.payload as {
            sourceNumber: number;
            title: string;
            state?: string;
            description?: string;
            due_on?: string;
          };

          const res = await ctx.targetWriteClient!.mutate<{ number: number }>(
            {
              id: 'rest.issues.createMilestone',
              method: 'POST',
              path: '/repos/{owner}/{repo}/milestones',
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
              body: {
                title: rawPayload.title,
                state: rawPayload.state,
                description: rawPayload.description,
                due_on: rawPayload.due_on,
              },
            },
            ctx.signal,
          );

          if (res.data?.number) {
            milestoneNumberMap.set(rawPayload.sourceNumber, res.data.number);
          }

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (op.resourceType === 'issue' && op.operation === 'create') {
          const importPayload = op.payload as IssueImportPayload;
          const remappedPayload: IssueImportPayload = {
            ...importPayload,
            issue: {
              ...importPayload.issue,
              milestone:
                importPayload.issue.milestone !== undefined
                  ? (milestoneNumberMap.get(importPayload.issue.milestone) ??
                    importPayload.issue.milestone)
                  : undefined,
            },
          };

          const importRes = await executeIssueImport(
            ctx.targetWriteClient!,
            ctx.scope.targetOrg,
            targetRepo,
            remappedPayload,
            ctx.signal,
            ctx.dryRun,
          );

          if (importRes.success) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: importRes.status,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: importRes.status,
              error: importRes.error,
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
   * Verifies destination repository has issues, labels, and milestones matching source plan.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    let targetLabels: RawApiLabel[] = [];
    let targetMilestones: RawApiMilestone[] = [];
    let targetIssues: RawApiIssue[] = [];

    try {
      const lRes = await ctx.targetClient.fetchAll<RawApiLabel>(
        {
          id: 'rest.issues.listLabels',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/labels',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );
      if (lRes?.items) targetLabels = [...lRes.items];
    } catch {
      // In offline harness or if repo is not found
    }

    try {
      const mRes = await ctx.targetClient.fetchAll<RawApiMilestone>(
        {
          id: 'rest.issues.listMilestones',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/milestones',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (mRes?.items) targetMilestones = [...mRes.items];
    } catch {
      // In offline harness or if repo is not found
    }

    try {
      const iRes = await ctx.targetClient.fetchAll<RawApiIssue>(
        {
          id: 'rest.issues.listIssues',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/issues',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { state: 'all', filter: 'all', per_page: 100 },
        },
        ctx.signal,
      );
      if (iRes?.items) {
        targetIssues = iRes.items.filter((i) => !i.pull_request);
      }
    } catch {
      // In offline harness or if repo is not found
    }

    const targetLabelNames = new Set(
      targetLabels.map((l) => l.name.toLowerCase()),
    );
    const targetMilestoneTitles = new Set(
      targetMilestones.map((m) => m.title.toLowerCase()),
    );
    const targetIssueTitles = new Set(
      targetIssues.map((i) => i.title.toLowerCase()),
    );

    // Verify planned creations
    for (const action of plan.operations) {
      if (action.operation !== 'create') continue;

      if (action.resourceType === 'issue-label') {
        if (!targetLabelNames.has(action.resourceName.toLowerCase())) {
          discrepancies.push({
            resourceName: action.resourceName,
            expected: action.resourceName,
            actual: null,
            message: `Target repository is missing label "${action.resourceName}".`,
          });
        }
      } else if (action.resourceType === 'issue-milestone') {
        if (!targetMilestoneTitles.has(action.resourceName.toLowerCase())) {
          discrepancies.push({
            resourceName: action.resourceName,
            expected: action.resourceName,
            actual: null,
            message: `Target repository is missing milestone "${action.resourceName}".`,
          });
        }
      } else if (action.resourceType === 'issue') {
        const payload = action.payload as IssueImportPayload;
        if (!targetIssueTitles.has(payload.issue.title.toLowerCase())) {
          discrepancies.push({
            resourceName: action.resourceName,
            expected: payload.issue.title,
            actual: null,
            message: `Target repository is missing issue: ${action.resourceName}`,
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
