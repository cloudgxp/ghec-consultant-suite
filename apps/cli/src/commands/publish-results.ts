import { parseArgs } from 'node:util';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DiscoveryBundle,
  MIGRATION_SCHEMA_VERSION,
  type MigrationPlan,
  type MigrationScope,
  type VerificationReport,
  validateBundle,
  validateMigrationPlan,
  validateMigrationScope,
  validateVerificationReport,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  appendStepSummary,
  deduplicateExecutionReportResults,
  generateMigrationResults,
  type GeneratedResults,
  type MigrationExecutionReport,
  MigrationResultsRepoPublisher,
  type PublishCommitResult,
  type TargetWriteClient,
  writeResultsToDirectory,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  type CliDualConfigOptions,
} from '../config/index.js';
import type { CliOverrides } from '../index.js';
import { loadExecutionReports } from './agent-review.js';

export interface PublishResultsCommandOptions {
  readonly executionReportPath?: string | undefined;
  readonly verificationReportPath?: string | undefined;
  readonly remediationPlanPath?: string | undefined;
  readonly discoveryReportPath?: string | undefined;
  readonly evidenceDir?: string | undefined;
  readonly dashboardDir?: string | undefined;
  readonly noPages?: boolean | undefined;
  readonly scopePath?: string | undefined;
  readonly planPath?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly sourceOrg?: string | undefined;
  readonly repoName: string;
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly forcePush?: boolean | undefined;
  readonly skipPush: boolean;
  readonly appendStepSummary: boolean;
  readonly branch: string;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly verbose?: boolean | undefined;
}

export interface PublishResultsCommandResult {
  readonly results: GeneratedResults;
  readonly writtenFiles: readonly string[];
  readonly publishResult?: PublishCommitResult | undefined;
  readonly repoUrl: string;
}

export function parsePublishResultsOptions(
  args: string[],
): PublishResultsCommandOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      'execution-report': { type: 'string' },
      'execution-reports': { type: 'string' },
      'verification-report': { type: 'string' },
      report: { type: 'string' },
      'remediation-plan': { type: 'string' },
      'discovery-report': { type: 'string' },
      'discovery-bundle': { type: 'string' },
      'evidence-dir': { type: 'string' },
      'dashboard-dir': { type: 'string' },
      'no-pages': { type: 'boolean', default: false },
      scope: { type: 'string' },
      plan: { type: 'string' },
      'target-org': { type: 'string' },
      'source-org': { type: 'string' },
      'repo-name': { type: 'string', default: 'migration-audit-results' },
      'output-dir': { type: 'string', default: './scans/results-repo' },
      'dry-run': { type: 'boolean', default: false },
      'force-push': { type: 'boolean', default: false },
      'skip-push': { type: 'boolean', default: false },
      'append-step-summary': { type: 'boolean', default: false },
      branch: { type: 'string', default: 'main' },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
  });

  return {
    executionReportPath:
      values['execution-report'] ?? values['execution-reports'],
    verificationReportPath: values['verification-report'] ?? values.report,
    remediationPlanPath: values['remediation-plan'],
    discoveryReportPath:
      values['discovery-report'] ?? values['discovery-bundle'],
    evidenceDir: values['evidence-dir'],
    dashboardDir: values['dashboard-dir'],
    noPages: values['no-pages'] ?? false,
    scopePath: values.scope,
    planPath: values.plan,
    targetOrg: values['target-org'],
    sourceOrg: values['source-org'],
    repoName: values['repo-name'] || 'migration-audit-results',
    outputDir: values['output-dir'] || './scans/results-repo',
    dryRun: values['dry-run'] ?? false,
    forcePush: values['force-push'] ?? false,
    skipPush: values['skip-push'] ?? false,
    appendStepSummary: values['append-step-summary'] ?? false,
    branch: values.branch || 'main',
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
    verbose: values.verbose ?? false,
  };
}

