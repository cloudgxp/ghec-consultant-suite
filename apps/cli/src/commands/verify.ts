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
  type VerificationOrchestratorResult,
  VerificationOrchestrator,
  writeVerificationReportFile,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  type CliDualConfigOptions,
} from '../config/index.js';

export interface VerifyCommandOptions {
  readonly planPath: string;
  readonly scopePath?: string | undefined;
  readonly outputPath: string;
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
      output: { type: 'string', default: './scans/verification-report.json' },
      verbose: { type: 'boolean', default: false },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
    },
  });

  if (!values.plan || !values.plan.trim()) {
    throw new Error('The --plan <file> flag is required.');
  }

  return {
    planPath: values.plan,
    scopePath: values.scope,
    outputPath: values.output || './scans/verification-report.json',
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
  const plan: MigrationPlan = planValidation.data;

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
    sourceClient = sourceClient ?? clients.sourceClient;
  }

  const registry = createDefaultModuleRegistry();

  const orchestrator = new VerificationOrchestrator({
    registry,
    targetClient,
    sourceClient,
    plan,
    scope,
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

  return { result, filePath };
}
