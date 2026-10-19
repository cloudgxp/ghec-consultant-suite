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
import {
  diffRepoSettings,
  parseCoreMetadata,
  parseFeatureSettings,
  parsePullRequestSettings,
} from './pr-settings.js';
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
            features: {
              hasIssues: repoEntity.hasIssues as boolean | undefined,
              hasProjects: repoEntity.hasProjects as boolean | undefined,
              hasWiki: repoEntity.hasWiki as boolean | undefined,
              hasDiscussions: repoEntity.hasDiscussions as boolean | undefined,
            },
            metadata: {
              description:
                (repoEntity.description as string | undefined) ?? undefined,
              homepage:
                (repoEntity.homepage as string | undefined) ?? undefined,
              defaultBranch:
                (repoEntity.defaultBranch as string | undefined) ?? undefined,
              archived:
                repoEntity.archived !== undefined &&
                repoEntity.archived !== null
                  ? Boolean(repoEntity.archived)
                  : undefined,
            },
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
    const features = parseFeatureSettings(raw);
    const metadata = parseCoreMetadata(raw);

    return {
      owner: ctx.scope.sourceOrg,
      repo,
      visibility,
      prSettings,
      features,
      metadata,
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

    const effectiveOptions: RepoSettingsModuleOptions = {
      ...this.options,
      ...(this.options.enforceInternalForPublic === undefined &&
      ctx.scope.targetType === 'ghec'
        ? { enforceInternalForPublic: false }
        : {}),
      ...(this.options.visibilityOverride === undefined &&
      ctx.scope.options?.targetRepoVisibility !== undefined
        ? { visibilityOverride: ctx.scope.options.targetRepoVisibility }
        : {}),
    };
    const desiredVisibility = determineTargetVisibility(
      sourceData.visibility,
      effectiveOptions,
    );
    const desiredPr = sourceData.prSettings;
    const desiredFeatures = sourceData.features;
    const desiredMetadata = sourceData.metadata;

    // Fetch target repository current state
    let targetVisibility: RepositoryVisibility = 'private'; // GEI default
    let targetPr = parsePullRequestSettings({});
    let targetFeatures = parseFeatureSettings({});
    let targetMetadata = parseCoreMetadata({});

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
        targetFeatures = parseFeatureSettings(res.data);
        targetMetadata = parseCoreMetadata(res.data);
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
      desiredFeatures,
      targetFeatures,
      desiredMetadata,
      targetMetadata,
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
          features: sourceData.features,
          metadata: sourceData.metadata,
        },
        destinationCurrentState: {
          visibility: targetVisibility,
          prSettings: targetPr,
          features: targetFeatures,
          metadata: targetMetadata,
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
          features: sourceData.features,
          metadata: sourceData.metadata,
        },
        destinationCurrentState: {
          visibility: targetVisibility,
          prSettings: targetPr,
          features: targetFeatures,
          metadata: targetMetadata,
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

      const rawPayload = (op.payload as Record<string, unknown>) ?? {};
      const wantsArchive = rawPayload.archived === true;
      const shouldDeferArchive = Boolean(ctx.deferArchiving) && wantsArchive;

      const payload: Record<string, unknown> = { ...rawPayload };
      if (wantsArchive) {
        // Always apply non-archive settings while unarchived (archived: false) so GitHub does not
        // reject mutations with 403 Repository was archived so is read-only.
        payload.archived = false;
      }
      if (shouldDeferArchive && payload.has_issues === false) {
        // Keep issues enabled until finalization so downstream pull-requests module can create
        // its Historical Pull Requests Archive issue before archiving.
        payload.has_issues = true;
      }

      let res:
        | { status: number; data?: RawGitHubRepositoryResponse | undefined }
        | undefined;
      let is422 = false;
      let failureError: string | undefined;

      const patchTargetRepo = async (
        id: string,
        body: Record<string, unknown>,
      ): Promise<{
        status: number;
        data?: RawGitHubRepositoryResponse | undefined;
      }> => {
        try {
          const r =
            await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
              {
                id,
                method: 'PATCH',
                path: '/repos/{owner}/{repo}',
                pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                body,
              },
              ctx.signal,
            );
          if (r.status === 403 && body.archived !== false) {
            await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
              {
                id: `${id}.unarchive`,
                method: 'PATCH',
                path: '/repos/{owner}/{repo}',
                pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                body: { archived: false },
              },
              ctx.signal,
            );
            return await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
              {
                id: `${id}.retryAfterUnarchive`,
                method: 'PATCH',
                path: '/repos/{owner}/{repo}',
                pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                body,
              },
              ctx.signal,
            );
          }
          return r;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const status = (err as { status?: number })?.status;
          if (
            body.archived !== false &&
            (status === 403 ||
              msg.includes('HTTP 403') ||
              msg.toLowerCase().includes('archived'))
          ) {
            await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
              {
                id: `${id}.unarchiveOnCatch`,
                method: 'PATCH',
                path: '/repos/{owner}/{repo}',
                pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                body: { archived: false },
              },
              ctx.signal,
            );
            return await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
              {
                id: `${id}.retryOnCatch`,
                method: 'PATCH',
                path: '/repos/{owner}/{repo}',
                pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                body,
              },
              ctx.signal,
            );
          }
          throw err;
        }
      };

      try {
        const nonArchiveKeys = Object.keys(payload).filter(
          (k) => k !== 'archived',
        );
        if (nonArchiveKeys.length > 0 || shouldDeferArchive || !wantsArchive) {
          res = await patchTargetRepo('rest.repos.update', payload);
          if (res.status === 422) {
            is422 = true;
          }
        } else {
          res = { status: 200 };
        }

        if (
          wantsArchive &&
          !shouldDeferArchive &&
          res &&
          res.status >= 200 &&
          res.status < 300
        ) {
          res =
            await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
              {
                id: 'rest.repos.archiveFinal',
                method: 'PATCH',
                path: '/repos/{owner}/{repo}',
                pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
                body: { archived: true },
              },
              ctx.signal,
            );
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
            const fallbackRes = await patchTargetRepo(
              'rest.repos.updateFallback',
              fallbackPayload,
            );

            if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
              if (wantsArchive && !shouldDeferArchive) {
                await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
                  {
                    id: 'rest.repos.archiveFallbackFinal',
                    method: 'PATCH',
                    path: '/repos/{owner}/{repo}',
                    pathParams: {
                      owner: ctx.scope.targetOrg,
                      repo: targetRepo,
                    },
                    body: { archived: true },
                  },
                  ctx.signal,
                );
              }
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
              `Fallback to internal visibility for ${targetRepo} failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}. Retrying with sanitized PR settings...`,
            );
            try {
              const sanitizedPayload: Record<string, unknown> = {
                ...payload,
                visibility: 'internal',
              };
              delete sanitizedPayload.squash_merge_commit_title;
              delete sanitizedPayload.squash_merge_commit_message;
              delete sanitizedPayload.merge_commit_title;
              delete sanitizedPayload.merge_commit_message;
              delete sanitizedPayload.allow_auto_merge;
              const retryRes = await patchTargetRepo(
                'rest.repos.updateSanitizedFallback',
                sanitizedPayload,
              );
              if (retryRes.status >= 200 && retryRes.status < 300) {
                if (wantsArchive && !shouldDeferArchive) {
                  await ctx.targetWriteClient!.mutate<RawGitHubRepositoryResponse>(
                    {
                      id: 'rest.repos.archiveSanitizedFinal',
                      method: 'PATCH',
                      path: '/repos/{owner}/{repo}',
                      pathParams: {
                        owner: ctx.scope.targetOrg,
                        repo: targetRepo,
                      },
                      body: { archived: true },
                    },
                    ctx.signal,
                  );
                }
                results.push({
                  operationId: op.id,
                  status: 'succeeded',
                  httpStatus: retryRes.status,
                  completedAt: new Date().toISOString(),
                });
                continue;
              }
            } catch {
              // Ignore secondary fallback error
            }
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
          // Check if fallback to internal or private was accepted for public source repos in EMU
          const allowedFallback =
            expectedVisibility === 'public' &&
            (actualVisibility === 'internal' || actualVisibility === 'private');
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
          actualPr.allowSquashMerge !== false &&
          payload.squash_merge_commit_title !== undefined &&
          actualPr.squashMergeCommitTitle !== payload.squash_merge_commit_title
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (squash_merge_commit_title)`,
            expected: payload.squash_merge_commit_title,
            actual: actualPr.squashMergeCommitTitle ?? null,
            message: `squash_merge_commit_title mismatch: expected "${payload.squash_merge_commit_title}", got "${actualPr.squashMergeCommitTitle}".`,
          });
        }

        if (
          actualPr.allowSquashMerge !== false &&
          payload.squash_merge_commit_message !== undefined &&
          actualPr.squashMergeCommitMessage !==
            payload.squash_merge_commit_message
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (squash_merge_commit_message)`,
            expected: payload.squash_merge_commit_message,
            actual: actualPr.squashMergeCommitMessage ?? null,
            message: `squash_merge_commit_message mismatch: expected "${payload.squash_merge_commit_message}", got "${actualPr.squashMergeCommitMessage}".`,
          });
        }

        const actualFeatures = parseFeatureSettings(currentRepoData);
        const actualMetadata = parseCoreMetadata(currentRepoData);

        if (
          payload.has_issues !== undefined &&
          actualFeatures.hasIssues !== payload.has_issues
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (has_issues)`,
            expected: payload.has_issues,
            actual: actualFeatures.hasIssues ?? null,
            message: `has_issues mismatch: expected ${payload.has_issues}, got ${actualFeatures.hasIssues}.`,
          });
        }

        if (
          payload.has_projects !== undefined &&
          actualFeatures.hasProjects !== payload.has_projects
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (has_projects)`,
            expected: payload.has_projects,
            actual: actualFeatures.hasProjects ?? null,
            message: `has_projects mismatch: expected ${payload.has_projects}, got ${actualFeatures.hasProjects}.`,
          });
        }

        if (
          payload.has_wiki !== undefined &&
          actualFeatures.hasWiki !== payload.has_wiki
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (has_wiki)`,
            expected: payload.has_wiki,
            actual: actualFeatures.hasWiki ?? null,
            message: `has_wiki mismatch: expected ${payload.has_wiki}, got ${actualFeatures.hasWiki}.`,
          });
        }

        if (
          payload.has_discussions !== undefined &&
          actualFeatures.hasDiscussions !== payload.has_discussions
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (has_discussions)`,
            expected: payload.has_discussions,
            actual: actualFeatures.hasDiscussions ?? null,
            message: `has_discussions mismatch: expected ${payload.has_discussions}, got ${actualFeatures.hasDiscussions}.`,
          });
        }

        if (
          payload.description !== undefined &&
          actualMetadata.description !== payload.description
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (description)`,
            expected: payload.description,
            actual: actualMetadata.description ?? null,
            message: `description mismatch: expected "${payload.description}", got "${actualMetadata.description ?? ''}".`,
          });
        }

        if (
          payload.homepage !== undefined &&
          actualMetadata.homepage !== payload.homepage
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (homepage)`,
            expected: payload.homepage,
            actual: actualMetadata.homepage ?? null,
            message: `homepage mismatch: expected "${payload.homepage}", got "${actualMetadata.homepage ?? ''}".`,
          });
        }

        if (
          payload.default_branch !== undefined &&
          actualMetadata.defaultBranch !== payload.default_branch
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (default_branch)`,
            expected: payload.default_branch,
            actual: actualMetadata.defaultBranch ?? null,
            message: `default_branch mismatch: expected "${payload.default_branch}", got "${actualMetadata.defaultBranch ?? ''}".`,
          });
        }

        const expectedArchived =
          (payload.archived as boolean | undefined) ??
          (op.sourceState as { metadata?: { archived?: boolean } } | undefined)
            ?.metadata?.archived;
        if (
          expectedArchived !== undefined &&
          Boolean(actualMetadata.archived) !== expectedArchived
        ) {
          discrepancies.push({
            resourceName: `${op.resourceName} (archived)`,
            expected: expectedArchived,
            actual: Boolean(actualMetadata.archived),
            message: `Repository archived status mismatch: expected ${expectedArchived}, got ${Boolean(actualMetadata.archived)}.`,
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
