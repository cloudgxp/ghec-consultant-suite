import { parseArgs } from 'node:util';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type MigrationPlan,
  type MigrationScope,
  validateBundle,
  validateMigrationScope,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  createDefaultModuleRegistry,
  MigrationPlanner,
  ScopeMatrixSlicer,
  writeMigrationPlanFile,
  type GitHubActionsMatrix,
} from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  type CliDualConfigOptions,
} from '../config/index.js';

export interface PlanCommandOptions {
  readonly scopePath: string;
  readonly inputPath?: string | undefined;
  readonly modules?: readonly string[] | undefined;
  readonly outputPath: string;
  readonly splitMatrix?: number | undefined;
  readonly outputMatrixPath?: string | undefined;
  readonly verbose?: boolean | undefined;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
}

export function parsePlanOptions(args: string[]): PlanCommandOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      scope: { type: 'string' },
      input: { type: 'string' },
      modules: { type: 'string' },
      output: { type: 'string', default: './scans/migration-plan.json' },
      'split-matrix': { type: 'string' },
      'output-matrix': {
        type: 'string',
        default: './scans/migration-matrix.json',
      },
      verbose: { type: 'boolean', default: false },
      'app-id': { type: 'string' },
      'private-key-path': { type: 'string' },
      'installation-id': { type: 'string' },
      'source-token': { type: 'string' },
      'target-token': { type: 'string' },
    },
  });

  if (!values.scope || !values.scope.trim()) {
    throw new Error('The --scope <file> flag is required.');
  }

  const modules = values.modules
    ? values.modules
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : undefined;

  let splitMatrix: number | undefined;
  if (values['split-matrix']) {
    splitMatrix = parseInt(values['split-matrix'], 10);
    if (isNaN(splitMatrix) || splitMatrix <= 0) {
      throw new Error('--split-matrix must be a positive integer.');
    }
  }

  return {
    scopePath: values.scope,
    inputPath: values.input,
    modules,
    outputPath: values.output || './scans/migration-plan.json',
    splitMatrix,
    outputMatrixPath:
      values['output-matrix'] || './scans/migration-matrix.json',
    verbose: values.verbose,
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
  };
}

export interface PlanCommandResult {
  readonly plan: MigrationPlan;
  readonly filePath: string;
  readonly matrix?: GitHubActionsMatrix | undefined;
  readonly matrixFilePath?: string | undefined;
}

export async function executePlanCommand(
  options: PlanCommandOptions,
  clientOverrides?: {
    sourceClient?: GitHubReadAdapter | undefined;
    targetClient?: GitHubReadAdapter | undefined;
  },
  signal?: AbortSignal,
): Promise<PlanCommandResult> {
  if (!existsSync(options.scopePath)) {
    throw new Error(`Scope file not found at "${options.scopePath}".`);
  }

  let scopeJson: unknown;
  try {
    scopeJson = JSON.parse(readFileSync(options.scopePath, 'utf8'));
  } catch (err) {
    throw new Error(
      `Failed to parse scope JSON from "${options.scopePath}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const scopeValidation = validateMigrationScope(scopeJson);
  if (!scopeValidation.success) {
    throw new Error(
      `Invalid scope schema in "${options.scopePath}": ${scopeValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  const scope: MigrationScope = scopeValidation.data;

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
  }

  const registry = createDefaultModuleRegistry();

  const planner = new MigrationPlanner({
    scope,
    registry,
    sourceClient,
    targetClient,
    cachedDiscoveryBundle: cachedBundle,
    modules: options.modules,
    signal,
  });

  const plan = await planner.generatePlan();
  const filePath = writeMigrationPlanFile(options.outputPath, plan, {
    overwrite: true,
  });

  let matrix: GitHubActionsMatrix | undefined;
  let matrixFilePath: string | undefined;

  if (options.splitMatrix !== undefined) {
    matrix = ScopeMatrixSlicer.slice(scope, {
      batchSize: options.splitMatrix,
    });
    matrixFilePath = resolve(
      options.outputMatrixPath || './scans/migration-matrix.json',
    );
    mkdirSync(dirname(matrixFilePath), { recursive: true });
    writeFileSync(matrixFilePath, JSON.stringify(matrix, null, 2), 'utf8');
  }

  return {
    plan,
    filePath,
    ...(matrix ? { matrix, matrixFilePath } : {}),
  };
}
