import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MigrationPlan, VerificationReport } from '@ghec/contracts';
import type { MigrationExecutionReport } from '../orchestrator/types.js';
import type {
  MigrationRunSummary,
  ModuleOpCounts,
  RehydrationSummary,
  CoreTransferSummary,
  PostMigrationSummary,
} from './types.js';

export interface BuildSummaryOptions {
  readonly runId?: string | undefined;
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly plan?: MigrationPlan | undefined;
  readonly durationMs?: number | undefined;
  readonly warnings?: readonly string[] | undefined;
}

function countOperations(
  results: readonly { status: string }[],
): ModuleOpCounts {
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'succeeded') succeeded++;
    else if (r.status === 'failed') failed++;
  }
  return {
    planned: results.length,
    succeeded,
    failed,
  };
}

/**
 * Builds a standardized MigrationRunSummary from a MigrationExecutionReport.
 */
export function buildSummaryFromExecutionReport(
  report: MigrationExecutionReport,
  options: BuildSummaryOptions = {},
): MigrationRunSummary {
  const startedAt = report.executedAt;
  const completedAt = new Date().toISOString();
  const totalDurationMs =
    options.durationMs ??
    report.results.reduce((acc, r) => acc + (r.durationMs || 0), 0);

  const errors: string[] = [];
  const warnings: string[] = [...(options.warnings ?? [])];

  if (options.plan?.modules) {
    for (const m of options.plan.modules) {
      if (m.warnings) {
        warnings.push(...m.warnings);
      }
    }
  }

  // Module maps
  const rehydration: RehydrationSummary = {};
  const coreTransfer: CoreTransferSummary = {};
  const postMigration: PostMigrationSummary = {};

  for (const modResult of report.results) {
    const counts = countOperations(modResult.results);

    // Collect errors
    for (const opResult of modResult.results) {
      if (opResult.status === 'failed' && opResult.error) {
        errors.push(`[${modResult.moduleId}] ${opResult.error}`);
      }
    }

    switch (modResult.moduleId) {
      case 'gei-repo':
        (
          coreTransfer as {
            gei?: {
              total: number;
              succeeded: number;
              failed: number;
              skippedReleases: number;
            };
          }
        ).gei = {
          total: counts.planned,
          succeeded: counts.succeeded,
          failed: counts.failed,
          skippedReleases: 0,
        };
        break;
      case 'git-lfs':
        (
          coreTransfer as {
            lfs?: {
              repositoriesWithLfs: number;
              objectsTransferred: number;
              bytesTransferred: number;
            };
          }
        ).lfs = {
          repositoriesWithLfs: counts.succeeded,
          objectsTransferred: 0,
          bytesTransferred: 0,
        };
        break;
      case 'releases':
        (
          coreTransfer as {
            largeReleases?: {
              repositoriesWithLargeReleases: number;
              assetsStreamed: number;
              bytesStreamed: number;
            };
          }
        ).largeReleases = {
          repositoriesWithLargeReleases: counts.succeeded,
          assetsStreamed: 0,
          bytesStreamed: 0,
        };
        break;
      case 'repo-variables':
        (rehydration as { variables?: ModuleOpCounts }).variables = counts;
        break;
      case 'repo-secrets':
        (rehydration as { secrets?: ModuleOpCounts }).secrets = counts;
        break;
      case 'environments':
        (rehydration as { environments?: ModuleOpCounts }).environments =
          counts;
        break;
      case 'rulesets':
        (rehydration as { rulesets?: ModuleOpCounts }).rulesets = counts;
        break;
      case 'branch-protection':
        (
          rehydration as { branchProtection?: ModuleOpCounts }
        ).branchProtection = counts;
        break;
      case 'teams':
        (rehydration as { teams?: ModuleOpCounts }).teams = counts;
        break;
      case 'post-migration-mannequins':
        (
          postMigration as {
            mannequins?: { total: number; reclaimed: number; unmapped: number };
          }
        ).mannequins = {
          total: counts.planned,
          reclaimed: counts.succeeded,
          unmapped: counts.failed,
        };
        break;
      case 'webhooks':
        (postMigration as { webhooks?: { reEnabled: number } }).webhooks = {
          reEnabled: counts.succeeded,
        };
        break;
    }
  }

  // Derive source / target org
  const sourceOrg = options.sourceOrg ?? 'source-org';
  const targetOrg = options.targetOrg ?? 'target-org';

  return {
    schemaVersion: '1.0.0',
    runId: options.runId ?? report.planId ?? 'unknown-run',
    startedAt,
    completedAt,
    durationMs: totalDurationMs,
    sourceOrg,
    targetOrg,
    status: report.status,
    dryRun: report.dryRun,
    coreTransfer:
      Object.keys(coreTransfer).length > 0 ? coreTransfer : undefined,
    rehydration: Object.keys(rehydration).length > 0 ? rehydration : undefined,
    postMigration:
      Object.keys(postMigration).length > 0 ? postMigration : undefined,
    warnings,
    errors,
  };
}

/**
 * Builds a standardized MigrationRunSummary from a VerificationReport.
 */
export function buildSummaryFromVerification(
  report: VerificationReport,
  options: {
    sourceOrg?: string | undefined;
    targetOrg?: string | undefined;
    runId?: string | undefined;
  } = {},
): MigrationRunSummary {
  const discrepancySummaries: string[] = [];

  for (const m of report.modules) {
    if (m.discrepancies) {
      for (const d of m.discrepancies) {
        discrepancySummaries.push(
          `[${m.moduleId}] ${d.resourceName}: expected "${d.expected}", got "${d.actual}" (${d.message})`,
        );
      }
    }
  }

  const isVerified =
    report.summary.unverifiedModuleCount === 0 &&
    report.summary.discrepancyCount === 0;

  return {
    schemaVersion: '1.0.0',
    runId: options.runId ?? report.reportId ?? 'unknown-verification',
    startedAt: report.verifiedAt,
    completedAt: report.verifiedAt,
    durationMs: 0,
    sourceOrg: options.sourceOrg ?? report.sourceOrg ?? 'source-org',
    targetOrg: options.targetOrg ?? report.targetOrg ?? 'target-org',
    status: isVerified ? 'complete' : 'failed',
    dryRun: false,
    verification: {
      verified: isVerified,
      totalDiscrepancies: report.summary.discrepancyCount,
      discrepancySummaries,
    },
    warnings: [],
    errors: isVerified
      ? []
      : [
          `Verification detected ${report.summary.discrepancyCount} state discrepancy(ies).`,
        ],
  };
}

/**
 * Writes a MigrationRunSummary object to disk formatted as formatted JSON.
 */
export function writeJsonSummaryFile(
  summary: MigrationRunSummary,
  outputPath: string,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
}

/**
 * Reads and parses a MigrationRunSummary from disk.
 */
export function readJsonSummaryFile(filePath: string): MigrationRunSummary {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as MigrationRunSummary;
}
