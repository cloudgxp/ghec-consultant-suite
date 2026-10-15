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
  MigrationCheckpointManager,
  MigrationOrchestrator,
  parseModuleSelectionFlags,
  type MigrationExecutionReport,
  type StructuredLogger,
  type TargetWriteClient,
  writeMigrationExecutionReportFile,
  buildSummaryFromExecutionReport,
  writeJsonSummaryFile,
  formatStepSummaryMarkdown,
  appendStepSummary,
  generateMigrationResults,
  writeResultsToDirectory,
  MigrationResultsRepoPublisher,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  sanitizeDiagnostics,
  type CliDualConfigOptions,
} from '../config/index.js';

export interface MigrateCommandOptions {
  readonly planPath?: string | undefined;
  readonly scopePath?: string | undefined;
  readonly inputPath?: string | undefined;
  readonly modules?: readonly string[] | undefined;
  readonly excludeModules?: readonly string[] | undefined;
  readonly repos?: readonly string[] | undefined;
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
  readonly publishResults?: boolean | undefined;
  readonly checkpointDir?: string | undefined;
  readonly mirrorPushMode?: 'fast-snapshot' | 'full-history' | undefined;
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
      'exclude-modules': { type: 'string' },
      repos: { type: 'string' },
      resume: { type: 'string' },
      'checkpoint-dir': { type: 'string' },
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
      'publish-results': { type: 'boolean', default: false },
      'mirror-push-mode': { type: 'string' },
    },
  });

  if (!values.plan && !values.scope) {
    throw new Error('Either --plan <file> or --scope <file> is required.');
  }

  const rawMirrorPushMode = values['mirror-push-mode'];
  if (
    rawMirrorPushMode !== undefined &&
    rawMirrorPushMode !== 'fast-snapshot' &&
    rawMirrorPushMode !== 'full-history'
  ) {
    throw new Error(
      `Invalid --mirror-push-mode "${rawMirrorPushMode}". Expected "fast-snapshot" or "full-history".`,
    );
  }

  const parsedSelection = parseModuleSelectionFlags(
    values.modules,
    values['exclude-modules'],
  );

  const parsedRepos = values.repos
    ? values.repos
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : undefined;

  return {
    planPath: values.plan,
    scopePath: values.scope,
    inputPath: values.input,
    modules: parsedSelection.modules,
    excludeModules:
      parsedSelection.excludeModules.length > 0
        ? parsedSelection.excludeModules
        : undefined,
    repos: parsedRepos && parsedRepos.length > 0 ? parsedRepos : undefined,
    resume: values.resume,
    checkpointDir: values['checkpoint-dir'],
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
    publishResults: values['publish-results'] ?? false,
    mirrorPushMode: rawMirrorPushMode,
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
      if (options.repos && options.repos.length > 0) {
        const repoFilterSet = new Set(
          options.repos.map((r) => r.toLowerCase()),
        );
        scope = {
          ...scope,
          repositories: scope.repositories.filter(
            (r) =>
              repoFilterSet.has(r.sourceRepo.toLowerCase()) ||
              repoFilterSet.has(r.targetRepo.toLowerCase()) ||
              repoFilterSet.has(
                `${r.sourceOrg}/${r.sourceRepo}`.toLowerCase(),
              ) ||
              repoFilterSet.has(`${r.targetOrg}/${r.targetRepo}`.toLowerCase()),
          ),
        };
      }
      if (options.mirrorPushMode) {
        scope = {
          ...scope,
          mirrorPushMode: options.mirrorPushMode,
          repositories: scope.repositories.map((r) => ({
            ...r,
            mirrorPushMode: options.mirrorPushMode,
            options: r.options
              ? { ...r.options, mirrorPushMode: options.mirrorPushMode }
              : undefined,
          })),
        };
      }
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

  const logger: StructuredLogger = {
    debug: (msg, meta) => {
      if (options.verbose) {
        const suffix = meta
          ? ` ${sanitizeDiagnostics(JSON.stringify(meta))}`
          : '';
        console.log(`[DEBUG] ${sanitizeDiagnostics(msg)}${suffix}`);
      }
    },
    info: (msg, meta) => {
      if (options.verbose) {
        const suffix = meta
          ? ` ${sanitizeDiagnostics(JSON.stringify(meta))}`
          : '';
        console.log(`[INFO] ${sanitizeDiagnostics(msg)}${suffix}`);
      }
    },
    warn: (msg, meta) => {
      const suffix = meta
        ? ` ${sanitizeDiagnostics(JSON.stringify(meta))}`
        : '';
      console.warn(`[WARN] ${sanitizeDiagnostics(msg)}${suffix}`);
    },
    error: (msg, meta) => {
      const suffix = meta
        ? ` ${sanitizeDiagnostics(JSON.stringify(meta))}`
        : '';
      console.error(`[ERROR] ${sanitizeDiagnostics(msg)}${suffix}`);
    },
  };

  const checkpointManager =
    options.checkpointDir && scope
      ? new MigrationCheckpointManager(`migrate-${Date.now()}`, scope, {
          rootDirectory: options.checkpointDir,
        })
      : undefined;

  const orchestrator = new MigrationOrchestrator({
    registry,
    sourceClient,
    targetClient,
    targetWriteClient,
    sourceToken,
    targetToken,
    plan,
    scope,
    checkpointManager,
    cachedDiscoveryBundle: cachedBundle,
    modules: options.modules,
    excludeModules: options.excludeModules,
    dryRun: options.dryRun,
    continueOnError: options.continueOnError,
    logger,
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

  if (options.publishResults) {
    const resultsRepoDir = './scans/results-repo';
    const generated = generateMigrationResults({
      sourceOrg: sourceOrg ?? 'source-org',
      targetOrg: targetOrg ?? 'target-org',
      executionMode: options.dryRun ? 'dry-run' : 'live',
      executionReport: report,
      scope,
    });
    writeResultsToDirectory(generated, resultsRepoDir);

    if (targetClient && targetWriteClient && !options.dryRun) {
      const publisher = new MigrationResultsRepoPublisher({
        targetOrg: targetOrg ?? 'target-org',
        targetClient,
        targetWriteClient,
        dryRun: false,
        signal,
      });
      await publisher.publish(generated.files);
    }
  }

  return { report, filePath };
}
