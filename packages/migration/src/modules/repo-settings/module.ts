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
import { diffRepoSettings, parsePullRequestSettings } from './pr-settings.js';
import type {
  RawGitHubRepositoryResponse,
  RepoSettingsData,
  RepoSettingsModuleOptions,
  RepositoryVisibility,
} from './types.js';
import {
  determineTargetVisibility,
  normalizeVisibility,
} from './visibility.js';

export class RepoSettingsMigrationModule implements MigrationModule<RepoSettingsData> {
  readonly id = 'repo-settings';
  readonly displayName = 'Repository Visibility & PR Settings Reconciliation';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  constructor(private readonly options: RepoSettingsModuleOptions = {}) {}

  /**
   * Discovers source repository visibility and PR merge settings.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<RepoSettingsData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'RepoSettingsMigrationModule requires sourceRepo in migration context.',
      );
    }

    // 1. Cached discovery bundle mode
    if (cachedData) {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const repoEntity = bundle.entities.find(
          (e) => e.kind === 'repository' && e.name === repo,
        ) as
          | (Record<string, unknown> & { kind: string; name: string })
          | undefined;

        if (repoEntity) {
          const rawVisibility = repoEntity.visibility as string | undefined;
          const isPrivate = repoEntity.isPrivate as boolean | undefined;
          const visibility = normalizeVisibility(rawVisibility, isPrivate);

          const rawPr: RawGitHubRepositoryResponse = {
            allow_squash_merge: repoEntity.allowSquashMerge as
              boolean | undefined,
            allow_merge_commit: repoEntity.allowMergeCommit as
              boolean | undefined,
            allow_rebase_merge: repoEntity.allowRebaseMerge as
              boolean | undefined,
            allow_auto_merge: repoEntity.allowAutoMerge as boolean | undefined,
            delete_branch_on_merge: repoEntity.deleteBranchOnMerge as
              boolean | undefined,
            allow_update_branch: repoEntity.allowUpdateBranch as
              boolean | undefined,
            squash_merge_commit_title: repoEntity.squashMergeCommitTitle as
              string | undefined,
            squash_merge_commit_message: repoEntity.squashMergeCommitMessage as
              string | undefined,
            merge_commit_title: repoEntity.mergeCommitTitle as
              string | undefined,
            merge_commit_message: repoEntity.mergeCommitMessage as
              string | undefined,
          };

          return {
            owner: ctx.scope.sourceOrg,
            repo,
            visibility,
            prSettings: parsePullRequestSettings(rawPr),
          };
        }
      }
    }

    // 2. Live GitHub API mode
    const res = await ctx.sourceClient.readSingle<RawGitHubRepositoryResponse>(
      {
        id: 'rest.repos.get',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}',
        pathParams: { owner: ctx.scope.sourceOrg, repo },
      },
      ctx.signal,
    );

    if (res.status !== 200 || !res.data) {
      throw new Error(
        `Failed to discover repository settings for ${ctx.scope.sourceOrg}/${repo}: HTTP ${res.status}`,
      );
    }

    const raw = res.data;
    const visibility = normalizeVisibility(raw.visibility, raw.private);
    const prSettings = parsePullRequestSettings(raw);

    return {
      owner: ctx.scope.sourceOrg,
      repo,
      visibility,
      prSettings,
      features: {
        hasIssues: raw.has_issues,
        hasProjects: raw.has_projects,
        hasWiki: raw.has_wiki,
      },
    };
  }

  /**
   * Plans reconciliation operations for repository visibility and PR merge settings.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: RepoSettingsData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetOrg = ctx.scope.targetOrg;
    const targetIdentifier = `${targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    const desiredVisibility = determineTargetVisibility(
      sourceData.visibility,
      this.options,
    );
    const desiredPr = sourceData.prSettings;

    // Fetch target repository current state
    let targetVisibility: RepositoryVisibility = 'private'; // GEI default
    let targetPr = parsePullRequestSettings({});

    try {
      const res =
        await ctx.targetClient.readSingle<RawGitHubRepositoryResponse>(
          {
            id: 'rest.repos.getTarget',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}',
            pathParams: { owner: targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );

      if (res.status === 200 && res.data) {
        targetVisibility = normalizeVisibility(
          res.data.visibility,
          res.data.private,
        );
        targetPr = parsePullRequestSettings(res.data);
      }
    } catch {
      warnings.push(
        `Could not query target repository settings on ${targetIdentifier}; assuming GEI defaults (private).`,
      );
    }

    const diff = diffRepoSettings(
      desiredVisibility,
      targetVisibility,
      desiredPr,
      targetPr,
    );

    const opId = `repo-settings:${targetRepo}`;

    if (diff.hasChanges) {
      operations.push({
        id: opId,
        resourceType: 'repository-settings',
        resourceName: targetIdentifier,
        operation: 'update',
        sourceState: {
          visibility: sourceData.visibility,
          prSettings: sourceData.prSettings,
        },
        destinationCurrentState: {
          visibility: targetVisibility,
          prSettings: targetPr,
        },
        payload: diff.patchPayload,
        reason: `Reconcile repository settings: ${diff.changeDescriptions.join(', ')}`,
      });
    } else {
      operations.push({
        id: opId,
        resourceType: 'repository-settings',
        resourceName: targetIdentifier,
        operation: 'noop',
        sourceState: {
          visibility: sourceData.visibility,
          prSettings: sourceData.prSettings,
        },
        destinationCurrentState: {
          visibility: targetVisibility,
          prSettings: targetPr,
        },
      });
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier,
      operations,
      warnings,
    };
  }

  /**
   * Applies planned repository settings and visibility updates.
   */
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const results: OperationExecutionResult[] = [];

    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'noop') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `[DRY-RUN] Simulating repository settings reconciliation on ${op.resourceName}`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      const payload = (op.payload as Record<string, unknown>) ?? {};
      let res:
        | { status: number; data?: RawGitHubRepositoryResponse | undefined }
        | undefined;
      let is422 = false;
      let failureError: string | undefined;

      try {
        res = await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
          {
            id: 'rest.repos.update',
            method: 'PATCH',
            path: '/repos/{owner}/{repo}',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
            body: payload,
          },
          ctx.signal,
        );

        if (res.status === 422) {
          is422 = true;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStatus = (err as { status?: number })?.status;
        failureError = errMsg;
        if (
          errStatus === 422 ||
          errMsg.includes('HTTP 422') ||
          errMsg.includes('Public repositories are not permitted')
        ) {
          is422 = true;
        }
      }

      if (res && res.status >= 200 && res.status < 300) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: res.status,
          completedAt: new Date().toISOString(),
        });
      } else if (is422 && payload.visibility === 'public') {
        // Enterprise policy violation fallback check:
        // An EMU enterprise may disallow public repositories.
        if (this.options.enforceInternalForPublic !== false) {
          ctx.logger.warn(
            `Target enterprise policy disallows public visibility on ${targetRepo}. Attempting fallback to 'internal'...`,
          );

          try {
            const fallbackPayload = { ...payload, visibility: 'internal' };
            const fallbackRes =
              await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
                {
                  id: 'rest.repos.updateFallback',
                  method: 'PATCH',
                  path: '/repos/{owner}/{repo}',
                  pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                  body: fallbackPayload,
                },
                ctx.signal,
              );

            if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
              ctx.logger.warn(
                `Successfully reconciled ${targetRepo} visibility as 'internal' due to enterprise policy constraints.`,
              );
              results.push({
                operationId: op.id,
                status: 'succeeded',
                httpStatus: fallbackRes.status,
                completedAt: new Date().toISOString(),
              });
              continue;
            }
          } catch (fallbackErr) {
            ctx.logger.warn(
              `Fallback to internal visibility for ${targetRepo} failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
            );
          }
        }

        results.push({
          operationId: op.id,
          status: 'failed',
          httpStatus: 422,
          error: `GitHub enterprise policy prohibits public visibility on ${targetRepo}.`,
          completedAt: new Date().toISOString(),
        });
        if (!ctx.continueOnError) break;
      } else {
        results.push({
          operationId: op.id,
          status: 'failed',
          httpStatus: res?.status,
          error: failureError ?? `GitHub API error (HTTP ${res?.status})`,
          completedAt: new Date().toISOString(),
        });
        if (!ctx.continueOnError) break;
      }
    }

    const hasFailures = results.some((r) => r.status === 'failed');
    const hasSuccesses = results.some((r) => r.status === 'succeeded');
    const status = hasFailures
      ? hasSuccesses
        ? 'partial'
        : 'failed'
      : 'complete';

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verifies destination repository visibility and PR merge settings against planned state.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg;
    const discrepancies: VerificationDiscrepancy[] = [];

    let currentRepoData: RawGitHubRepositoryResponse | undefined;

    try {
      const res =
        await ctx.targetClient.readSingle<RawGitHubRepositoryResponse>(
          {
            id: 'rest.repos.verifyGet',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}',
            pathParams: { owner: targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );

      if (res.status === 200 && res.data) {
        currentRepoData = res.data;
      }
    } catch {
      discrepancies.push({
        resourceName: `${targetOrg}/${targetRepo}`,
        expected: 'Accessible target repository',
        actual: 'Query failed or repository inaccessible',
        message: 'Could not fetch repository to verify settings.',
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    if (!currentRepoData) {
      discrepancies.push({
        resourceName: `${targetOrg}/${targetRepo}`,
        expected: 'Repository data',
        actual: 'No repository data returned',
        message: 'Target repository was not found.',
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const actualVisibility = normalizeVisibility(
      currentRepoData.visibility,
      currentRepoData.private,
    );
    const actualPr = parsePullRequestSettings(currentRepoData);

    for (const op of plan.operations) {
      if (op.operation === 'noop' || op.operation === 'update') {
        const payload = (op.payload as Record<string, unknown>) ?? {};
        const expectedVisibility =
          (payload.visibility as RepositoryVisibility | undefined) ??
          (op.sourceState as { visibility?: RepositoryVisibility } | undefined)
            ?.visibility ??
          'private';

        if (actualVisibility !== expectedVisibility) {
          // Check if fallback to internal was accepted
          const allowedFallback =
            expectedVisibility === 'public' && actualVisibility === 'internal';
          if (!allowedFallback) {
            discrepancies.push({
              resourceName: `${op.resourceName} (visibility)`,
              expected: expectedVisibility,
              actual: actualVisibility,
              message: `Visibility mismatch: expected "${expectedVisibility}", found "${actualVisibility}".`,
            });
          }
        }

        // Check PR settings
        if (
          payload.allow_squash_merge !== undefined &&
          actualPr.allowSquashMerge !== payload.allow_squash_merge
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (allow_squash_merge)`,
            expected: payload.allow_squash_merge,
            actual: actualPr.allowSquashMerge,
            message: `allow_squash_merge mismatch: expected ${payload.allow_squash_merge}, got ${actualPr.allowSquashMerge}.`,
          });
        }

        if (
          payload.allow_merge_commit !== undefined &&
          actualPr.allowMergeCommit !== payload.allow_merge_commit
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (allow_merge_commit)`,
            expected: payload.allow_merge_commit,
            actual: actualPr.allowMergeCommit,
            message: `allow_merge_commit mismatch: expected ${payload.allow_merge_commit}, got ${actualPr.allowMergeCommit}.`,
          });
        }

        if (
          payload.delete_branch_on_merge !== undefined &&
          actualPr.deleteBranchOnMerge !== payload.delete_branch_on_merge
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (delete_branch_on_merge)`,
            expected: payload.delete_branch_on_merge,
            actual: actualPr.deleteBranchOnMerge,
            message: `delete_branch_on_merge mismatch: expected ${payload.delete_branch_on_merge}, got ${actualPr.deleteBranchOnMerge}.`,
          });
        }

        if (
          payload.squash_merge_commit_title !== undefined &&
          actualPr.squashMergeCommitTitle !== payload.squash_merge_commit_title
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (squash_merge_commit_title)`,
            expected: payload.squash_merge_commit_title,
            actual: actualPr.squashMergeCommitTitle,
            message: `squash_merge_commit_title mismatch: expected "${payload.squash_merge_commit_title}", got "${actualPr.squashMergeCommitTitle}".`,
          });
        }

        if (
          payload.squash_merge_commit_message !== undefined &&
          actualPr.squashMergeCommitMessage !==
            payload.squash_merge_commit_message
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (squash_merge_commit_message)`,
            expected: payload.squash_merge_commit_message,
            actual: actualPr.squashMergeCommitMessage,
            message: `squash_merge_commit_message mismatch: expected "${payload.squash_merge_commit_message}", got "${actualPr.squashMergeCommitMessage}".`,
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
