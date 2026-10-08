import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationResultsManifest,
  type MigrationResultsSummary,
  type MigrationScope,
  type ModuleExecutionResult,
  type OperationExecutionResult,
  type OrgModuleResultSummary,
  type RepositoryMigrationRecord,
  type VerificationReport,
  validateMigrationResultsManifest,
} from '@ghec/contracts';
import type {
  MigrationExecutionReport,
  RepositoryPipelineResult,
} from '../orchestrator/types.js';
import {
  type RepositoryDiscrepancyDetail,
  type RepositoryFailureDetails,
  type RepositorySuccessDetails,
  formatFailureRepoMarkdown,
  formatResultsReadmeMarkdown,
  formatSuccessRepoMarkdown,
} from './results-markdown-formatter.js';

export interface RemediationPlanLike {
  readonly actions?:
    | readonly {
        readonly id?: string | undefined;
        readonly moduleId?: string | undefined;
        readonly resourceName?: string | undefined;
        readonly description?: string | undefined;
        readonly command?: string | undefined;
        readonly severity?: string | undefined;
      }[]
    | undefined;
}

export interface GenerateResultsOptions {
  readonly runId?: string | undefined;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly targetResultsRepo?: string | undefined;
  readonly executionMode: 'dry-run' | 'live';
  readonly executionReport?: MigrationExecutionReport | undefined;
  readonly verificationReport?: VerificationReport | undefined;
  readonly remediationPlan?: RemediationPlanLike | undefined;
  readonly scope?: MigrationScope | undefined;
  readonly pipelineResults?: readonly RepositoryPipelineResult[] | undefined;
  readonly repositoryRecords?: readonly RepositoryMigrationRecord[] | undefined;
  readonly durationMs?: number | undefined;
  readonly generatedAt?: string | undefined;
  readonly nextSteps?: readonly string[] | undefined;
}

export interface GeneratedResults {
  readonly manifest: MigrationResultsManifest;
  readonly files: Record<string, string>;
}

const ORG_LEVEL_MODULE_IDS = new Set([
  'teams',
  'org-variables',
  'org-secrets',
  'post-migration-mannequins',
  'custom-properties',
  'rulesets-org',
]);

/**
 * Compiles migration execution outputs, verification results, and remediation actions
 * into a complete MigrationResultsManifest and GFM markdown file map.
 */
