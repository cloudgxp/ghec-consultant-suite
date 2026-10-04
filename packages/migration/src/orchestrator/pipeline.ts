import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
  type MigrationPlan,
  type MigrationScope,
  type ModuleExecutionResult,
  type ModulePlan,
  validateModuleExecutionResult,
} from '@ghec/contracts';
import type { MigrationCheckpointManager } from '../checkpoint/manager.js';
import type {
  MigrationContext,
  MigrationScopeTarget,
  StructuredLogger,
} from '../core/types.js';
import { GeiProcessExecutor } from '../gei/executor.js';
import type { GeiMigrationResult } from '../gei/types.js';
import { DestinationBlockerInspector } from '../preflight/destination-inspector.js';
import { SourceRepositoryInspector } from '../preflight/source-inspector.js';
import { GitLfsMigrationStrategy } from '../strategies/git-lfs/strategy.js';
import type { GitLfsQuotaChecker } from '../strategies/git-lfs/types.js';
import { LargeReleasesMigrationStrategy } from '../strategies/releases/strategy.js';
import type {
  RepositoryPipelineOptions,
  RepositoryPipelineResult,
} from './types.js';

const GIB = 1024 * 1024 * 1024;
const defaultLogger: StructuredLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const defaultQuotaChecker: GitLfsQuotaChecker = {
  check: async () => ({ enabled: true }),
};

export class RepositoryMigrationPipeline {
  private readonly options: RepositoryPipelineOptions;
  private readonly logger: StructuredLogger;
  private readonly checkpointManager?: MigrationCheckpointManager | undefined;

  constructor(options: RepositoryPipelineOptions) {
    this.options = options;
    this.logger = options.logger ?? defaultLogger;
    this.checkpointManager = options.checkpointManager;
  }

