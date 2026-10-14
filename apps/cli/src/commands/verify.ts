import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import {
  type MigrationPlan,
  type MigrationScope,
  validateMigrationPlan,
  validateMigrationScope,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  createDefaultModuleRegistry,
  MigrationPlanner,
  parseModuleSelectionFlags,
  type StructuredLogger,
  type VerificationOrchestratorResult,
  VerificationOrchestrator,
  writeVerificationReportFile,
  buildSummaryFromVerification,
  writeJsonSummaryFile,
  formatStepSummaryMarkdown,
  appendStepSummary,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  sanitizeDiagnostics,
  type CliDualConfigOptions,
} from '../config/index.js';

export interface VerifyCommandOptions {
  readonly planPath?: string | undefined;
  readonly scopePath?: string | undefined;
  readonly modules?: readonly string[] | undefined;
  readonly excludeModules?: readonly string[] | undefined;
  readonly outputPath: string;
  readonly jsonSummaryPath?: string | undefined;
  readonly verbose?: boolean | undefined;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
}

export function parseVerifyOptions(args: string[]): VerifyCommandOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      plan: { type: 'string' },
      scope: { type: 'string' },
      modules: { type: 'string' },
      'exclude-modules': { type: 'string' },
      output: { type: 'string', default: './scans/verification-report.json' },
      'json-summary': { type: 'string' },
      verbose: { type: 'boolean', default: false },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
    },
  });

  if (
    (!values.plan || !values.plan.trim()) &&
    (!values.scope || !values.scope.trim())
  ) {
    throw new Error(
      'The --plan <file> flag is required (or specify --scope <file>).',
    );
  }

  const parsedSelection = parseModuleSelectionFlags(
    values.modules,
    values['exclude-modules'],
  );

  return {
    planPath: values.plan,
    scopePath: values.scope,
    modules: parsedSelection.modules,
    excludeModules:
      parsedSelection.excludeModules.length > 0
        ? parsedSelection.excludeModules
        : undefined,
    outputPath: values.output || './scans/verification-report.json',
    jsonSummaryPath: values['json-summary'],
    verbose: values.verbose,
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
  };
}

export async function executeVerifyCommand(
  options: VerifyCommandOptions,
  clientOverrides?: {
    targetClient?: GitHubReadAdapter | undefined;
    sourceClient?: GitHubReadAdapter | undefined;
  },
  signal?: AbortSignal,
): Promise<{ result: VerificationOrchestratorResult; filePath: string }> {
  let plan: MigrationPlan | undefined;
  if (options.planPath) {
    if (!existsSync(options.planPath)) {
      throw new Error(`Plan file not found at "${options.planPath}".`);
    }

    let planJson: unknown;
    try {
      planJson = JSON.parse(readFileSync(options.planPath, 'utf8'));
    } catch (err) {
      throw new Error(
        `Failed to read plan file "${options.planPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    const planValidation = validateMigrationPlan(planJson);
    if (!planValidation.success) {
      throw new Error(
        `Invalid plan schema: ${planValidation.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    plan = planValidation.data;
  }

  let scope: MigrationScope | undefined;
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

  let targetClient = clientOverrides?.targetClient;
  let sourceClient = clientOverrides?.sourceClient;

  if (!targetClient || (!plan && !sourceClient)) {
    const configOptions: CliDualConfigOptions = {
      appId: options.appId,
      privateKeyPath: options.privateKeyPath,
      installationId: options.installationId,
      sourceToken: options.sourceToken,
      targetToken: options.targetToken,
    };
    const dualConfig = loadDualConfig(configOptions);
    const clients = createMigrationClientsFromConfig(dualConfig);
    targetClient = targetClient ?? clients.targetClient;
    sourceClient = sourceClient ?? clients.sourceClient;
  }

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

  if (!plan) {
    if (!scope) {
      throw new Error(
        'Either --plan <file> or --scope <file> must be provided for verification.',
      );
    }
    const planner = new MigrationPlanner({
      scope,
      registry,
      sourceClient: sourceClient ?? targetClient,
      targetClient,
      modules: options.modules,
      excludeModules: options.excludeModules,
      verificationMode: true,
      logger,
      signal,
    });
    plan = await planner.generatePlan();
  }

  const orchestrator = new VerificationOrchestrator({
    registry,
    targetClient,
    sourceClient,
    plan,
    scope,
    logger,
    signal,
  });

  const result = await orchestrator.run();
  const filePath = writeVerificationReportFile(
    options.outputPath,
    result.report,
    {
      overwrite: true,
    },
  );

  const sourceOrg =
    scope?.organizations[0]?.source ??
    scope?.repositories[0]?.sourceOrg ??
    result.report.sourceOrg;
  const targetOrg =
    scope?.organizations[0]?.target ??
    scope?.repositories[0]?.targetOrg ??
    result.report.targetOrg;

  const summary = buildSummaryFromVerification(result.report, {
    sourceOrg,
    targetOrg,
  });

  if (options.jsonSummaryPath) {
    writeJsonSummaryFile(summary, options.jsonSummaryPath);
  }

  appendStepSummary(formatStepSummaryMarkdown(summary));

  return { result, filePath };
}