function collectEvidenceDirectoryFiles(
  evidenceDir: string,
  outputDir: string,
): Record<string, string> {
  const collected: Record<string, string> = {};
  const dirs = evidenceDir
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const absOutputDir = resolve(outputDir);
  const allowedExts = new Set(['.json', '.md', '.sh', '.log', '.csv', '.txt']);

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      continue;
    }
    const absEvidenceDir = resolve(dir);
    const walk = (currentDir: string, depth: number): void => {
      if (depth > 2) return;
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (
          fullPath === absOutputDir ||
          fullPath.startsWith(`${absOutputDir}/`) ||
          entry.name === 'results-repo' ||
          entry.name === 'audit-results-repo'
        ) {
          continue;
        }
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const dotIdx = entry.name.lastIndexOf('.');
          const ext =
            dotIdx !== -1 ? entry.name.slice(dotIdx).toLowerCase() : '';
          if (allowedExts.has(ext)) {
            const relPath = relative(absEvidenceDir, fullPath).replace(
              /\\/g,
              '/',
            );
            collected[relPath] = readFileSync(fullPath, 'utf-8');
          }
        }
      }
    };
    walk(absEvidenceDir, 0);
  }

  return collected;
}

function resolveDefaultDashboardDistDir(): string | undefined {
  const currentModuleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentModuleDir, '../../../dashboard/dist'),
    resolve(currentModuleDir, '../../dashboard/dist'),
    resolve(currentModuleDir, '../apps/dashboard/dist'),
    resolve(process.cwd(), 'apps/dashboard/dist'),
    resolve(process.cwd(), 'dashboard/dist'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return undefined;
}

export function collectDashboardDirectoryFiles(
  explicitDashboardDir?: string | undefined,
): Record<string, string> | undefined {
  const dir = explicitDashboardDir
    ? resolve(explicitDashboardDir)
    : resolveDefaultDashboardDistDir();
  if (!dir || !existsSync(join(dir, 'index.html'))) {
    return undefined;
  }

  const collected: Record<string, string> = {};
  const allowedExts = new Set([
    '.html',
    '.js',
    '.css',
    '.svg',
    '.json',
    '.txt',
  ]);

  const walk = (currentDir: string, depth: number): void => {
    if (depth > 3) return;
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const dotIdx = entry.name.lastIndexOf('.');
        const ext = dotIdx !== -1 ? entry.name.slice(dotIdx).toLowerCase() : '';
        if (allowedExts.has(ext)) {
          const relPath = relative(dir, fullPath).replace(/\\/g, '/');
          collected[relPath] = readFileSync(fullPath, 'utf-8');
        }
      }
    }
  };

  walk(dir, 0);
  return Object.keys(collected).length > 0 ? collected : undefined;
}

