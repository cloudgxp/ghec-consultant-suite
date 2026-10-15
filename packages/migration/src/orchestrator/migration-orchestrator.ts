import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, basename, join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
  type MigrationPlan,
  type MigrationScope,
  type ModuleExecutionResult,
  type ModulePlan,
  validateMigrationPlan,
  validateMigrationScope,
  validateModuleExecutionResult,
} from '@ghec/contracts';
import {
  sanitizeDiagnostics,
  type GitHubReadAdapter,
} from '@ghec/github-client';
import { ModuleRegistry } from '../core/registry.js';
import type {
  MigrationContext,
  MigrationScopeTarget,
  StructuredLogger,
  TargetWriteClient,
} from '../core/types.js';
import type { MigrationCheckpointManager } from '../checkpoint/manager.js';
import { MigrationPlanner } from '../planner/planner.js';
import { enrichModuleExecutionResult } from './execution-enricher.js';
import { parseModuleSelectionFlags } from './module-resolver.js';
import { RepositoryMigrationPipeline } from './pipeline.js';
import type {
  MigrationExecutionReport,
  MigrationOrchestratorOptions,
  RepositoryPipelineResult,
} from './types.js';

const defaultLogger: StructuredLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class MigrationOrchestrator {
  private readonly registry: ModuleRegistry;
  private readonly sourceClient: GitHubReadAdapter;
  private readonly targetClient: GitHubReadAdapter;
  private readonly targetWriteClient?: TargetWriteClient | undefined;
  private readonly scope?: MigrationScope | undefined;
  private readonly checkpointManager?: MigrationCheckpointManager | undefined;
  private readonly concurrency: number;
  private readonly sourceToken?: string | undefined;
  private readonly targetToken?: string | undefined;
  private readonly geiRunner?:
    MigrationOrchestratorOptions['geiRunner'] | undefined;
  private readonly lfsRunner?:
    MigrationOrchestratorOptions['lfsRunner'] | undefined;
  private readonly gitRunner?:
    MigrationOrchestratorOptions['gitRunner'] | undefined;
  private readonly releaseTransport?:
    MigrationOrchestratorOptions['releaseTransport'] | undefined;
  private readonly plan?: MigrationPlan | undefined;
  private readonly cachedDiscoveryBundle?:
    DiscoveryBundle | unknown | undefined;
  private readonly modulesFilter?: readonly string[] | undefined;
  private readonly excludeModulesFilter?: readonly string[] | undefined;
  private readonly dryRun: boolean;
  private readonly continueOnError: boolean;
  private readonly runId: string;
  private readonly logger: StructuredLogger;
  private readonly signal: AbortSignal;

  constructor(options: MigrationOrchestratorOptions) {
    if (!options.plan && !options.scope) {
      throw new Error(
        'Either a migration plan or migration scope must be provided.',
      );
    }
    this.registry = options.registry;
    this.sourceClient = options.sourceClient;
    this.targetClient = options.targetClient;
    this.targetWriteClient = options.targetWriteClient;
    this.checkpointManager = options.checkpointManager;
    this.concurrency = options.concurrency ?? 2;
    this.sourceToken = options.sourceToken;
    this.targetToken = options.targetToken;
    this.geiRunner = options.geiRunner;
    this.lfsRunner = options.lfsRunner;
    this.gitRunner = options.gitRunner;
    this.releaseTransport = options.releaseTransport;
    this.cachedDiscoveryBundle = options.cachedDiscoveryBundle;
    this.modulesFilter = options.modules;
    this.excludeModulesFilter = options.excludeModules;
    this.dryRun = options.dryRun ?? false;
    this.continueOnError = options.continueOnError ?? false;
    this.runId =
      options.runId ??
      `migrate-${Date.now()}-${randomBytes(4).toString('hex')}`;
    this.logger = options.logger ?? defaultLogger;
    this.signal = options.signal ?? new AbortController().signal;

    if (options.plan) {
      const planValidation = validateMigrationPlan(options.plan);
      if (!planValidation.success) {
        throw new Error(
          `Invalid migration plan: ${planValidation.error.issues.map((i) => i.message).join('; ')}`,
        );
      }
      this.plan = planValidation.data;
    }

    if (options.scope) {
      const scopeValidation = validateMigrationScope(options.scope);
      if (!scopeValidation.success) {
        throw new Error(
          `Invalid migration scope: ${scopeValidation.error.issues.map((i) => i.message).join('; ')}`,
        );
      }
      this.scope = scopeValidation.data;
    }
  }

  async executeRepositoryPipelines(): Promise<
    readonly RepositoryPipelineResult[]
  > {
    const repos = this.scope?.repositories ?? [];
    if (repos.length === 0) {
      return [];
    }

    const results: RepositoryPipelineResult[] = [];
    const pipeline = new RepositoryMigrationPipeline({
      registry: this.registry,
      sourceClient: this.sourceClient,
      targetClient: this.targetClient,
      targetWriteClient: this.targetWriteClient,
      checkpointManager: this.checkpointManager,
      sourceToken: this.sourceToken,
      targetToken: this.targetToken,
      cachedDiscoveryBundle: this.cachedDiscoveryBundle,
      dryRun: this.dryRun,
      continueOnError: this.continueOnError,
      runId: this.runId,
      logger: this.logger,
      signal: this.signal,
      geiRunner: this.geiRunner,
      lfsRunner: this.lfsRunner,
      gitRunner: this.gitRunner,
      releaseTransport: this.releaseTransport,
    });

    const queue = [...repos];
    const activeWorkers: Promise<void>[] = [];
    const concurrency = Math.max(1, this.concurrency);

    for (let i = 0; i < concurrency && queue.length > 0; i++) {
      activeWorkers.push(
        (async () => {
          while (queue.length > 0) {
            if (this.signal.aborted) break;
            const repo = queue.shift()!;
            const res = await pipeline.execute(repo, this.plan);
            results.push(res);
            if (res.status === 'failed' && !this.continueOnError) {
              queue.length = 0;
              break;
            }
          }
        })(),
      );
    }

    await Promise.all(activeWorkers);
    return results;
  }

  async run(): Promise<MigrationExecutionReport> {
    if (this.signal.aborted) {
      throw this.signal.reason ?? new Error('Migration aborted');
    }

    if (!this.dryRun && !this.targetWriteClient) {
      throw new Error(
        'TargetWriteClient must be configured to execute live migration mutations (or use dryRun: true).',
      );
    }

    const parsedSelection = parseModuleSelectionFlags(
      this.modulesFilter,
      this.excludeModulesFilter,
    );
    const excludeSet = new Set(parsedSelection.excludeModules);

    let activePlan: MigrationPlan;
    if (this.plan) {
      activePlan = this.plan;
    } else {
      this.logger.info('Generating migration plan from scope...');
      const planner = new MigrationPlanner({
        scope: this.scope!,
        registry: this.registry,
        sourceClient: this.sourceClient,
        targetClient: this.targetClient,
        cachedDiscoveryBundle: this.cachedDiscoveryBundle,
        logger: this.logger,
        runId: this.runId,
        signal: this.signal,
        modules: this.modulesFilter,
        excludeModules: this.excludeModulesFilter,
      });
      activePlan = await planner.generatePlan();
    }

    let initialPlans: readonly ModulePlan[] = activePlan.modules;
    if (
      parsedSelection.modules &&
      parsedSelection.modules.length > 0 &&
      !parsedSelection.isAuto
    ) {
      const filterSet = new Set(parsedSelection.modules);
      initialPlans = initialPlans.filter((mp) => filterSet.has(mp.moduleId));
    }
    if (excludeSet.size > 0) {
      initialPlans = initialPlans.filter((mp) => !excludeSet.has(mp.moduleId));
    }

    const queuedPlans: ModulePlan[] = [...initialPlans];
    const failedRepoTargets = new Set<string>();
    const freshlyMigratedTargets = new Set<string>();

    const executionResults: ModuleExecutionResult[] = [];
    const recommendations: string[] = [];
    let hasFailure = false;

    for (let idx = 0; idx < queuedPlans.length; idx++) {
      const modulePlan = queuedPlans[idx]!;
      if (this.signal.aborted) {
        throw this.signal.reason ?? new Error('Migration aborted');
      }

      if (
        !this.plan &&
        modulePlan.moduleId !== 'gei-repo' &&
        failedRepoTargets.has(modulePlan.targetIdentifier)
      ) {
        this.logger.warn(
          `Skipping module "${modulePlan.moduleId}" on target "${modulePlan.targetIdentifier}" because upstream transport module "gei-repo" failed.`,
        );
        executionResults.push({
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          moduleId: modulePlan.moduleId,
          status: 'skipped',
          durationMs: 0,
          targetIdentifier: modulePlan.targetIdentifier,
          scopeLevel: modulePlan.scopeLevel,
          results: [],
        });
        continue;
      }

      const mod = this.registry.getOrThrow(modulePlan.moduleId);
      const scopeTarget = this.resolveScopeTarget(modulePlan);

      const ctx: MigrationContext = {
        runId: this.runId,
        scope: scopeTarget,
        sourceClient: this.sourceClient,
        targetClient: this.targetClient,
        targetWriteClient: this.targetWriteClient,
        signal: this.signal,
        dryRun: this.dryRun,
        continueOnError: this.continueOnError,
        logger: this.logger,
      };

      try {
        let effectiveModulePlan = modulePlan;
        if (
          !this.plan &&
          !this.dryRun &&
          modulePlan.moduleId !== 'gei-repo' &&
          freshlyMigratedTargets.has(modulePlan.targetIdentifier)
        ) {
          this.logger.info(
            `Re-planning module "${modulePlan.moduleId}" against freshly imported target "${modulePlan.targetIdentifier}"...`,
          );
          const freshDiscovered = await mod.discover(
            ctx,
            this.cachedDiscoveryBundle,
          );
          const freshPlan = await mod.plan(ctx, freshDiscovered);
          effectiveModulePlan = {
            ...freshPlan,
            targetIdentifier:
              freshPlan.targetIdentifier || modulePlan.targetIdentifier,
          };
        }

        this.logger.info(
          `Executing module "${modulePlan.moduleId}" on target "${modulePlan.targetIdentifier}"`,
        );
        const result = await mod.apply(ctx, effectiveModulePlan);
        const enriched = enrichModuleExecutionResult(
          result,
          effectiveModulePlan,
          {
            targetIdentifier: modulePlan.targetIdentifier,
            scopeLevel: modulePlan.scopeLevel,
          },
        );
        const validated = validateModuleExecutionResult(enriched);
        if (!validated.success) {
          throw new Error(
            `Module "${modulePlan.moduleId}" returned invalid execution result: ${validated.error.issues.map((i) => i.message).join('; ')}`,
          );
        }
        executionResults.push(validated.data);

        if (modulePlan.moduleId === 'gei-repo') {
          if (validated.data.status === 'failed') {
            failedRepoTargets.add(modulePlan.targetIdentifier);
          } else if (
            validated.data.results.some((r) => r.status === 'succeeded')
          ) {
            freshlyMigratedTargets.add(modulePlan.targetIdentifier);
          }

          if (
            validated.data.failedMetadataCategories &&
            validated.data.failedMetadataCategories.length > 0
          ) {
            for (const cat of validated.data.failedMetadataCategories) {
              const rec = `GEI omitted ${cat} metadata for ${modulePlan.targetIdentifier}. Recommended fallback module: '${cat}'.`;
              recommendations.push(rec);
              this.logger.warn(rec);

              if (
                !this.plan &&
                (cat === 'issues' ||
                  cat === 'pull-requests' ||
                  cat === 'releases') &&
                !excludeSet.has(cat) &&
                this.registry.has(cat)
              ) {
                const alreadyQueued = queuedPlans
                  .slice(idx + 1)
                  .some(
                    (p) =>
                      p.moduleId === cat &&
                      p.targetIdentifier === modulePlan.targetIdentifier,
                  );
                if (!alreadyQueued) {
                  this.logger.info(
                    `Dynamically promoting fallback module "${cat}" for "${modulePlan.targetIdentifier}" after GEI metadata omission/fallback.`,
                  );
                  freshlyMigratedTargets.add(modulePlan.targetIdentifier);
                  let insertIdx = idx + 1;
                  while (
                    insertIdx < queuedPlans.length &&
                    queuedPlans[insertIdx]?.targetIdentifier ===
                      modulePlan.targetIdentifier
                  ) {
                    insertIdx++;
                  }
                  queuedPlans.splice(insertIdx, 0, {
                    moduleId: cat,
                    scopeLevel: 'repository',
                    targetIdentifier: modulePlan.targetIdentifier,
                    operations: [],
                    warnings: [],
                  });
                }
              }
            }
          }
        }

        const isFailed =
          validated.data.status === 'failed' ||
          validated.data.results.some((r) => r.status === 'failed');

        if (isFailed) {
          hasFailure = true;
          if (!this.continueOnError) {
            break;
          }
        }
      } catch (err) {
        hasFailure = true;
        if (modulePlan.moduleId === 'gei-repo') {
          failedRepoTargets.add(modulePlan.targetIdentifier);
        }
        const msg = sanitizeDiagnostics(
          err instanceof Error ? err.message : String(err),
        );
        this.logger.error(
          `Module "${modulePlan.moduleId}" apply threw: ${msg}`,
        );

        const fallbackResult: ModuleExecutionResult = {
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          moduleId: modulePlan.moduleId,
          status: 'failed',
          durationMs: 0,
          targetIdentifier: modulePlan.targetIdentifier,
          scopeLevel: modulePlan.scopeLevel,
          results: [
            {
              operationId: `${modulePlan.moduleId}-error`,
              status: 'failed',
              error: msg.slice(0, 2048),
              completedAt: new Date().toISOString(),
              targetIdentifier: modulePlan.targetIdentifier,
            },
          ],
        };
        executionResults.push(fallbackResult);

        if (!this.continueOnError) {
          break;
        }
      }
    }

    let status: 'complete' | 'partial' | 'failed';
    let exitCode: 0 | 1 | 4;

    const hasSuccessfulOperation = executionResults.some(
      (r) =>
        r.status === 'complete' ||
        r.status === 'partial' ||
        r.results.some((op) => op.status === 'succeeded'),
    );
    const allFailed = !hasSuccessfulOperation && executionResults.length > 0;

    if (!hasFailure) {
      status = 'complete';
      exitCode = 0;
    } else if (allFailed || !this.continueOnError) {
      status = 'failed';
      exitCode = 1;
    } else {
      status = 'partial';
      exitCode = 4;
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      planId: activePlan.planId,
      executedAt: new Date().toISOString(),
      status,
      exitCode,
      dryRun: this.dryRun,
      results: executionResults,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  private resolveScopeTarget(modulePlan: ModulePlan): MigrationScopeTarget {
    const targetId = modulePlan.targetIdentifier;
    if (targetId.includes('/')) {
      const [targetOrg, targetRepo] = targetId.split('/');
      const repoMapping = this.scope?.repositories.find(
        (r) => r.targetOrg === targetOrg && r.targetRepo === targetRepo,
      );
      const sourceOrg = repoMapping?.sourceOrg ?? targetOrg!;
      const sourceRepo = repoMapping?.sourceRepo ?? targetRepo!;
      const repoKey = `${sourceOrg}/${sourceRepo}`;
      const baseRepoOptions =
        repoMapping?.options ??
        this.scope?.repositoryOptions?.[repoKey] ??
        this.scope?.repositoryOptions?.[sourceRepo] ??
        (repoMapping?.skipReleases !== undefined ||
        repoMapping?.lfsStrategy !== undefined ||
        repoMapping?.targetRepoVisibility !== undefined ||
        repoMapping?.gitTransferStrategy !== undefined ||
        repoMapping?.mirrorPushMode !== undefined
          ? {
              skipReleases: repoMapping.skipReleases,
              lfsStrategy: repoMapping.lfsStrategy,
              targetRepoVisibility: repoMapping.targetRepoVisibility,
              gitTransferStrategy: repoMapping.gitTransferStrategy,
              mirrorPushMode: repoMapping.mirrorPushMode,
            }
          : undefined);
      const effectiveMirrorPushMode =
        baseRepoOptions?.mirrorPushMode ??
        repoMapping?.mirrorPushMode ??
        this.scope?.mirrorPushMode;
      const repoOptions =
        effectiveMirrorPushMode !== undefined
          ? { ...baseRepoOptions, mirrorPushMode: effectiveMirrorPushMode }
          : baseRepoOptions;

      const matchingOrg = this.scope?.organizations.find(
        (o) => o.target === targetOrg,
      );
      const effectiveTargetType =
        matchingOrg?.targetType ??
        this.scope?.targetType ??
        (this.scope?.identityMapping?.strategy === 'pass-through'
          ? 'ghec'
          : 'emu');

      return {
        level: 'repository',
        sourceOrg,
        targetOrg: targetOrg!,
        sourceRepo,
        targetRepo: targetRepo!,
        targetType: effectiveTargetType,
        identityMapping: this.scope?.identityMapping,
        options: repoOptions,
      };
    }

    const orgMapping = this.scope?.organizations.find(
      (o) => o.target === targetId,
    );
    const effectiveTargetType =
      orgMapping?.targetType ??
      this.scope?.targetType ??
      (this.scope?.identityMapping?.strategy === 'pass-through'
        ? 'ghec'
        : 'emu');
    return {
      level: 'organization',
      sourceOrg: orgMapping?.source ?? targetId,
      targetOrg: targetId,
      targetType: effectiveTargetType,
      identityMapping: this.scope?.identityMapping,
    };
  }
}

export function writeMigrationExecutionReportFile(
  filePath: string,
  report: MigrationExecutionReport,
  options: { overwrite?: boolean } = {},
): string {
  if (existsSync(filePath) && !options.overwrite) {
    throw new Error(
      `Execution report file "${filePath}" already exists. Set overwrite: true or specify a unique path.`,
    );
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tempPath = join(
    dir,
    `.${basename(filePath)}.tmp.${Date.now()}.${randomBytes(4).toString('hex')}`,
  );
  writeFileSync(tempPath, JSON.stringify(report, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(tempPath, filePath);
  return filePath;
}
