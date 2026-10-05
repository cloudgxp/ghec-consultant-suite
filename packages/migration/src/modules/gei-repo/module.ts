import { MIGRATION_SCHEMA_VERSION, type ModulePlan } from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModuleVerificationResult,
  OperationExecutionResult,
} from '../../core/types.js';
import { GeiProcessExecutor } from '../../gei/executor.js';
import type { GeiCommandRunner } from '../../gei/types.js';

export interface GeiRepoDiscoveredData {
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly targetRepoVisibility?: 'private' | 'internal' | 'public' | undefined;
  readonly targetExists: boolean;
}

export class GeiRepoMigrationModule implements MigrationModule<GeiRepoDiscoveredData> {
  readonly id = 'gei-repo';
  readonly displayName = 'GEI Repository Migration';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = [];

  private readonly geiRunner?: GeiCommandRunner | undefined;

  constructor(geiRunner?: GeiCommandRunner) {
    this.geiRunner = geiRunner;
  }

  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<GeiRepoDiscoveredData> {
    void cachedData;
    const sourceOrg = ctx.scope.sourceOrg ?? '';
    const sourceRepo = ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg ?? '';
    const targetRepo = ctx.scope.targetRepo ?? '';

    let targetExists = false;
    try {
      const res = await ctx.targetClient.readSingle(
        {
          id: 'rest.repos.get',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}',
          pathParams: { owner: targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );
      if (res.status === 200) {
        targetExists = true;
      }
    } catch {
      targetExists = false;
    }

    return {
      sourceOrg,
      sourceRepo,
      targetOrg,
      targetRepo,
      targetRepoVisibility: 'private',
      targetExists,
    };
  }

  async plan(
    ctx: MigrationContext,
    discovered: GeiRepoDiscoveredData,
  ): Promise<ModulePlan> {
    void ctx;
    const targetIdentifier = `${discovered.targetOrg}/${discovered.targetRepo}`;

    return {
      moduleId: this.id,
      scopeLevel: 'repository',
      targetIdentifier,
      operations: [],
      warnings: [],
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    void plan;
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const sourceOrg = ctx.scope.sourceOrg ?? '';
    const sourceRepo = ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg ?? '';
    const targetRepo = ctx.scope.targetRepo ?? '';

    if (!sourceRepo || !targetRepo) {
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        durationMs: 0,
        results: [],
      };
    }

    if (ctx.dryRun) {
      ctx.logger.info(
        `[gei-repo] [DRY RUN] Simulating GEI repository migration: ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo}`,
      );
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        durationMs: Date.now() - startTime,
        results: [],
      };
    }

    // Live mode: check if target already exists at destination
    let targetAlreadyPresent = false;
    try {
      const checkRes = await ctx.targetClient.readSingle(
        {
          id: 'rest.repos.get',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}',
          pathParams: { owner: targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );
      if (checkRes.status === 200) {
        targetAlreadyPresent = true;
      }
    } catch {
      targetAlreadyPresent = false;
    }

    if (targetAlreadyPresent) {
      ctx.logger.info(
        `[gei-repo] Target repository ${targetOrg}/${targetRepo} already exists on destination; skipping live GEI import.`,
      );
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        durationMs: Date.now() - startTime,
        results: [],
      };
    }

    const sourceToken =
      process.env.GHEC_SOURCE_TOKEN?.trim() ??
      process.env.GH_SOURCE_PAT?.trim() ??
      process.env.GHEC_TOKEN?.trim();
    const targetToken =
      process.env.GHEC_TARGET_TOKEN?.trim() ?? process.env.GH_PAT?.trim();

    if (!this.geiRunner && (!sourceToken || !targetToken)) {
      ctx.logger.info(
        `[gei-repo] No migration tokens or custom GEI runner provided; skipping GEI import for ${sourceOrg}/${sourceRepo}.`,
      );
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        durationMs: Date.now() - startTime,
        results: [],
      };
    }

    ctx.logger.info(
      `[gei-repo] Spawning GEI repository migration: ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo}...`,
    );
    const geiExecutor = new GeiProcessExecutor(this.geiRunner);

    try {
      await geiExecutor.execute({
        sourceOrg,
        sourceRepo,
        targetOrg,
        targetRepo,
        targetRepoVisibility: 'private',
        ...(sourceToken ? { sourceToken } : {}),
        ...(targetToken ? { targetToken } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });

      ctx.logger.info(
        `[gei-repo] Successfully migrated ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo} via GEI.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(
        `[gei-repo] GEI migration failed for ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo}: ${msg}`,
      );
      results.push({
        operationId: `gei-repo-error-${targetRepo}`,
        status: 'failed',
        error: msg.slice(0, 2048),
        completedAt: new Date().toISOString(),
      });
      if (!ctx.continueOnError) {
        throw err;
      }
    }

    const hasFailure = results.some((r) => r.status === 'failed');
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: hasFailure ? 'failed' : 'complete',
      durationMs: Date.now() - startTime,
      results,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    void plan;
    const targetOrg = ctx.scope.targetOrg ?? '';
    const targetRepo = ctx.scope.targetRepo ?? '';

    if (!targetOrg || !targetRepo) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    try {
      const res = await ctx.targetClient.readSingle(
        {
          id: 'rest.repos.get',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}',
          pathParams: { owner: targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );

      if (res.status === 200) {
        return {
          moduleId: this.id,
          verified: true,
          discrepancies: [],
        };
      }
    } catch {
      // not found
    }

    const hasTokens = Boolean(
      process.env.GHEC_TARGET_TOKEN || process.env.GH_PAT || this.geiRunner,
    );
    if (!hasTokens) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    return {
      moduleId: this.id,
      verified: false,
      discrepancies: [
        {
          resourceName: targetRepo,
          expected: 'present',
          actual: 'absent',
          message: `Target repository ${targetOrg}/${targetRepo} does not exist at destination.`,
        },
      ],
    };
  }
}
