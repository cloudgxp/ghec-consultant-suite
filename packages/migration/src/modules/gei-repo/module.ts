import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import {
  downloadMigrationLogs,
  parseGeiMetadataDiagnostics,
} from '../../gei/logs.js';
import type { GeiCommandRunner } from '../../gei/types.js';
import { SourceCredentialInspector } from '../../preflight/credential-inspector.js';
import { RepositoryParityInspector } from './parity-inspector.js';

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

    // Live mode preflight capability probe
    if (ctx.sourceClient) {
      try {
        const credentialInspector = new SourceCredentialInspector({
          adapter: ctx.sourceClient,
          sourceOrg,
          signal: ctx.signal,
        });
        const credAssessment = await credentialInspector.inspect();
        if (!credAssessment.valid) {
          const errMsg = `Preflight credential check failed for source org "${sourceOrg}": ${credAssessment.blockers.join('; ')}`;
          ctx.logger.error(`[gei-repo] ${errMsg}`);
          results.push({
            operationId: `gei-repo-preflight-${sourceRepo}`,
            status: 'failed',
            error: errMsg.slice(0, 2048),
            completedAt: new Date().toISOString(),
          });
          return {
            schemaVersion: MIGRATION_SCHEMA_VERSION,
            moduleId: this.id,
            status: 'failed',
            durationMs: Date.now() - startTime,
            results,
          };
        }
      } catch (err) {
        ctx.logger.warn(
          `[gei-repo] Could not probe source credentials: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    ctx.logger.info(
      `[gei-repo] Spawning GEI repository migration: ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo}...`,
    );
    const geiExecutor = new GeiProcessExecutor(this.geiRunner);

    const repoOptions = ctx.scope.options;
    const targetRepoVisibility = repoOptions?.targetRepoVisibility ?? 'private';
    let skipReleases = repoOptions?.skipReleases;
    if (skipReleases === undefined && ctx.sourceClient) {
      try {
        const repoRes = await ctx.sourceClient.readSingle<{ size?: number }>(
          {
            id: 'rest.repos.get',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}',
            pathParams: { owner: sourceOrg, repo: sourceRepo },
          },
          ctx.signal,
        );
        const repoSizeBytes = (repoRes.data?.size ?? 0) * 1024;
        if (repoSizeBytes > 10 * 1024 * 1024 * 1024) {
          ctx.logger.warn(
            `[gei-repo] Repository ${sourceOrg}/${sourceRepo} is large (${(repoSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB); automatically activating --skip-releases strategy for GEI.`,
          );
          skipReleases = true;
        }
      } catch {
        // Fall back gracefully
      }
    }
    const timeoutMs =
      repoOptions?.customTimeout ??
      (repoOptions?.timeoutSeconds
        ? repoOptions.timeoutSeconds * 1000
        : undefined);

    try {
      const geiResult = await geiExecutor.execute({
        sourceOrg,
        sourceRepo,
        targetOrg,
        targetRepo,
        targetRepoVisibility,
        ...(skipReleases !== undefined ? { skipReleases } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(sourceToken ? { sourceToken } : {}),
        ...(targetToken ? { targetToken } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });

      let logContents = `${geiResult.stdout}\n${geiResult.stderr}`;

      if (geiResult.migrationId) {
        try {
          const tempAuditDir = mkdtempSync(join(tmpdir(), 'ghec-gei-audit-'));
          try {
            const downloadedLog = await downloadMigrationLogs(
              geiResult.migrationId,
              targetOrg,
              targetRepo,
              tempAuditDir,
              {
                ...(this.geiRunner ? { runner: this.geiRunner } : {}),
                ...(sourceToken ? { sourceToken } : {}),
                ...(targetToken ? { targetToken } : {}),
                signal: ctx.signal,
              },
            );
            if (existsSync(downloadedLog.filePath)) {
              const fileText = readFileSync(downloadedLog.filePath, 'utf8');
              logContents += `\n${fileText}`;
            }
          } finally {
            rmSync(tempAuditDir, { recursive: true, force: true });
          }
        } catch (logErr) {
          ctx.logger.debug?.(
            `[gei-repo] Could not download GEI logs via CLI: ${logErr instanceof Error ? logErr.message : String(logErr)}`,
          );
        }
      }

      try {
        const issuesRes = await ctx.targetClient.readPage(
          {
            id: 'rest.issues.listForRepo',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/issues',
            pathParams: { owner: targetOrg, repo: targetRepo },
            queryParams: { state: 'all', per_page: 50 },
          },
          null,
          ctx.signal,
        );
        const items = (issuesRes.items ?? []) as ReadonlyArray<{
          title?: string;
          body?: string;
        }>;
        const migrationLogIssue = items.find(
          (issue) => issue.title?.trim().toLowerCase() === 'migration log',
        );
        if (migrationLogIssue?.body) {
          logContents += `\n${migrationLogIssue.body}`;
        }
      } catch {
        // Fallback inspection is non-fatal
      }

      const diagnostics = parseGeiMetadataDiagnostics(logContents, {
        skippedReleases: geiResult.skippedReleases,
        exitCode: 0,
      });

      for (const warn of diagnostics.warnings) {
        ctx.logger.warn(`[gei-repo] ${warn}`);
      }

      if (diagnostics.failedMetadataCategories.length > 0) {
        ctx.logger.warn(
          `[gei-repo] Detected metadata omissions or failures in categories: ${diagnostics.failedMetadataCategories.join(', ')}. Git data was preserved: ${diagnostics.gitDataPreserved}`,
        );
      }

      const hasActualFailure =
        diagnostics.metadataState === 'failed' ||
        (diagnostics.metadataState === 'partial' &&
          (diagnostics.errors.length > 0 ||
            diagnostics.failedMetadataCategories.some(
              (cat) => cat !== 'releases',
            )));

      if (hasActualFailure) {
        const failureReason =
          diagnostics.errors[0] ||
          diagnostics.warnings[0] ||
          `GEI metadata migration ${diagnostics.metadataState} (${diagnostics.failedMetadataCategories.join(', ')})`;
        results.push({
          operationId: `gei-repo-metadata-${targetRepo}`,
          status: 'failed',
          error: failureReason.slice(0, 2048),
          completedAt: new Date().toISOString(),
        });
      } else {
        results.push({
          operationId: `gei-repo-migration-${targetRepo}`,
          status: 'succeeded',
          completedAt: new Date().toISOString(),
        });
      }

      ctx.logger.info(
        `[gei-repo] Successfully migrated ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo} via GEI.`,
      );

      const hasFailedOp = results.some((r) => r.status === 'failed');
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: hasFailedOp ? 'partial' : 'complete',
        durationMs: Date.now() - startTime,
        results,
        metadataState: diagnostics.metadataState,
        failedMetadataCategories: [...diagnostics.failedMetadataCategories],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(
        `[gei-repo] GEI migration failed for ${sourceOrg}/${sourceRepo} -> ${targetOrg}/${targetRepo}: ${msg}`,
      );
      const diagnostics = parseGeiMetadataDiagnostics(msg, { exitCode: 1 });
      results.push({
        operationId: `gei-repo-error-${targetRepo}`,
        status: 'failed',
        error: msg.slice(0, 2048),
        completedAt: new Date().toISOString(),
      });
      if (!ctx.continueOnError) {
        throw err;
      }
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'failed',
        durationMs: Date.now() - startTime,
        results,
        metadataState:
          diagnostics.metadataState === 'complete'
            ? 'failed'
            : diagnostics.metadataState,
        failedMetadataCategories: [...diagnostics.failedMetadataCategories],
      };
    }
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

    const report = await RepositoryParityInspector.inspect(ctx);
    const hasTokens = Boolean(
      process.env.GHEC_TARGET_TOKEN || process.env.GH_PAT || this.geiRunner,
    );
    if (!hasTokens && !report.target.exists) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    const discrepancies = RepositoryParityInspector.synthesizeDiscrepancies(
      report,
      targetRepo,
    );

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies: [...discrepancies],
    };
  }
}