export async function executePublishResultsCommand(
  options: PublishResultsCommandOptions,
  clientOverrides?: CliOverrides | undefined,
  signal: AbortSignal = new AbortController().signal,
): Promise<PublishResultsCommandResult> {
  // 1. Load Scope if provided
  let scope: MigrationScope | undefined;
  if (options.scopePath && existsSync(options.scopePath)) {
    const raw = readFileSync(options.scopePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = validateMigrationScope(parsed);
    if (!validated.success) {
      throw new Error(`Invalid migration scope: ${options.scopePath}`);
    }
    scope = validated.data;
  }

  // 1b. Load Plan if provided
  let plan: MigrationPlan | undefined;
  if (options.planPath && existsSync(options.planPath)) {
    const raw = readFileSync(options.planPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = validateMigrationPlan(parsed);
    if (!validated.success) {
      throw new Error(`Invalid migration plan: ${options.planPath}`);
    }
    plan = validated.data;
  }

  // 1c. Load Discovery Report / Bundle if provided
  let discoveryBundle: DiscoveryBundle | undefined;
  if (options.discoveryReportPath && existsSync(options.discoveryReportPath)) {
    const raw = readFileSync(options.discoveryReportPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidate =
      parsed &&
      typeof parsed === 'object' &&
      parsed.discoveryBundle &&
      typeof parsed.discoveryBundle === 'object'
        ? parsed.discoveryBundle
        : parsed;
    const validated = validateBundle(candidate);
    if (validated.success) {
      discoveryBundle = validated.data;
    } else if (
      candidate &&
      typeof candidate === 'object' &&
      Array.isArray((candidate as { entities?: unknown }).entities)
    ) {
      discoveryBundle = candidate as unknown as DiscoveryBundle;
    }
  }

  const discoveryOrg =
    discoveryBundle?.organizations?.[0]?.login ??
    (discoveryBundle?.scope?.kind === 'organization'
      ? discoveryBundle.scope.organizationId
      : undefined);

  // 2. Resolve source and target org
  const sourceOrg =
    options.sourceOrg ??
    scope?.organizations[0]?.source ??
    scope?.repositories[0]?.sourceOrg ??
    discoveryOrg ??
    'source-org';

  const targetOrg =
    options.targetOrg ??
    scope?.organizations[0]?.target ??
    scope?.repositories[0]?.targetOrg ??
    discoveryOrg;

  if (!targetOrg) {
    throw new Error(
      'Target organization is required: specify via --target-org or within --scope.',
    );
  }

  // 3. Load Execution Report(s) if provided
  let executionReport: MigrationExecutionReport | undefined;
  if (options.executionReportPath) {
    const isMultiOrDir =
      options.executionReportPath.includes(',') ||
      (existsSync(options.executionReportPath) &&
        statSync(options.executionReportPath).isDirectory());
    if (isMultiOrDir) {
      const loaded = loadExecutionReports(options.executionReportPath);
      if (loaded.reports.length > 0) {
        const mergedResults = deduplicateExecutionReportResults(
          loaded.reports.flatMap((r) => r.results),
        );
        const isSandboxRehearsal = Boolean(
          loaded.reports.some((r) => r.sandboxRehearsal) ||
          scope?.sandboxRehearsal ||
          plan?.sandboxRehearsal,
        );
        executionReport = {
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          planId: loaded.reports[0]?.planId ?? 'merged-execution-plan',
          executedAt:
            loaded.reports[loaded.reports.length - 1]?.executedAt ??
            new Date().toISOString(),
          status: loaded.reports.every((r) => r.status === 'complete')
            ? 'complete'
            : loaded.reports.some((r) => r.status === 'failed')
              ? 'failed'
              : 'partial',
          exitCode: loaded.reports.every((r) => r.exitCode === 0) ? 0 : 1,
          dryRun: options.dryRun,
          ...(isSandboxRehearsal ? { sandboxRehearsal: true } : {}),
          results: mergedResults,
        };
      }
    } else if (existsSync(options.executionReportPath)) {
      const raw = readFileSync(options.executionReportPath, 'utf-8');
      executionReport = JSON.parse(raw) as MigrationExecutionReport;
    }
  }

  // 4. Load Verification Report if provided
  let verificationReport: VerificationReport | undefined;
  if (
    options.verificationReportPath &&
    existsSync(options.verificationReportPath)
  ) {
    const raw = readFileSync(options.verificationReportPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = validateVerificationReport(parsed);
    if (validated.success) {
      verificationReport = validated.data;
    }
  }

  // 5. Load Remediation Plan if provided
  let remediationPlan:
    | {
        readonly actions?: readonly {
          readonly command?: string;
          readonly resourceName?: string;
        }[];
      }
    | undefined;
  if (options.remediationPlanPath && existsSync(options.remediationPlanPath)) {
    const raw = readFileSync(options.remediationPlanPath, 'utf-8');
    remediationPlan = JSON.parse(raw);
  }

  // 5b. Collect supplementary evidence files if --evidence-dir was provided
  const evidenceFiles = options.evidenceDir
    ? collectEvidenceDirectoryFiles(options.evidenceDir, options.outputDir)
    : undefined;

  // 5c. Collect pre-built static dashboard assets for Private GitHub Pages unless --no-pages
  const dashboardFiles = options.noPages
    ? undefined
    : collectDashboardDirectoryFiles(options.dashboardDir);

  // 6. Generate results manifest & files
  const results = generateMigrationResults({
    sourceOrg,
    targetOrg,
    targetResultsRepo: options.repoName,
    executionMode: options.dryRun ? 'dry-run' : 'live',
    discoveryBundle,
    evidenceFiles,
    dashboardFiles,
    executionReport,
    verificationReport,
    remediationPlan,
    scope,
    plan,
  });

  // 7. Write files to output directory
  const writtenFiles = writeResultsToDirectory(results, options.outputDir);

  // 8. Publish to target repository unless --skip-push
  let publishResult: PublishCommitResult | undefined;
  const repoUrl = `https://github.com/${targetOrg}/${options.repoName}`;

  if (!options.skipPush) {
    let targetClient: GitHubReadAdapter | undefined =
      clientOverrides?.targetClient;
    let targetWriteClient: TargetWriteClient | undefined =
      clientOverrides?.targetWriteClient;

    if (!targetClient) {
      const configOptions: CliDualConfigOptions = {
        appId: options.appId,
        privateKeyPath: options.privateKeyPath,
        installationId: options.installationId,
        sourceToken: options.sourceToken,
        targetToken: options.targetToken,
      };
      const dualConfig = loadDualConfig(configOptions);
      const clients = createMigrationClientsFromConfig(dualConfig);
      targetClient = clients.targetClient;
      targetWriteClient = targetWriteClient ?? clients.targetWriteClient;
    }

    const publisher = new MigrationResultsRepoPublisher({
      targetOrg,
      repoName: options.repoName,
      targetClient,
      targetWriteClient,
      dryRun: options.forcePush ? false : options.dryRun,
      branch: options.branch,
      enablePages: options.noPages ? false : undefined,
      signal,
    });

    publishResult = await publisher.publish(results.files);
  }

  // 9. Append step summary if requested
  if (options.appendStepSummary) {
    const blobBaseUrl = `${repoUrl}/blob/${options.branch}`;
    let stepSummaryReadme = (results.files['README.md'] ?? '')
      .replaceAll(
        '](POST-CARE-CHECKLIST.md)',
        `](${blobBaseUrl}/POST-CARE-CHECKLIST.md)`,
      )
      .replaceAll('](exports/', `](${blobBaseUrl}/exports/`)
      .replaceAll('](evidence/', `](${blobBaseUrl}/evidence/`)
      .replaceAll('](organization/', `](${blobBaseUrl}/organization/`)
      .replaceAll('](success/', `](${blobBaseUrl}/success/`)
      .replaceAll('](failure/', `](${blobBaseUrl}/failure/`)
      .replaceAll('](repositories/', `](${blobBaseUrl}/repositories/`);
    if (publishResult?.pagesUrl) {
      stepSummaryReadme = stepSummaryReadme.replace(
        /> \*\*Visual Dashboard \(Private GitHub Pages\):\*\* Pre-built in this repository \([^\n]+\)/,
        `> **Visual Dashboard (Private GitHub Pages):** [Open Interactive Dashboard](${publishResult.pagesUrl})`,
      );
    }
    appendStepSummary(stepSummaryReadme);
  }

  // 10. Console output
  console.log(`\n📦 Migration Results Generated:`);
  console.log(`   - Output Directory: ${options.outputDir}`);
  console.log(`   - Total Files:      ${writtenFiles.length}`);
  console.log(
    `   - Repositories:     ${results.manifest.summary.totalRepositories}`,
  );
  console.log(
    `   - Succeeded:        ${results.manifest.summary.succeededCount}`,
  );
  console.log(`   - Failed:           ${results.manifest.summary.failedCount}`);
  console.log(
    `   - Success Rate:     ${results.manifest.summary.successRatePercent}%`,
  );
  if (results.postCare) {
    console.log(`   - Post-Care Items:  ${results.postCare.items.length}`);
  }

  if (publishResult) {
    console.log(`\n🚀 Results Repository:`);
    console.log(`   - Repository URL:   ${publishResult.repoUrl}`);
    console.log(`   - Commit SHA:       ${publishResult.commitSha}`);
    if (publishResult.pagesUrl) {
      console.log(`   - Dashboard Pages:  ${publishResult.pagesUrl}`);
    }
    console.log(
      `   - Execution Mode:   ${publishResult.dryRun ? 'Dry-Run' : 'Live'}`,
    );
  }

  return {
    results,
    writtenFiles,
    publishResult,
    repoUrl,
  };
}
