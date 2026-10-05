import { parseArgs } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type MigrationPreflightReport,
  type MigrationScope,
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
    verbose: values.verbose,
    appId: values['app-id'],
    privateKeyPath: values['private-key-path'],
    installationId: values['installation-id'],
    sourceToken: values['source-token'],
    targetToken: values['target-token'],
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
    scope,
    sourceAdapter: sourceClient,
    targetAdapter: targetClient,
    signal,
  });

  const report = await evaluator.evaluate();

  const outPath = resolve(options.outputPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  const blockedAssessments = report.repositoryAssessments.filter(
    (a) => a.status === 'blocked',
  );
  const hasBlockers = blockedAssessments.length > 0;

  return {
    report,
    filePath: outPath,
    hasBlockers,
    blockedCount: blockedAssessments.length,
  };
}
