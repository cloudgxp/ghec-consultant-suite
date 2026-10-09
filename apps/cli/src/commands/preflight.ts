import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type MigrationPreflightReport,
  type MigrationScope,
  type DiscoveryBundle,
  validateBundle,
  validateMigrationScope,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import { PreflightEvaluator } from '@ghec/migration';
import {
  createMigrationClientsFromConfig,
  loadDualConfig,
  type CliDualConfigOptions,
} from '../config/index.js';

export interface PreflightCommandOptions {
  readonly scopePath: string;
  readonly outputPath: string;
  readonly inputPath?: string | undefined;
  readonly verbose?: boolean | undefined;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
}

export function parsePreflightOptions(args: string[]): PreflightCommandOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      scope: { type: 'string' },
      output: { type: 'string', default: './scans/preflight-report.json' },
      input: { type: 'string' },
      'cached-bundle': { type: 'string' },
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

  return {
    scopePath: values.scope,
    outputPath: values.output || './scans/preflight-report.json',
    inputPath: values.input || values['cached-bundle'],
    verbose: values.verbose,
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
  };
}

export interface PreflightDirectOptions {
  readonly scope: MigrationScope;
  readonly discoveryBundle?: DiscoveryBundle | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
}

export async function evaluatePreflightDirect(
  options: PreflightDirectOptions,
  clientOverrides?: {
    sourceClient?: GitHubReadAdapter | undefined;
    targetClient?: GitHubReadAdapter | undefined;
  },
  signal?: AbortSignal,
): Promise<{
  report: MigrationPreflightReport;
  hasBlockers: boolean;
  blockedCount: number;
}> {
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

  const evaluator = new PreflightEvaluator({
    scope: options.scope,
    sourceAdapter: sourceClient,
    targetAdapter: targetClient,
    discoveryBundle: options.discoveryBundle,
    signal,
  });

  const report = await evaluator.evaluate();

  const blockedAssessments = report.repositoryAssessments.filter(
    (a) => a.status === 'blocked',
  );
  const hasBlockers = blockedAssessments.length > 0;

  return {
    report,
    hasBlockers,
    blockedCount: blockedAssessments.length,
  };
}

export interface PreflightCommandResult {
  readonly report: MigrationPreflightReport;
  readonly filePath: string;
  readonly hasBlockers: boolean;
  readonly blockedCount: number;
}

export async function executePreflightCommand(
  options: PreflightCommandOptions,
  clientOverrides?: {
    sourceClient?: GitHubReadAdapter | undefined;
    targetClient?: GitHubReadAdapter | undefined;
  },
  signal?: AbortSignal,
): Promise<PreflightCommandResult> {
  const safeScopePath = resolve(process.cwd(), options.scopePath);
  if (!existsSync(safeScopePath)) {
    throw new Error(`Scope file not found at "${options.scopePath}".`);
  }

  let scopeJson: unknown;
  try {
    scopeJson = JSON.parse(readFileSync(safeScopePath, 'utf8'));
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

  let discoveryBundle: DiscoveryBundle | undefined;
  if (options.inputPath) {
    const safeInputPath = resolve(process.cwd(), options.inputPath);
    if (!existsSync(safeInputPath)) {
      throw new Error(`Discovery bundle not found at "${options.inputPath}".`);
    }
    try {
      const bundleJson = JSON.parse(readFileSync(safeInputPath, 'utf8'));
      const bundleValidation = validateBundle(bundleJson);
      if (!bundleValidation.success) {
        throw new Error(
          `Invalid discovery bundle in "${options.inputPath}": ${bundleValidation.message}`,
        );
      }
      discoveryBundle = bundleValidation.data;
    } catch (err) {
      throw new Error(
        `Failed to parse discovery bundle from "${options.inputPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  const directResult = await evaluatePreflightDirect(
    {
      scope,
      discoveryBundle,
      sourceToken: options.sourceToken,
      targetToken: options.targetToken,
      appId: options.appId,
      privateKeyPath: options.privateKeyPath,
      installationId: options.installationId,
    },
    clientOverrides,
    signal,
  );

  const outPath = resolve(process.cwd(), options.outputPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(directResult.report, null, 2), 'utf8');

  return {
    report: directResult.report,
    filePath: outPath,
    hasBlockers: directResult.hasBlockers,
    blockedCount: directResult.blockedCount,
  };
}
