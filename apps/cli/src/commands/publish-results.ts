import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import {
  type MigrationScope,
  type VerificationReport,
  validateMigrationScope,
  validateVerificationReport,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  appendStepSummary,
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

export interface PublishResultsCommandOptions {
  readonly executionReportPath?: string | undefined;
  readonly verificationReportPath?: string | undefined;
  readonly remediationPlanPath?: string | undefined;
  readonly scopePath?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly sourceOrg?: string | undefined;
  readonly repoName: string;
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly skipPush: boolean;
  readonly appendStepSummary: boolean;
  readonly branch: string;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
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
      'verification-report': { type: 'string' },
      'remediation-plan': { type: 'string' },
      scope: { type: 'string' },
      'target-org': { type: 'string' },
      'source-org': { type: 'string' },
      'repo-name': { type: 'string', default: 'gei-migration-results' },
      'output-dir': { type: 'string', default: './scans/results-repo' },
      'dry-run': { type: 'boolean', default: false },
      'skip-push': { type: 'boolean', default: false },
      'append-step-summary': { type: 'boolean', default: false },
      branch: { type: 'string', default: 'main' },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
    },
  });

  return {
    executionReportPath: values['execution-report'],
    verificationReportPath: values['verification-report'],
    remediationPlanPath: values['remediation-plan'],
    scopePath: values.scope,
    targetOrg: values['target-org'],
    sourceOrg: values['source-org'],
    repoName: values['repo-name'] || 'gei-migration-results',
    outputDir: values['output-dir'] || './scans/results-repo',
    dryRun: values['dry-run'] ?? false,
    skipPush: values['skip-push'] ?? false,
    appendStepSummary: values['append-step-summary'] ?? false,
    branch: values.branch || 'main',
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
  };
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

  // 2. Resolve source and target org
  const sourceOrg =
    options.sourceOrg ??
    scope?.organizations[0]?.source ??
    scope?.repositories[0]?.sourceOrg ??
    'source-org';

  const targetOrg =
    options.targetOrg ??
    scope?.organizations[0]?.target ??
    scope?.repositories[0]?.targetOrg;

  if (!targetOrg) {
    throw new Error(
      'Target organization is required: specify via --target-org or within --scope.',
    );
  }

  // 3. Load Execution Report if provided
  let executionReport: MigrationExecutionReport | undefined;
  if (options.executionReportPath && existsSync(options.executionReportPath)) {
    const raw = readFileSync(options.executionReportPath, 'utf-8');
    executionReport = JSON.parse(raw) as MigrationExecutionReport;
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

  // 6. Generate results manifest & files
  const results = generateMigrationResults({
    sourceOrg,
    targetOrg,
    targetResultsRepo: options.repoName,
    executionMode: options.dryRun ? 'dry-run' : 'live',
    executionReport,
    verificationReport,
    remediationPlan,
    scope,
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
      dryRun: options.dryRun,
      branch: options.branch,
      signal,
    });

    publishResult = await publisher.publish(results.files);
  }

  // 9. Append step summary if requested
  if (options.appendStepSummary) {
    appendStepSummary(results.files['README.md'] ?? '');
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

  if (publishResult) {
    console.log(`\n🚀 Results Repository:`);
    console.log(`   - Repository URL:   ${publishResult.repoUrl}`);
    console.log(`   - Commit SHA:       ${publishResult.commitSha}`);
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
