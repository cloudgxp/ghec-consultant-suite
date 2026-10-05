import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
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
import type { GitHubReadAdapter } from '@ghec/github-client';
import { ModuleRegistry } from '../core/registry.js';
import type {
  MigrationContext,
  MigrationScopeTarget,
  StructuredLogger,
  TargetWriteClient,
} from '../core/types.js';
import type { MigrationCheckpointManager } from '../checkpoint/manager.js';
import { MigrationPlanner } from '../planner/planner.js';
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
  private readonly releaseTransport?:
    MigrationOrchestratorOptions['releaseTransport'] | undefined;
  private readonly plan?: MigrationPlan | undefined;
  private readonly cachedDiscoveryBundle?:
    DiscoveryBundle | unknown | undefined;
  private readonly modulesFilter?: readonly string[] | undefined;
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
    this.releaseTransport = options.releaseTransport;
    this.cachedDiscoveryBundle = options.cachedDiscoveryBundle;
    this.modulesFilter = options.modules;
    this.dryRun = options.dryRun ?? false;
    this.continueOnError = options.continueOnError ?? false;
    this.runId =
      options.runId ??
      `migrate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      });
      activePlan = await planner.generatePlan();
    }

    let modulePlans: readonly ModulePlan[] = activePlan.modules;
    if (
      this.modulesFilter &&
      this.modulesFilter.length > 0 &&
      !this.modulesFilter.includes('all')
    ) {
      const filterSet = new Set(this.modulesFilter);
      modulePlans = modulePlans.filter((mp) => filterSet.has(mp.moduleId));
    }

    const executionResults: ModuleExecutionResult[] = [];
    let hasFailure = false;

    for (const modulePlan of modulePlans) {
      if (this.signal.aborted) {
        throw this.signal.reason ?? new Error('Migration aborted');
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
        this.logger.info(
          `Executing module "${modulePlan.moduleId}" on target "${modulePlan.targetIdentifier}"`,
        );
        const result = await mod.apply(ctx, modulePlan);
        const validated = validateModuleExecutionResult(result);
        if (!validated.success) {
          throw new Error(
            `Module "${modulePlan.moduleId}" returned invalid execution result: ${validated.error.issues.map((i) => i.message).join('; ')}`,
          );
        }
        executionResults.push(validated.data);

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
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Module "${modulePlan.moduleId}" apply threw: ${msg}`,
        );

        const fallbackResult: ModuleExecutionResult = {
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          moduleId: modulePlan.moduleId,
          status: 'failed',
          durationMs: 0,
          results: [
            {
              operationId: `${modulePlan.moduleId}-error`,
              status: 'failed',
              error: msg.slice(0, 2048),
              completedAt: new Date().toISOString(),
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
    };
  }

  private resolveScopeTarget(modulePlan: ModulePlan): MigrationScopeTarget {
    const targetId = modulePlan.targetIdentifier;
    if (targetId.includes('/')) {
      const [targetOrg, targetRepo] = targetId.split('/');
      const repoMapping = this.scope?.repositories.find(
        (r) => r.targetOrg === targetOrg && r.targetRepo === targetRepo,
      );
      return {
        level: 'repository',
        sourceOrg: repoMapping?.sourceOrg ?? targetOrg!,
        targetOrg: targetOrg!,
        sourceRepo: repoMapping?.sourceRepo ?? targetRepo!,
        targetRepo: targetRepo!,
      };
    }

    const orgMapping = this.scope?.organizations.find(
      (o) => o.target === targetId,
    );
    return {
      level: 'organization',
      sourceOrg: orgMapping?.source ?? targetId,
      targetOrg: targetId,
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
    `.${basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );
  writeFileSync(tempPath, JSON.stringify(report, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(tempPath, filePath);
  return filePath;
}
