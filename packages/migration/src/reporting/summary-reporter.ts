import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MigrationPlan, VerificationReport } from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';
import type { MigrationExecutionReport } from '../orchestrator/types.js';
import type {
  MigrationRunSummary,
  ModuleOpCounts,
  RehydrationSummary,
  CoreTransferSummary,
  PostMigrationSummary,
  MetadataFailureSummary,
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

function accumulateCounts(
  existing: ModuleOpCounts | undefined,
  delta: ModuleOpCounts,
): ModuleOpCounts {
  if (!existing) {
    return delta;
  }
  return {
    planned: existing.planned + delta.planned,
    succeeded: existing.succeeded + delta.succeeded,
    failed: existing.failed + delta.failed,
  };
}

/**
 * Builds a standardized MigrationRunSummary from a MigrationExecutionReport.
 */
export function buildSummaryFromExecutionReport(
  report: MigrationExecutionReport,
  options: BuildSummaryOptions = {},
): MigrationRunSummary {
  const totalDurationMs =
    options.durationMs ??
    report.results.reduce((acc, r) => acc + (r.durationMs || 0), 0);

  let latestOpCompletedAt: string | undefined;
  for (const modResult of report.results) {
    for (const op of modResult.results) {
      if (
        op.completedAt &&
        (!latestOpCompletedAt || op.completedAt > latestOpCompletedAt)
      ) {
        latestOpCompletedAt = op.completedAt;
      }
    }
  }
  const executedAtMs = Date.parse(report.executedAt);
  const latestOpMs = latestOpCompletedAt
    ? Date.parse(latestOpCompletedAt)
    : Number.NaN;

  let startedAt: string;
  let completedAt: string;
  if (
    !Number.isNaN(executedAtMs) &&
    !Number.isNaN(latestOpMs) &&
    executedAtMs >= latestOpMs
  ) {
    completedAt = report.executedAt;
    startedAt =
      totalDurationMs > 0
        ? new Date(executedAtMs - totalDurationMs).toISOString()
        : latestOpCompletedAt!;
  } else {
    startedAt = report.executedAt;
    completedAt =
      latestOpCompletedAt ??
      (!Number.isNaN(executedAtMs) && totalDurationMs > 0
        ? new Date(executedAtMs + totalDurationMs).toISOString()
        : report.executedAt);
  }

  const errors: string[] = [];
  const warnings: string[] = [...(options.warnings ?? [])];

  if (options.plan?.modules) {
    for (const m of options.plan.modules) {
      if (m.warnings) {
        warnings.push(...m.warnings);
      }
    }
  }

  // Mutable accumulators
  const rehydration: {
    -readonly [K in keyof RehydrationSummary]?: ModuleOpCounts;
  } = {};
  const coreTransfer: {
    -readonly [K in keyof CoreTransferSummary]?: CoreTransferSummary[K];
  } = {};
  const postMigration: {
    -readonly [K in keyof PostMigrationSummary]?: PostMigrationSummary[K];
  } = {};
  const moduleBreakdown: Record<string, ModuleOpCounts> = {};
  const metadataFailures: MetadataFailureSummary[] = [];
  const healedFallbackCategories = new Set<string>();

  for (const modResult of report.results) {
    const filteredResults = modResult.results.filter((op) => {
      if (
        op.operationId.startsWith('op-autolink-noop-empty-') ||
        op.reason === 'No autolinks defined on source repository'
      ) {
        return false;
      }
      if (
        op.operationId.startsWith('codeowners:') &&
        op.operationType === 'noop' &&
        !op.reason &&
        op.resourceType === 'codeowners-file' &&
        Boolean(op.resourceName) &&
        !/(^|\/)CODEOWNERS$/i.test(op.resourceName ?? '')
      ) {
        return false;
      }
      return true;
    });
    const rawCounts = countOperations(filteredResults);
    const counts: ModuleOpCounts =
      modResult.moduleId === 'gei-repo' && rawCounts.planned === 0
        ? modResult.status === 'failed'
          ? { planned: 1, succeeded: 0, failed: 1 }
          : modResult.status === 'complete' || modResult.status === 'partial'
            ? { planned: 1, succeeded: 1, failed: 0 }
            : rawCounts
        : rawCounts;

    moduleBreakdown[modResult.moduleId] = accumulateCounts(
      moduleBreakdown[modResult.moduleId],
      counts,
    );

    if (
      modResult.failedMetadataCategories &&
      modResult.failedMetadataCategories.length > 0
    ) {
      const unhealedCategories = modResult.failedMetadataCategories.filter(
        (cat) => {
          const healed = report.results.some(
            (r) =>
              r.moduleId === cat &&
              (!modResult.targetIdentifier ||
                !r.targetIdentifier ||
                r.targetIdentifier === modResult.targetIdentifier) &&
              (r.status === 'complete' || r.status === 'skipped'),
          );
          if (healed) {
            healedFallbackCategories.add(cat);
          }
          return !healed;
        },
      );
      if (unhealedCategories.length > 0) {
        metadataFailures.push({
          ...(modResult.targetIdentifier
            ? { repository: modResult.targetIdentifier }
            : {}),
          categories: unhealedCategories,
          fallbackCommands: unhealedCategories.map(
            (cat) =>
              `ghec-consultant-cli migrate --modules ${cat} --scope <scope>`,
          ),
        });
      }
    }

    // Collect errors with target attribution and DEC-004 sanitization
    for (const opResult of filteredResults) {
      if (opResult.status === 'failed' && opResult.error) {
        const targetId =
          modResult.targetIdentifier || opResult.targetIdentifier;
        const prefix = targetId
          ? `[${modResult.moduleId} @ ${targetId}]`
          : `[${modResult.moduleId}]`;
        errors.push(sanitizeDiagnostics(`${prefix} ${opResult.error}`));
      }
    }

    switch (modResult.moduleId) {
      case 'gei-repo': {
        const prev = coreTransfer.gei;
        const repoSkippedReleases =
          modResult.failedMetadataCategories?.includes('releases') ? 1 : 0;
        coreTransfer.gei = {
          total: (prev?.total ?? 0) + counts.planned,
          succeeded: (prev?.succeeded ?? 0) + counts.succeeded,
          failed: (prev?.failed ?? 0) + counts.failed,
          skippedReleases: (prev?.skippedReleases ?? 0) + repoSkippedReleases,
        };
        break;
      }
      case 'lfs':
      case 'git-lfs': {
        const prev = coreTransfer.lfs;
        let lfsBytes = 0;
        for (const op of filteredResults) {
          if (op.status === 'succeeded' && op.reason) {
            const byteMatch = /\((\d+)\s+bytes\b/i.exec(op.reason);
            if (byteMatch?.[1]) {
              lfsBytes += Number.parseInt(byteMatch[1], 10);
            }
          }
        }
        coreTransfer.lfs = {
          repositoriesWithLfs:
            (prev?.repositoriesWithLfs ?? 0) + (counts.succeeded > 0 ? 1 : 0),
          objectsTransferred:
            (prev?.objectsTransferred ?? 0) + counts.succeeded,
          bytesTransferred: (prev?.bytesTransferred ?? 0) + lfsBytes,
        };
        break;
      }
      case 'releases': {
        const prev = coreTransfer.largeReleases;
        let releaseAssetsStreamed = 0;
        let releaseBytes = 0;
        for (const op of filteredResults) {
          if (
            op.status === 'succeeded' &&
            (op.resourceType === 'release-asset' ||
              op.operationId.startsWith('release-asset:'))
          ) {
            releaseAssetsStreamed++;
            if (op.reason) {
              const byteMatch = /\((\d+)\s+bytes\b/i.exec(op.reason);
              if (byteMatch?.[1]) {
                releaseBytes += Number.parseInt(byteMatch[1], 10);
              }
            }
          }
        }
        coreTransfer.largeReleases = {
          repositoriesWithLargeReleases:
            (prev?.repositoriesWithLargeReleases ?? 0) +
            (counts.succeeded > 0 ? 1 : 0),
          assetsStreamed: (prev?.assetsStreamed ?? 0) + releaseAssetsStreamed,
          bytesStreamed: (prev?.bytesStreamed ?? 0) + releaseBytes,
        };
        break;
      }
      case 'repo-variables':
        rehydration.variables = accumulateCounts(rehydration.variables, counts);
        break;
      case 'repo-secrets':
        rehydration.secrets = accumulateCounts(rehydration.secrets, counts);
        break;
      case 'environments':
        rehydration.environments = accumulateCounts(
          rehydration.environments,
          counts,
        );
        break;
      case 'rulesets':
        rehydration.rulesets = accumulateCounts(rehydration.rulesets, counts);
        break;
      case 'org-rulesets':
        rehydration.orgRulesets = accumulateCounts(
          rehydration.orgRulesets,
          counts,
        );
        break;
      case 'branch-protection':
        rehydration.branchProtection = accumulateCounts(
          rehydration.branchProtection,
          counts,
        );
        break;
      case 'teams':
        rehydration.teams = accumulateCounts(rehydration.teams, counts);
        break;
      case 'repo-settings':
        rehydration.repoSettings = accumulateCounts(
          rehydration.repoSettings,
          counts,
        );
        break;
      case 'org-settings':
        rehydration.orgSettings = accumulateCounts(
          rehydration.orgSettings,
          counts,
        );
        break;
      case 'org-variables':
        rehydration.orgVariables = accumulateCounts(
          rehydration.orgVariables,
          counts,
        );
        break;
      case 'org-secrets':
        rehydration.orgSecrets = accumulateCounts(
          rehydration.orgSecrets,
          counts,
        );
        break;
      case 'custom-roles':
        rehydration.customRoles = accumulateCounts(
          rehydration.customRoles,
          counts,
        );
        break;
      case 'org-custom-properties':
        rehydration.orgCustomProperties = accumulateCounts(
          rehydration.orgCustomProperties,
          counts,
        );
        break;
      case 'repo-custom-properties':
        rehydration.repoCustomProperties = accumulateCounts(
          rehydration.repoCustomProperties,
          counts,
        );
        break;
      case 'collaborators':
        rehydration.collaborators = accumulateCounts(
          rehydration.collaborators,
          counts,
        );
        break;
      case 'deploy-keys':
        rehydration.deployKeys = accumulateCounts(
          rehydration.deployKeys,
          counts,
        );
        break;
      case 'autolinks':
        rehydration.autolinks = accumulateCounts(rehydration.autolinks, counts);
        break;
      case 'discussions':
        rehydration.discussions = accumulateCounts(
          rehydration.discussions,
          counts,
        );
        break;
      case 'issues':
        rehydration.issues = accumulateCounts(rehydration.issues, counts);
        break;
      case 'pull-requests':
        rehydration.pullRequests = accumulateCounts(
          rehydration.pullRequests,
          counts,
        );
        break;
      case 'projects-v2':
        rehydration.projectsV2 = accumulateCounts(
          rehydration.projectsV2,
          counts,
        );
        break;
      case 'actions-policies':
        rehydration.actionsPolicies = accumulateCounts(
          rehydration.actionsPolicies,
          counts,
        );
        break;
      case 'actions-runners':
        rehydration.actionsRunners = accumulateCounts(
          rehydration.actionsRunners,
          counts,
        );
        break;
      case 'ip-allow-lists':
        rehydration.ipAllowLists = accumulateCounts(
          rehydration.ipAllowLists,
          counts,
        );
        break;
      case 'apps-inventory':
        rehydration.appsInventory = accumulateCounts(
          rehydration.appsInventory,
          counts,
        );
        break;
      case 'packages':
        rehydration.packages = accumulateCounts(rehydration.packages, counts);
        break;
      case 'codeowners':
      case 'post-migration-codeowners':
        rehydration.codeowners = accumulateCounts(
          rehydration.codeowners,
          counts,
        );
        break;
      case 'security':
        rehydration.security = accumulateCounts(rehydration.security, counts);
        break;
      case 'mannequins':
      case 'post-migration-mannequins': {
        const prev = postMigration.mannequins;
        postMigration.mannequins = {
          total: (prev?.total ?? 0) + counts.planned,
          reclaimed: (prev?.reclaimed ?? 0) + counts.succeeded,
          unmapped: (prev?.unmapped ?? 0) + counts.failed,
        };
        break;
      }
      case 'webhooks':
      case 'org-webhooks': {
        const prev = postMigration.webhooks;
        postMigration.webhooks = {
          reEnabled: (prev?.reEnabled ?? 0) + counts.succeeded,
        };
        break;
      }
    }
  }

  // Derive source / target org
  const sourceOrg = options.sourceOrg ?? 'source-org';
  const targetOrg = options.targetOrg ?? 'target-org';

  if (report.recommendations) {
    for (const rec of report.recommendations) {
      const fallbackMatch = /Recommended fallback module:\s*'([^']+)'/i.exec(
        rec,
      );
      if (
        fallbackMatch?.[1] &&
        healedFallbackCategories.has(fallbackMatch[1]) &&
        metadataFailures.length === 0
      ) {
        continue;
      }
      if (!warnings.includes(rec)) {
        warnings.push(rec);
      }
    }
  }

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
    moduleBreakdown:
      Object.keys(moduleBreakdown).length > 0 ? moduleBreakdown : undefined,
    metadataFailures:
      metadataFailures.length > 0 ? metadataFailures : undefined,
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
