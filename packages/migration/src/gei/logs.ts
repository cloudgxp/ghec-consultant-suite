import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sanitizeDiagnostics } from '@ghec/github-client';
import { runGeiCommand } from './executor.js';
import type {
  GeiAbortOptions,
  GeiLogDownloadOptions,
  GeiMigrationLog,
} from './types.js';

function assertRepositoryName(repository: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository)) {
    throw new Error('targetRepo must be a simple GitHub repository name.');
  }
}

function commandEnvironment(options: GeiLogDownloadOptions | GeiAbortOptions): {
  environment: NodeJS.ProcessEnv;
  secrets: readonly string[];
} {
  return {
    environment: {
      ...(options.sourceToken ? { GH_SOURCE_PAT: options.sourceToken } : {}),
      ...(options.targetToken ? { GH_PAT: options.targetToken } : {}),
    },
    secrets: [options.sourceToken ?? '', options.targetToken ?? ''],
  };
}

export function parseMigrationLogWarnings(contents: string): readonly string[] {
  return contents
    .split(/\r?\n/)
    .filter((line) =>
      /\bwarning\b|repository metadata too big|comment not in diff/i.test(line),
    )
    .map((line) => sanitizeDiagnostics(line.trim()));
}

/** Downloads the ephemeral GEI log immediately and extracts actionable warnings. */
export async function downloadMigrationLogs(
  migrationId: string,
  targetOrg: string,
  targetRepo: string,
  outputDir: string,
  options: GeiLogDownloadOptions = {},
): Promise<GeiMigrationLog> {
  assertRepositoryName(targetRepo);
  const directory = resolve(outputDir);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filePath = join(directory, `${targetRepo}-migration.log`);
  const args = [
    'gei',
    'download-logs',
    '--migration-id',
    migrationId,
    '--github-target-org',
    targetOrg,
    '--target-repo',
    targetRepo,
    '--migration-log-file',
    filePath,
  ];
  if (options.sourceApiUrl)
    args.push('--github-source-api-url', options.sourceApiUrl);
  if (options.targetApiUrl) args.push('--target-api-url', options.targetApiUrl);
  const credentials = commandEnvironment(options);
  const result = await (options.runner ?? runGeiCommand)('gh', args, {
    ...credentials,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `GEI download-logs failed with exit code ${result.exitCode}: ${sanitizeDiagnostics(result.stderr || result.stdout)}`,
    );
  }
  const contents = existsSync(filePath)
    ? readFileSync(filePath, 'utf8')
    : result.stdout;
  return { filePath, warnings: parseMigrationLogWarnings(contents) };
}

/** Requests cancellation through GEI using the same API endpoints as the run. */
export async function abortGeiMigration(
  migrationId: string,
  options: GeiAbortOptions = {},
): Promise<void> {
  const args = ['gei', 'abort-migration', '--migration-id', migrationId];
  if (options.sourceApiUrl)
    args.push('--github-source-api-url', options.sourceApiUrl);
  if (options.targetApiUrl) args.push('--target-api-url', options.targetApiUrl);
  const credentials = commandEnvironment(options);
  const result = await (options.runner ?? runGeiCommand)('gh', args, {
    ...credentials,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `GEI abort-migration failed with exit code ${result.exitCode}: ${sanitizeDiagnostics(result.stderr || result.stdout)}`,
    );
  }
}