export function generateMigrationResults(
  options: GenerateResultsOptions,
): GeneratedResults {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const runId =
    options.runId ?? options.executionReport?.planId ?? `run-${Date.now()}`;
  const targetResultsRepo =
    options.targetResultsRepo ?? 'gei-migration-results';

  // 1. Build Org Modules Summary
  const orgModulesSummary: Record<string, OrgModuleResultSummary> = {};
  if (options.executionReport?.results) {
    for (const modResult of options.executionReport.results) {
      if (
        ORG_LEVEL_MODULE_IDS.has(modResult.moduleId) ||
        modResult.moduleId.startsWith('org-')
      ) {
        const total = modResult.results.length;
        const succeeded = modResult.results.filter(
          (o: OperationExecutionResult) => o.status === 'succeeded',
        ).length;
        const failed = modResult.results.filter(
          (o: OperationExecutionResult) => o.status === 'failed',
        ).length;
        const skipped = modResult.results.filter(
          (o: OperationExecutionResult) => o.status === 'skipped',
        ).length;

        orgModulesSummary[modResult.moduleId] = {
          status: modResult.status,
          totalOperations: total,
          succeededOperations: succeeded,
          failedOperations: failed,
          skippedOperations: skipped,
          durationMs: modResult.durationMs,
        };
      }
    }
  }

  // 2. Correlate Discrepancies and Remediation per repository
  const repoDiscrepancies = new Map<string, RepositoryDiscrepancyDetail[]>();
  if (options.verificationReport?.modules) {
    for (const mod of options.verificationReport.modules) {
      for (const disc of mod.discrepancies) {
        // Discrepancy resourceName often formatted as "<repo>:<resource>" or "<repo>/<resource>"
        const colonIdx = disc.resourceName.indexOf(':');
        const slashIdx = disc.resourceName.indexOf('/');
        const splitIdx =
          colonIdx !== -1 && slashIdx !== -1
            ? Math.min(colonIdx, slashIdx)
            : colonIdx !== -1
              ? colonIdx
              : slashIdx;

        const repoKey =
          splitIdx !== -1
            ? disc.resourceName.slice(0, splitIdx)
            : disc.resourceName;

        const existing = repoDiscrepancies.get(repoKey) ?? [];
        existing.push({
          resourceName: disc.resourceName,
          expected: disc.expected,
          actual: disc.actual,
          message: disc.message,
        });
        repoDiscrepancies.set(repoKey, existing);
      }
    }
  }

  const repoRemediationCommands = new Map<string, string[]>();
  if (options.remediationPlan?.actions) {
    for (const action of options.remediationPlan.actions) {
      if (action.command && action.resourceName) {
        const colonIdx = action.resourceName.indexOf(':');
        const repoKey =
          colonIdx !== -1
            ? action.resourceName.slice(0, colonIdx)
            : action.resourceName;
        const cmds = repoRemediationCommands.get(repoKey) ?? [];
        if (!cmds.includes(action.command)) {
          cmds.push(action.command);
        }
        repoRemediationCommands.set(repoKey, cmds);
      }
    }
  }

  // 3. Construct RepositoryMigrationRecords
  const repositories: RepositoryMigrationRecord[] = [];
  const repoSuccessDetails = new Map<string, RepositorySuccessDetails>();
  const repoFailureDetails = new Map<string, RepositoryFailureDetails>();

  if (options.repositoryRecords) {
    repositories.push(...options.repositoryRecords);
  } else if (options.pipelineResults && options.pipelineResults.length > 0) {
    for (const pipeResult of options.pipelineResults) {
      const discrepancies =
        repoDiscrepancies.get(pipeResult.targetRepo) ??
        repoDiscrepancies.get(pipeResult.sourceRepo) ??
        [];
      const isClean =
        pipeResult.status === 'complete' &&
        !pipeResult.error &&
        discrepancies.length === 0;

      const durationMs =
        pipeResult.moduleResults.reduce(
          (acc, m) => acc + (m.durationMs || 0),
          0,
        ) || 5000;
      const stagesRun =
        pipeResult.completedStages.length > 0
          ? [...pipeResult.completedStages]
          : ['core-transfer'];
      const remediation =
        repoRemediationCommands.get(pipeResult.targetRepo) ?? [];

      if (isClean) {
        repositories.push({
          sourceRepo: pipeResult.sourceRepo,
          targetRepo: pipeResult.targetRepo,
          status: 'succeeded',
          relativeFilePath: `success/${pipeResult.targetRepo}.md`,
          durationMs,
          stagesRun,
          verified: true,
          discrepancyCount: 0,
          warnings: [],
        });
        repoSuccessDetails.set(pipeResult.targetRepo, {
          name: pipeResult.targetRepo,
          geiLogSummary: pipeResult.geiResult?.migrationId
            ? `GEI Migration ID: ${pipeResult.geiResult.migrationId}`
            : undefined,
        });
      } else {
        const failureReason =
          pipeResult.error ??
          (discrepancies.length > 0
            ? `Verification detected ${discrepancies.length} discrepancy(ies) at destination.`
            : 'Migration stage failed.');

        repositories.push({
          sourceRepo: pipeResult.sourceRepo,
          targetRepo: pipeResult.targetRepo,
          status: 'failed',
          relativeFilePath: `failure/${pipeResult.targetRepo}.md`,
          durationMs,
          stagesRun,
          verified: false,
          discrepancyCount: discrepancies.length,
          failureReason,
          failedStage: pipeResult.error ? 'gei' : 'verification',
          warnings: [],
          remediationCommands:
            remediation.length > 0
              ? remediation
              : [
                  `ghec-consultant-cli migrate --scope <scope> --repos ${pipeResult.sourceRepo}`,
                ],
        });
        repoFailureDetails.set(pipeResult.targetRepo, {
          name: pipeResult.targetRepo,
          failedStage: pipeResult.error ? 'gei' : 'verification',
          errorMessage: failureReason,
          discrepancies,
          remediationCommands: remediation,
        });
      }
    }
  } else if (
    options.scope?.repositories &&
    options.scope.repositories.length > 0
  ) {
    for (const repoMap of options.scope.repositories) {
      const discrepancies =
        repoDiscrepancies.get(repoMap.targetRepo) ??
        repoDiscrepancies.get(repoMap.sourceRepo) ??
        [];
      const isClean = discrepancies.length === 0;
      const remediation = repoRemediationCommands.get(repoMap.targetRepo) ?? [];

      if (isClean) {
        repositories.push({
          sourceRepo: repoMap.sourceRepo,
          targetRepo: repoMap.targetRepo,
          status: 'succeeded',
          relativeFilePath: `success/${repoMap.targetRepo}.md`,
          durationMs: 10000,
          stagesRun: ['preflight', 'gei', 'verification'],
          verified: true,
          discrepancyCount: 0,
          warnings: [],
        });
        repoSuccessDetails.set(repoMap.targetRepo, {
          name: repoMap.targetRepo,
        });
      } else {
        const failureReason = `Verification detected ${discrepancies.length} discrepancy(ies) at destination.`;
        repositories.push({
          sourceRepo: repoMap.sourceRepo,
          targetRepo: repoMap.targetRepo,
          status: 'failed',
          relativeFilePath: `failure/${repoMap.targetRepo}.md`,
          durationMs: 10000,
          stagesRun: ['preflight', 'gei', 'verification'],
          verified: false,
          discrepancyCount: discrepancies.length,
          failureReason,
          failedStage: 'verification',
          warnings: [],
          remediationCommands:
            remediation.length > 0
              ? remediation
              : [`ghec-consultant-cli agent-review --report <report>`],
        });
        repoFailureDetails.set(repoMap.targetRepo, {
          name: repoMap.targetRepo,
          failedStage: 'verification',
          errorMessage: failureReason,
          discrepancies,
          remediationCommands: remediation,
        });
      }
    }
  }

  // 4. Calculate Summary Metrics
  const totalRepositories = repositories.length;
  const succeededCount = repositories.filter(
    (r) => r.status === 'succeeded',
  ).length;
  const failedCount = repositories.filter((r) => r.status === 'failed').length;
  const successRatePercent =
    totalRepositories === 0
      ? 100
      : Number(((succeededCount / totalRepositories) * 100).toFixed(2));
  const totalDurationMs =
    options.durationMs ??
    (options.executionReport
      ? options.executionReport.results.reduce(
          (acc: number, r: ModuleExecutionResult) => acc + (r.durationMs || 0),
          0,
        )
      : repositories.reduce(
          (acc: number, r: RepositoryMigrationRecord) => acc + r.durationMs,
          0,
        ));

  const summary: MigrationResultsSummary = {
    totalRepositories,
    succeededCount,
    failedCount,
    successRatePercent,
    durationMs: totalDurationMs,
    orgModulesSummary,
  };

  const manifest: MigrationResultsManifest = {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    runId,
    generatedAt,
    sourceOrg: options.sourceOrg,
    targetOrg: options.targetOrg,
    targetResultsRepo,
    executionMode: options.executionMode,
    summary,
    repositories,
  };

  const validation = validateMigrationResultsManifest(manifest);
  if (!validation.success) {
    const errorDetails = validation.error.issues
      .map((i) => `[${i.path.join('.')}] ${i.message}`)
      .join(', ');
    throw new Error(
      `Failed to generate valid MigrationResultsManifest: ${errorDetails}`,
    );
  }

  // 5. Generate File Map
  const files: Record<string, string> = {};
  files['README.md'] = formatResultsReadmeMarkdown(manifest, {
    nextSteps: options.nextSteps,
  });
  files['manifest.json'] = JSON.stringify(manifest, null, 2);

  for (const repo of manifest.repositories) {
    if (repo.status === 'succeeded') {
      const details = repoSuccessDetails.get(repo.targetRepo) ?? {
        name: repo.targetRepo,
      };
      files[repo.relativeFilePath] = formatSuccessRepoMarkdown(repo, details);
    } else {
      const details: RepositoryFailureDetails = repoFailureDetails.get(
        repo.targetRepo,
      ) ?? {
        name: repo.targetRepo,
        failedStage: repo.failedStage,
        errorMessage: repo.failureReason,
        remediationCommands: repo.remediationCommands,
      };
      files[repo.relativeFilePath] = formatFailureRepoMarkdown(repo, details);
    }
  }

  return { manifest, files };
}

/**
 * Safely writes generated migration result files to a specified local directory.
 */
export function writeResultsToDirectory(
  results: GeneratedResults,
  outputDir: string,
): string[] {
  const writtenFiles: string[] = [];
  mkdirSync(outputDir, { recursive: true });

  for (const [relPath, content] of Object.entries(results.files)) {
    const fullPath = join(outputDir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
    writtenFiles.push(fullPath);
  }

  return writtenFiles;
}