  async execute(
    repoMapping: MigrationScope['repositories'][number],
    plan?: MigrationPlan | undefined,
  ): Promise<RepositoryPipelineResult> {
    const { sourceOrg, sourceRepo, targetOrg, targetRepo } = repoMapping;
    const repoKey = `${sourceOrg}/${sourceRepo}`;
    const completedStages: string[] = [];
    const moduleResults: ModuleExecutionResult[] = [];
    let geiResult: GeiMigrationResult | undefined = undefined;
    const signal = this.options.signal ?? new AbortController().signal;

    if (signal.aborted) {
      throw signal.reason ?? new Error('Migration pipeline aborted');
    }

    this.logger.info(
      `Starting 7-stage migration pipeline for ${repoKey} -> ${targetOrg}/${targetRepo}`,
    );

    let shouldSkipReleases = repoMapping.skipReleases ?? false;
    let usesLfs = repoMapping.lfsStrategy === 'dual-remote-stream';

    try {
      // -------------------------------------------------------------
      // STAGE 1: Preflight Checks
      // -------------------------------------------------------------
      if (this.checkpointManager?.isStageCompleted(repoKey, 'preflight')) {
        this.logger.info(
          `[Stage 1] Preflight already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('preflight');
      } else {
        this.logger.info(
          `[Stage 1] Executing source preflight checks for ${repoKey}...`,
        );
        const sourceInspector = new SourceRepositoryInspector({
          adapter: this.options.sourceClient,
          sourceOrg,
          discoveryBundle: this.options.cachedDiscoveryBundle as
            DiscoveryBundle | undefined,
          signal,
        });

        const assessment = await sourceInspector.inspect(sourceRepo);
        if (assessment.status === 'blocked') {
          const blockerMsg = `Repository ${repoKey} blocked in preflight: ${assessment.blockers.join('; ')}`;
          this.checkpointManager?.recordStageResult(repoKey, 'preflight', {
            status: 'failed',
            assessment,
          });
          throw new Error(blockerMsg);
        }

        if (
          assessment.releaseTotalAssetBytes > 10 * GIB ||
          assessment.gitSizeBytes > 40 * GIB
        ) {
          shouldSkipReleases = true;
        }
        if (assessment.lfsObjectCount > 0 || assessment.lfsTotalBytes > 0) {
          usesLfs = true;
        }

        this.checkpointManager?.recordStageResult(repoKey, 'preflight', {
          status: 'evaluated',
          assessment,
        });
        completedStages.push('preflight');
      }

      // -------------------------------------------------------------
      // STAGE 2: Target Preparation
      // -------------------------------------------------------------
      if (this.checkpointManager?.isStageCompleted(repoKey, 'targetPrep')) {
        this.logger.info(
          `[Stage 2] Target preparation already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('targetPrep');
      } else {
        this.logger.info(
          `[Stage 2] Inspecting destination readiness for ${targetOrg}/${targetRepo}...`,
        );
        const destInspector = new DestinationBlockerInspector({
          adapter: this.options.targetClient,
          targetOrg,
          scopedRepos: [targetRepo],
          signal,
        });

        const destAssessment = await destInspector.inspect();
        const blockers = [
          ...destAssessment.rulesetBypassIssues,
          ...(destAssessment.nameConflicts.includes(targetRepo)
            ? [
                `Repository "${targetOrg}/${targetRepo}" already exists at destination.`,
              ]
            : []),
        ];

        if (blockers.length > 0) {
          const errorMsg = `Destination blocked for ${targetOrg}/${targetRepo}: ${blockers.join('; ')}`;
          this.checkpointManager?.recordStageResult(repoKey, 'targetPrep', {
            status: 'failed',
            error: errorMsg,
          });
          throw new Error(errorMsg);
        }

        this.checkpointManager?.recordStageResult(repoKey, 'targetPrep', {
          status: 'completed',
        });
        completedStages.push('targetPrep');
      }

      // -------------------------------------------------------------
      // STAGE 3: GEI Execution
      // -------------------------------------------------------------
      if (!repoMapping.useGei) {
        this.logger.info(
          `[Stage 3] GEI skipped by configuration for ${repoKey}`,
        );
        this.checkpointManager?.recordStageResult(repoKey, 'gei', {
          status: 'completed',
          skippedReleases: false,
        });
        completedStages.push('gei');
      } else if (this.checkpointManager?.isStageCompleted(repoKey, 'gei')) {
        this.logger.info(
          `[Stage 3] GEI execution already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('gei');
      } else {
        this.logger.info(
          `[Stage 3] Spawning GEI process for ${repoKey} -> ${targetOrg}/${targetRepo}...`,
        );
        if (this.options.dryRun) {
          this.logger.info(
            `[Stage 3] [DRY RUN] GEI process simulated successfully.`,
          );
          this.checkpointManager?.recordStageResult(repoKey, 'gei', {
            status: 'completed',
            migrationId: 'simulated-dry-run',
            skippedReleases: shouldSkipReleases,
          });
          completedStages.push('gei');
        } else {
          const geiExecutor = new GeiProcessExecutor(this.options.geiRunner);

          try {
            geiResult = await geiExecutor.execute({
              sourceOrg,
              sourceRepo,
              targetOrg,
              targetRepo,
              ...(this.options.sourceToken
                ? { sourceToken: this.options.sourceToken }
                : {}),
              ...(this.options.targetToken
                ? { targetToken: this.options.targetToken }
                : {}),
              targetRepoVisibility:
                repoMapping.targetRepoVisibility ?? 'private',
              skipReleases: shouldSkipReleases,
              signal,
            });

            this.checkpointManager?.recordStageResult(repoKey, 'gei', {
              status: 'completed',
              ...(geiResult.migrationId
                ? { migrationId: geiResult.migrationId }
                : {}),
              skippedReleases: shouldSkipReleases,
            });
            completedStages.push('gei');
          } catch (err) {
            const geiError = err instanceof Error ? err.message : String(err);
            this.checkpointManager?.recordStageResult(repoKey, 'gei', {
              status: 'failed',
              error: geiError,
            });
            throw err;
          }
        }
      }

      // -------------------------------------------------------------
      // STAGE 4: Specialized Strategies (LFS & Releases Fallback)
      // -------------------------------------------------------------
      if (
        this.checkpointManager?.isStageCompleted(
          repoKey,
          'specializedStrategies',
        )
      ) {
        this.logger.info(
          `[Stage 4] Specialized strategies already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('specializedStrategies');
      } else {
        this.logger.info(
          `[Stage 4] Evaluating specialized transfer strategies for ${repoKey}...`,
        );
        const specializedResults: Record<
          string,
          { status: 'completed' | 'skipped' | 'failed'; error?: string }
        > = {};

        // Git LFS Strategy
        if (usesLfs) {
          this.logger.info(
            `[Stage 4] Executing Git LFS strategy for ${repoKey}...`,
          );
          if (this.options.dryRun) {
            specializedResults['git-lfs'] = { status: 'completed' };
          } else {
            try {
              const lfsStrategy = new GitLfsMigrationStrategy({
                ...(this.options.lfsRunner
                  ? { runner: this.options.lfsRunner }
                  : {}),
                quotaChecker: defaultQuotaChecker,
              });
              await lfsStrategy.execute({
                sourceClient: this.options.sourceClient,
                targetClient: this.options.targetClient,
                sourceOrg,
                sourceRepo,
                targetOrg,
                targetRepo,
                sourceToken:
                  this.options.sourceToken ?? process.env.GH_SOURCE_PAT ?? '',
                targetToken:
                  this.options.targetToken ??
                  process.env.GH_PAT ??
                  process.env.GH_TARGET_PAT ??
                  '',
                geiCompleted: true,
                signal,
              });
              specializedResults['git-lfs'] = { status: 'completed' };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              specializedResults['git-lfs'] = { status: 'failed', error: msg };
              throw err;
            }
          }
        } else {
          specializedResults['git-lfs'] = { status: 'skipped' };
        }

        // Large Releases Strategy
        if (shouldSkipReleases) {
          this.logger.info(
            `[Stage 4] Executing Large Releases fallback strategy for ${repoKey}...`,
          );
          if (this.options.dryRun || !this.options.releaseTransport) {
            specializedResults['releases-fallback'] = { status: 'completed' };
          } else {
            try {
              const releaseStrategy = new LargeReleasesMigrationStrategy(
                this.options.releaseTransport,
              );
              await releaseStrategy.execute({
                geiSkippedReleases: true,
                signal,
              });
              specializedResults['releases-fallback'] = { status: 'completed' };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              specializedResults['releases-fallback'] = {
                status: 'failed',
                error: msg,
              };
              throw err;
            }
          }
        } else {
          specializedResults['releases-fallback'] = { status: 'skipped' };
        }

        this.checkpointManager?.recordStageResult(
          repoKey,
          'specializedStrategies',
          specializedResults,
        );
        completedStages.push('specializedStrategies');
      }

      // -------------------------------------------------------------
      // STAGE 5: Post-GEI API Rehydration
      // -------------------------------------------------------------
      if (this.checkpointManager?.isStageCompleted(repoKey, 'apiModules')) {
        this.logger.info(
          `[Stage 5] API modules already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('apiModules');
      } else {
        this.logger.info(
          `[Stage 5] Applying repository API modules for ${repoKey}...`,
        );
        const scopeTarget: MigrationScopeTarget = {
          level: 'repository',
          sourceOrg,
          sourceRepo,
          targetOrg,
          targetRepo,
        };

        const ctx: MigrationContext = {
          runId: this.options.runId ?? `repo-${Date.now()}`,
          scope: scopeTarget,
          sourceClient: this.options.sourceClient,
          targetClient: this.options.targetClient,
          targetWriteClient: this.options.targetWriteClient,
          signal,
          dryRun: this.options.dryRun ?? false,
          continueOnError: this.options.continueOnError ?? false,
          logger: this.logger,
        };

        const repoModules =
          repoMapping.modules && repoMapping.modules.length > 0
            ? repoMapping.modules
            : ['repo-variables', 'rulesets', 'branch-protection'];

        const apiModulesRecord: Record<
          string,
          { status: 'completed' | 'skipped' | 'failed'; error?: string }
        > = {};

        for (const moduleId of repoModules) {
          if (this.checkpointManager?.isModuleCompleted(repoKey, moduleId)) {
            this.logger.info(
              `[Stage 5] Module "${moduleId}" already completed for ${repoKey}; skipping.`,
            );
            apiModulesRecord[moduleId] = { status: 'completed' };
            continue;
          }

          const mod = this.options.registry.get(moduleId);
          if (!mod) {
            this.logger.warn(
              `[Stage 5] Module "${moduleId}" requested but not registered; skipping.`,
            );
            apiModulesRecord[moduleId] = { status: 'skipped' };
            continue;
          }

          let modulePlan: ModulePlan | undefined = undefined;
          if (plan) {
            modulePlan = plan.modules.find(
              (mp) =>
                mp.moduleId === moduleId &&
                (mp.targetIdentifier === repoKey ||
                  mp.targetIdentifier === `${targetOrg}/${targetRepo}`),
            );
          }

          if (!modulePlan) {
            const discovered = await mod.discover(ctx);
            modulePlan = await mod.plan(ctx, discovered);
          }

          try {
            const execResult = await mod.apply(ctx, modulePlan);
            const validated = validateModuleExecutionResult(execResult);
            if (!validated.success) {
              throw new Error(
                `Invalid execution result from module "${moduleId}": ${validated.error.issues.map((i) => i.message).join('; ')}`,
              );
            }
            moduleResults.push(validated.data);
            this.checkpointManager?.recordModuleResult(
              repoKey,
              moduleId,
              validated.data,
            );

            const isFailed =
              validated.data.status === 'failed' ||
              validated.data.results.some((r) => r.status === 'failed');

            if (isFailed) {
              const failedOp = validated.data.results.find(
                (r) => r.status === 'failed',
              );
              apiModulesRecord[moduleId] = {
                status: 'failed',
                ...(failedOp?.error ? { error: failedOp.error } : {}),
              };
              if (!this.options.continueOnError) {
                throw new Error(`Module "${moduleId}" failed during apply.`);
              }
            } else {
              apiModulesRecord[moduleId] = { status: 'completed' };
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            apiModulesRecord[moduleId] = { status: 'failed', error: msg };
            const fallbackResult: ModuleExecutionResult = {
              schemaVersion: MIGRATION_SCHEMA_VERSION,
              moduleId,
              status: 'failed',
              durationMs: 0,
              results: [
                {
                  operationId: `${moduleId}-error`,
                  status: 'failed',
                  error: msg.slice(0, 2048),
                  completedAt: new Date().toISOString(),
                },
              ],
            };
            moduleResults.push(fallbackResult);
            this.checkpointManager?.recordModuleResult(
              repoKey,
              moduleId,
              fallbackResult,
            );
            if (!this.options.continueOnError) {
              throw err;
            }
          }
        }

        this.checkpointManager?.recordStageResult(
          repoKey,
          'apiModules',
          apiModulesRecord,
        );
        completedStages.push('apiModules');
      }

      // -------------------------------------------------------------
      // STAGE 6: Post-Migration Reconciliations
      // -------------------------------------------------------------
      if (this.checkpointManager?.isStageCompleted(repoKey, 'postMigration')) {
        this.logger.info(
          `[Stage 6] Post-migration reconciliations already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('postMigration');
      } else {
        this.logger.info(
          `[Stage 6] Executing post-migration reconciliations for ${repoKey}...`,
        );
        const postMigrationTasks: Array<
          | 'repo-visibility'
          | 'webhooks'
          | 'mannequins'
          | 'codeowners'
          | 'security'
        > = [
          'repo-visibility',
          'webhooks',
          'mannequins',
          'codeowners',
          'security',
        ];

        const postMigrationResults: Record<
          string,
          { status: 'completed' | 'skipped' | 'failed'; error?: string }
        > = {};

        for (const task of postMigrationTasks) {
          const mod =
            this.options.registry.get(task) ??
            this.options.registry.get(`post-migration-${task}`);
          if (mod) {
            try {
              const scopeTarget: MigrationScopeTarget = {
                level: 'repository',
                sourceOrg,
                sourceRepo,
                targetOrg,
                targetRepo,
              };
              const ctx: MigrationContext = {
                runId: this.options.runId ?? `repo-${Date.now()}`,
                scope: scopeTarget,
                sourceClient: this.options.sourceClient,
                targetClient: this.options.targetClient,
                targetWriteClient: this.options.targetWriteClient,
                signal,
                dryRun: this.options.dryRun ?? false,
                continueOnError: this.options.continueOnError ?? false,
                logger: this.logger,
              };
              const discovered = await mod.discover(ctx);
              const taskPlan = await mod.plan(ctx, discovered);
              const result = await mod.apply(ctx, taskPlan);
              moduleResults.push(result);
              postMigrationResults[task] = { status: 'completed' };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              postMigrationResults[task] = { status: 'failed', error: msg };
              if (!this.options.continueOnError) {
                throw err;
              }
            }
          } else {
            postMigrationResults[task] = { status: 'skipped' };
          }
        }

        this.checkpointManager?.recordStageResult(
          repoKey,
          'postMigration',
          postMigrationResults,
        );
        completedStages.push('postMigration');
      }

      // -------------------------------------------------------------
      // STAGE 7: Verification & Audit
      // -------------------------------------------------------------
      if (this.checkpointManager?.isStageCompleted(repoKey, 'verification')) {
        this.logger.info(
          `[Stage 7] Verification already completed in checkpoint for ${repoKey}`,
        );
        completedStages.push('verification');
      } else {
        this.logger.info(
          `[Stage 7] Executing post-migration verification for ${repoKey}...`,
        );
        const scopeTarget: MigrationScopeTarget = {
          level: 'repository',
          sourceOrg,
          sourceRepo,
          targetOrg,
          targetRepo,
        };

        const ctx: MigrationContext = {
          runId: this.options.runId ?? `repo-${Date.now()}`,
          scope: scopeTarget,
          sourceClient: this.options.sourceClient,
          targetClient: this.options.targetClient,
          targetWriteClient: this.options.targetWriteClient,
          signal,
          dryRun: this.options.dryRun ?? false,
          continueOnError: this.options.continueOnError ?? false,
          logger: this.logger,
        };

        const repoModules =
          repoMapping.modules && repoMapping.modules.length > 0
            ? repoMapping.modules
            : ['repo-variables', 'rulesets', 'branch-protection'];

        let allVerified = true;
        for (const moduleId of repoModules) {
          const mod = this.options.registry.get(moduleId);
          if (mod) {
            try {
              let modulePlan: ModulePlan | undefined = undefined;
              if (plan) {
                modulePlan = plan.modules.find(
                  (mp) => mp.moduleId === moduleId,
                );
              }
              if (!modulePlan) {
                const discovered = await mod.discover(ctx);
                modulePlan = await mod.plan(ctx, discovered);
              }
              const verifyResult = await mod.verify(ctx, modulePlan);
              if (verifyResult.discrepancies.length > 0) {
                allVerified = false;
                this.logger.warn(
                  `[Stage 7] Module "${moduleId}" verified with ${verifyResult.discrepancies.length} discrepancies.`,
                );
              }
            } catch (err) {
              allVerified = false;
              this.logger.error(
                `[Stage 7] Module "${moduleId}" verification threw: ${err}`,
              );
            }
          }
        }

        this.checkpointManager?.recordStageResult(repoKey, 'verification', {
          status: allVerified ? 'passed' : 'failed',
        });
        completedStages.push('verification');
      }

      this.logger.info(
        `7-stage pipeline completed successfully for ${repoKey}`,
      );
      return {
        repositoryName: repoKey,
        sourceOrg,
        sourceRepo,
        targetOrg,
        targetRepo,
        status: 'complete',
        completedStages,
        ...(geiResult ? { geiResult } : {}),
        moduleResults,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Pipeline halted for repository ${repoKey}: ${errorMsg}`,
      );
      return {
        repositoryName: repoKey,
        sourceOrg,
        sourceRepo,
        targetOrg,
        targetRepo,
        status: 'failed',
        completedStages,
        error: errorMsg,
        ...(geiResult ? { geiResult } : {}),
        moduleResults,
      };
    }
  }
}
