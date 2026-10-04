import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
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
import { IdentityMappingEngine } from '../../modules/teams/identity-mapper.js';
import { parseMannequinCsv, serializeMannequinCsv } from './csv-generator.js';
import {
  applyIdentityMappings,
  executeMannequinReclamation,
  exportMannequinInventory,
} from './reclaimer.js';
import {
  COMMIT_AUTHORSHIP_LIMITATION_NOTICE,
  type MannequinDiscoveredData,
  type MannequinRecord,
  type MannequinReclamationOptions,
  type MannequinReclamationReport,
} from './types.js';

/**
 * Mannequin Reclamation & History Reattribution Engine.
 *
 * Implements Stage 6 post-migration mannequin reclamation, exporting mannequin
 * inventories, mapping identities to target EMU accounts, executing bulk reclamation
 * with `--skip-invitation`, and documenting Git commit email limitations (DEC-013).
 */
export class MannequinReclamationEngine implements MigrationModule<MannequinDiscoveredData> {
  readonly id = 'post-migration-mannequins' as const;
  readonly displayName = 'Mannequin Reclamation & History Reattribution';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['gei-repo'];

  private readonly engineOptions: MannequinReclamationOptions;

  constructor(options?: Partial<MannequinReclamationOptions>) {
    this.engineOptions = {
      targetOrg: options?.targetOrg ?? '',
      ...(options?.targetToken ? { targetToken: options.targetToken } : {}),
      ...(options?.csvPath ? { csvPath: options.csvPath } : {}),
      ...(options?.isEmu !== undefined
        ? { isEmu: options.isEmu }
        : { isEmu: true }),
      ...(options?.identityMapper
        ? { identityMapper: options.identityMapper }
        : {}),
      ...(options?.geiRunner ? { geiRunner: options.geiRunner } : {}),
      ...(options?.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
      ...(options?.logger ? { logger: options.logger } : {}),
    };
  }

  /**
   * Discovers mannequin identities in the target organization by running
   * `gh gei generate-mannequin-csv` or reading from a configured CSV file.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<MannequinDiscoveredData> {
    const targetOrg = ctx.scope.targetOrg || this.engineOptions.targetOrg;
    if (!targetOrg) {
      throw new Error(
        'Target organization must be specified for mannequin discovery.',
      );
    }

    // 1. If pre-supplied records or cached CSV content passed in cachedData
    if (cachedData && typeof cachedData === 'object') {
      const dataObj = cachedData as Record<string, unknown>;
      if ('records' in dataObj && Array.isArray(dataObj.records)) {
        return {
          targetOrg,
          records: dataObj.records as MannequinRecord[],
          ...(typeof dataObj.sourceCsvPath === 'string'
            ? { sourceCsvPath: dataObj.sourceCsvPath }
            : {}),
        };
      }
      if ('csvContent' in dataObj && typeof dataObj.csvContent === 'string') {
        const records = parseMannequinCsv(dataObj.csvContent);
        return {
          targetOrg,
          records,
        };
      }
    }

    // 2. If a local CSV path is explicitly provided in options and exists, parse it directly
    if (this.engineOptions.csvPath) {
      try {
        const content = await fs.readFile(this.engineOptions.csvPath, 'utf8');
        const records = parseMannequinCsv(content);
        return {
          targetOrg,
          records,
          sourceCsvPath: this.engineOptions.csvPath,
        };
      } catch (err) {
        ctx.logger.warn(
          `Configured CSV path '${this.engineOptions.csvPath}' could not be read (${String(err)}). Falling back to export.`,
        );
      }
    }

    // 3. In dryRun mode without a runner or files, return an empty inventory
    if (ctx.dryRun && !this.engineOptions.geiRunner) {
      ctx.logger.info(
        `[Dry-Run] Skipping live mannequin CSV generation for ${targetOrg}.`,
      );
      return {
        targetOrg,
        records: [],
      };
    }

    // 4. Generate inventory via GEI CLI
    let secureDir: string | undefined;
    let tempCsvPath: string;

    try {
      secureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghec-mannequins-'));
      tempCsvPath = path.join(secureDir, 'inventory.csv');

      const records = await exportMannequinInventory({
        targetOrg,
        outputPath: tempCsvPath,
        ...(this.engineOptions.geiRunner
          ? { geiRunner: this.engineOptions.geiRunner }
          : {}),
        ...(this.engineOptions.targetToken || process.env.GH_PAT
          ? { token: this.engineOptions.targetToken ?? process.env.GH_PAT }
          : {}),
        signal: ctx.signal,
      });

      return {
        targetOrg,
        records,
        sourceCsvPath: tempCsvPath,
      };
    } catch (err) {
      if (secureDir) {
        await fs
          .rm(secureDir, { recursive: true, force: true })
          .catch(() => {});
      }
      ctx.logger.warn(
        `Could not export mannequins for organization '${targetOrg}': ${String(err)}`,
      );
      return {
        targetOrg,
        records: [],
      };
    }
  }

  /**
   * Maps source logins to EMU identities and prepares the migration plan.
   */
  async plan(
    ctx: MigrationContext,
    discovered: MannequinDiscoveredData,
  ): Promise<ModulePlan> {
    const targetOrg = discovered.targetOrg || ctx.scope.targetOrg;
    const mapper =
      this.engineOptions.identityMapper ?? new IdentityMappingEngine();

    const { mappedRecords, unmappedUsers, warnings } = applyIdentityMappings(
      discovered.records,
      mapper,
    );

    const operations: PlannedOperation[] = [];

    for (const record of mappedRecords) {
      if (record.targetUser) {
        operations.push({
          id: `op-reclaim-${record.mannequinUser}`,
          resourceType: 'mannequin',
          resourceName: record.mannequinUser,
          operation: 'update',
          sourceState: {
            mannequinUser: record.mannequinUser,
            mannequinId: record.mannequinId,
          },
          destinationCurrentState: undefined,
          payload: {
            targetUser: record.targetUser,
            mannequinId: record.mannequinId,
          },
          reason: `Reclaiming mannequin '${record.mannequinUser}' to target user '${record.targetUser}'`,
        });
      } else {
        operations.push({
          id: `op-warn-unmapped-${record.mannequinUser}`,
          resourceType: 'mannequin',
          resourceName: record.mannequinUser,
          operation: 'warn',
          sourceState: {
            mannequinUser: record.mannequinUser,
            mannequinId: record.mannequinId,
          },
          reason: `Unmapped contributor '${record.mannequinUser}' without matching EMU login`,
        });
      }
    }

    const planWarnings = [...warnings];
    if (unmappedUsers.length > 0) {
      planWarnings.push(
        `Found ${unmappedUsers.length} unmapped mannequin(s) that cannot be reclaimed automatically: ${unmappedUsers.join(', ')}`,
      );
    }
    // Always include commit authorship limitation advisory
    planWarnings.push(COMMIT_AUTHORSHIP_LIMITATION_NOTICE);

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: targetOrg,
      operations,
      warnings: planWarnings,
    };
  }

