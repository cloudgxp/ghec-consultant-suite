import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import {
  type MigrationPlan,
  type MigrationScope,
  validateBundle,
  validateMigrationPlan,
  validateMigrationScope,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  createDefaultModuleRegistry,
  MigrationOrchestrator,
  type MigrationExecutionReport,
  type TargetWriteClient,
  writeMigrationExecutionReportFile,
  buildSummaryFromExecutionReport,
  writeJsonSummaryFile,
  formatStepSummaryMarkdown,
  appendStepSummary,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  type CliDualConfigOptions,
} from '../config/index.js';

export interface MigrateCommandOptions {
  readonly planPath?: string | undefined;
  readonly scopePath?: string | undefined;
  readonly inputPath?: string | undefined;
  readonly modules?: readonly string[] | undefined;
  readonly resume?: string | undefined;
  readonly continueOnError: boolean;
  readonly dryRun: boolean;
  readonly outputPath: string;
  readonly jsonSummaryPath?: string | undefined;
  readonly verbose?: boolean | undefined;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
}

export function parseMigrateOptions(args: string[]): MigrateCommandOptions {
  const normalizedArgs = [...args];
  const resumeIdx = normalizedArgs.indexOf('--resume');
  if (resumeIdx !== -1) {
    const nextArg = normalizedArgs[resumeIdx + 1];
    if (!nextArg || nextArg.startsWith('-')) {
      normalizedArgs.splice(resumeIdx + 1, 0, 'latest');
    }
  }

  const { values } = parseArgs({
    args: normalizedArgs,
    strict: true,
    allowPositionals: false,
    options: {
      plan: { type: 'string' },
      scope: { type: 'string' },
      input: { type: 'string' },
      modules: { type: 'string' },
      resume: { type: 'string' },
      'continue-on-error': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      output: { type: 'string', default: './scans/migration-execution.json' },
      'json-summary': { type: 'string' },
      verbose: { type: 'boolean', default: false },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
    },
  });

  if (!values.plan && !values.scope) {
    throw new Error('Either --plan <file> or --scope <file> is required.');
  }

  const modules =
    values.modules && values.modules.toLowerCase() !== 'all'
      ? values.modules
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
      : undefined;

  return {
    planPath: values.plan,
    scopePath: values.scope,
    inputPath: values.input,
    modules,
    resume: values.resume,
    continueOnError: values['continue-on-error'] ?? false,
    dryRun: values['dry-run'] ?? false,
    outputPath: values.output || './scans/migration-execution.json',
    jsonSummaryPath: values['json-summary'],
    verbose: values.verbose,
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
  };
}

export async function executeMigrateCommand(
  options: MigrateCommandOptions,
  clientOverrides?: {
    sourceClient?: GitHubReadAdapter | undefined;
    targetClient?: GitHubReadAdapter | undefined;
    targetWriteClient?: TargetWriteClient | undefined;
  },
  signal?: AbortSignal,
): Promise<{ report: MigrationExecutionReport; filePath: string }> {
  let plan: MigrationPlan | undefined;
  let scope: MigrationScope | undefined;

  if (options.planPath) {
    if (!existsSync(options.planPath)) {
      throw new Error(`Plan file not found at "${options.planPath}".`);
    }
    try {
      const planJson = JSON.parse(readFileSync(options.planPath, 'utf8'));
      const planValidation = validateMigrationPlan(planJson);
      if (!planValidation.success) {
        throw new Error(
          `Invalid plan schema: ${planValidation.error.issues.map((i) => i.message).join('; ')}`,
        );
      }
      plan = planValidation.data;
    } catch (err) {
      throw new Error(
        `Failed to read plan file "${options.planPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  if (options.scopePath) {
    if (!existsSync(options.scopePath)) {
      throw new Error(`Scope file not found at "${options.scopePath}".`);
    }
    try {
      const scopeJson = JSON.parse(readFileSync(options.scopePath, 'utf8'));
      const scopeValidation = validateMigrationScope(scopeJson);
      if (!scopeValidation.success) {
        throw new Error(
          `Invalid scope schema: ${scopeValidation.error.issues.map((i) => i.message).join('; ')}`,
        );
      }
      scope = scopeValidation.data;
    } catch (err) {
      throw new Error(
        `Failed to read scope file "${options.scopePath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  let cachedBundle: unknown | undefined;
  if (options.inputPath) {
    if (!existsSync(options.inputPath)) {
      throw new Error(
        `Input discovery bundle not found at "${options.inputPath}".`,
      );
    }
    try {
      const bundleJson = JSON.parse(readFileSync(options.inputPath, 'utf8'));
      const bundleValidation = validateBundle(bundleJson);
      if (!bundleValidation.success) {
        throw new Error(
          `Invalid discovery bundle: ${bundleValidation.message} (code: ${bundleValidation.code})`,
        );
      }
      cachedBundle = bundleValidation.data;
    } catch (err) {
      throw new Error(
        `Failed to read input discovery bundle from "${options.inputPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  let sourceClient = clientOverrides?.sourceClient;
  let targetClient = clientOverrides?.targetClient;
  let targetWriteClient = clientOverrides?.targetWriteClient;

  if (!sourceClient || !targetClient) {
    const configOptions: CliDualConfigOptions = {
      appId: options.appId,
      privateKeyPath: options.privateKeyPath,
      installationId: options.installationId,
      sourceToken: options.sourceToken,
      targetToken: options.targetToken,
    };
    const dualConfig = loadDualConfig(configOptions);
    const clients = createMigrationClientsFromConfig(dualConfig);
    sourceClient = sourceClient ?? clients.sourceClient;
    targetClient = targetClient ?? clients.targetClient;
    targetWriteClient = targetWriteClient ?? clients.targetWriteClient;
  }

  const sourceToken =
    options.sourceToken ??
    process.env.GHEC_SOURCE_TOKEN?.trim() ??
    process.env.GH_SOURCE_PAT?.trim() ??
    process.env.GHEC_TOKEN?.trim();

  const targetToken =
    options.targetToken ??
    process.env.GHEC_TARGET_TOKEN?.trim() ??
    process.env.GH_PAT?.trim();

  const registry = createDefaultModuleRegistry();

  const orchestrator = new MigrationOrchestrator({
    registry,
    sourceClient,
    targetClient,
    targetWriteClient,
    sourceToken,
    targetToken,
    plan,
    scope,
    cachedDiscoveryBundle: cachedBundle,
    modules: options.modules,
    dryRun: options.dryRun,
    continueOnError: options.continueOnError,
    signal,
  });

  const report = await orchestrator.run();
  const filePath = writeMigrationExecutionReportFile(
    options.outputPath,
    report,
    {
      overwrite: true,
    },
  );

  const sourceOrg =
    scope?.organizations[0]?.source ?? scope?.repositories[0]?.sourceOrg;
  const targetOrg =
    scope?.organizations[0]?.target ?? scope?.repositories[0]?.targetOrg;

  const summary = buildSummaryFromExecutionReport(report, {
    plan,
    sourceOrg,
    targetOrg,
  });

  if (options.jsonSummaryPath) {
    writeJsonSummaryFile(summary, options.jsonSummaryPath);
  }

  appendStepSummary(formatStepSummaryMarkdown(summary));

  return { report, filePath };
}