  /**
   * Applies the plan by writing the mapped CSV and executing `gh gei reclaim-mannequin`.
   */
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = plan.targetIdentifier || ctx.scope.targetOrg;

    // Filter operations to reclaimable records
    const reclaimableRecords: MannequinRecord[] = [];
    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'warn') {
        results.push({
          operationId: op.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }

      if (op.operation === 'update' && op.payload) {
        const payload = op.payload as {
          targetUser?: string;
          mannequinId?: string;
        };
        if (payload.targetUser && payload.mannequinId) {
          reclaimableRecords.push({
            mannequinUser: op.resourceName,
            mannequinId: payload.mannequinId,
            targetUser: payload.targetUser,
            status: 'completed',
          });
        }
      }
    }

    const isDryRun = ctx.dryRun || Boolean(this.engineOptions.dryRun);

    if (reclaimableRecords.length === 0) {
      ctx.logger.info(
        `No reclaimable mannequins to process for org '${targetOrg}'.`,
      );
      for (const op of plan.operations) {
        if (op.operation === 'update') {
          results.push({
            operationId: op.id,
            status: 'skipped',
            completedAt: new Date().toISOString(),
          });
        }
      }

      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        results,
        durationMs: Date.now() - startTime,
      };
    }

    // Write out mapped CSV
    let secureDir: string | undefined;
    let csvPath = this.engineOptions.csvPath;

    if (!csvPath) {
      secureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghec-mannequins-'));
      csvPath = path.join(secureDir, 'reclaim.csv');
    }

    try {
      const csvContent = serializeMannequinCsv(reclaimableRecords);
      await fs.writeFile(csvPath, csvContent, {
        encoding: 'utf8',
        mode: 0o600,
      });

      let executionError: string | undefined;

      try {
        await executeMannequinReclamation({
          targetOrg,
          csvPath,
          isEmu: this.engineOptions.isEmu !== false,
          ...(this.engineOptions.geiRunner
            ? { geiRunner: this.engineOptions.geiRunner }
            : {}),
          ...(this.engineOptions.targetToken || process.env.GH_PAT
            ? { token: this.engineOptions.targetToken ?? process.env.GH_PAT }
            : {}),
          dryRun: isDryRun,
          signal: ctx.signal,
        });

        for (const op of plan.operations) {
          if (op.operation === 'update') {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: 200,
              completedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        executionError = err instanceof Error ? err.message : String(err);
        for (const op of plan.operations) {
          if (op.operation === 'update') {
            results.push({
              operationId: op.id,
              status: 'failed',
              error: executionError.slice(0, 2048),
              completedAt: new Date().toISOString(),
            });
          }
        }
      }
    } finally {
      if (secureDir) {
        await fs
          .rm(secureDir, { recursive: true, force: true })
          .catch(() => {});
      }
    }

    const hasFailures = results.some((r) => r.status === 'failed');

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: hasFailures ? 'failed' : 'complete',
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Verifies target state post-reclamation, checking for unmapped mannequins or failures.
   */
  async verify(
    ctx: MigrationContext,
    planOrReport?: unknown,
  ): Promise<ModuleVerificationResult> {
    const discrepancies: VerificationDiscrepancy[] = [];

    if (
      planOrReport &&
      typeof planOrReport === 'object' &&
      'operations' in planOrReport
    ) {
      const plan = planOrReport as ModulePlan;
      for (const op of plan.operations) {
        if (op.operation === 'warn') {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'Reclaimed EMU identity',
            actual: 'Unmapped placeholder mannequin',
            message: `Mannequin contributor '${op.resourceName}' could not be mapped to any EMU user.`,
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

  /**
   * Standalone runner that coordinates discovery, mapping, execution, and reporting.
   */
  async reclaim(
    overrideOptions?: Partial<MannequinReclamationOptions>,
  ): Promise<MannequinReclamationReport> {
    const options: MannequinReclamationOptions = {
      ...this.engineOptions,
      ...overrideOptions,
    };

    if (!options.targetOrg) {
      throw new Error(
        'Target organization is required for mannequin reclamation.',
      );
    }

    const mapper = options.identityMapper ?? new IdentityMappingEngine();
    let tempDir: string | undefined;
    let tempCsvPath = options.csvPath;

    if (!tempCsvPath) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghec-mannequins-'));
      tempCsvPath = path.join(tempDir, 'inventory.csv');
    }

    let rawRecords: MannequinRecord[];

    try {
      // Check if CSV exists or export
      if (options.csvPath) {
        try {
          const content = await fs.readFile(options.csvPath, 'utf8');
          rawRecords = parseMannequinCsv(content);
        } catch {
          rawRecords = await exportMannequinInventory({
            targetOrg: options.targetOrg,
            outputPath: tempCsvPath,
            ...(options.geiRunner ? { geiRunner: options.geiRunner } : {}),
            ...(options.targetToken || process.env.GH_PAT
              ? { token: options.targetToken ?? process.env.GH_PAT }
              : {}),
          });
        }
      } else {
        rawRecords = await exportMannequinInventory({
          targetOrg: options.targetOrg,
          outputPath: tempCsvPath,
          ...(options.geiRunner ? { geiRunner: options.geiRunner } : {}),
          ...(options.targetToken || process.env.GH_PAT
            ? { token: options.targetToken ?? process.env.GH_PAT }
            : {}),
        });
      }

      const { mappedRecords, unmappedUsers } = applyIdentityMappings(
        rawRecords,
        mapper,
      );

      let mappedDir: string | undefined;
      let mappedCsvPath: string;

      try {
        mappedDir = await fs.mkdtemp(
          path.join(os.tmpdir(), 'ghec-mannequins-reclaim-'),
        );
        mappedCsvPath = path.join(mappedDir, 'reclaim.csv');

        const mappedCsvContent = serializeMannequinCsv(mappedRecords);
        await fs.writeFile(mappedCsvPath, mappedCsvContent, {
          encoding: 'utf8',
          mode: 0o600,
        });

        if (mappedRecords.some((r) => r.targetUser)) {
          await executeMannequinReclamation({
            targetOrg: options.targetOrg,
            csvPath: mappedCsvPath,
            isEmu: options.isEmu !== false,
            ...(options.geiRunner ? { geiRunner: options.geiRunner } : {}),
            ...(options.targetToken || process.env.GH_PAT
              ? { token: options.targetToken ?? process.env.GH_PAT }
              : {}),
            ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
          });
        }
      } finally {
        if (mappedDir) {
          await fs
            .rm(mappedDir, { recursive: true, force: true })
            .catch(() => {});
        }
      }

      const isEmu = options.isEmu !== false;
      let reclaimedCount = 0;
      let invitedCount = 0;
      let unmappedCount = 0;

      for (const r of mappedRecords) {
        if (!r.targetUser) {
          unmappedCount++;
          r.status = 'unmapped';
        } else if (isEmu) {
          reclaimedCount++;
          r.status = 'completed';
        } else {
          invitedCount++;
          r.status = 'invited';
        }
      }

      return {
        targetOrg: options.targetOrg,
        totalMannequins: mappedRecords.length,
        reclaimedCount,
        invitedCount,
        unmappedCount,
        records: mappedRecords,
        unmappedUsers,
        limitationsNotice: COMMIT_AUTHORSHIP_LIMITATION_NOTICE,
      };
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
