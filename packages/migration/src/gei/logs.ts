import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sanitizeDiagnostics } from '@ghec/github-client';
import { runGeiCommand } from './executor.js';
import type {
  GeiAbortOptions,
  GeiLogDownloadOptions,
  GeiMetadataDiagnostics,
  GeiMetadataStatus,
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
      /\bwarning\b|repository metadata too big|comment not in diff|archive generation failed|git source migration succeeded, but metadata migration failed|review_thread_missing_end_commit_oid|line_not_found_in_diff|--skip-releases/i.test(
        line,
      ),
    )
    .map((line) => sanitizeDiagnostics(line.trim()));
}

export function parseMigrationLogErrors(contents: string): readonly string[] {
  return contents
    .split(/\r?\n/)
    .filter((line) =>
      /\berror\b|\bfatal\b|\bfailed\b|review_thread_missing_end_commit_oid|line_not_found_in_diff/i.test(
        line,
      ),
    )
    .map((line) => sanitizeDiagnostics(line.trim()));
}

export function parseGeiMetadataDiagnostics(
  contents: string,
  options: { skippedReleases?: boolean; exitCode?: number } = {},
): GeiMetadataDiagnostics {
  const warnings = parseMigrationLogWarnings(contents);
  const errors = parseMigrationLogErrors(contents);
  const categories = new Set<string>();

  const hasMetadataTooBig = /Repository metadata too big to migrate/i.test(
    contents,
  );
  const hasArchiveFailed = /Archive generation failed/i.test(contents);
  const hasGitOkMetaFailed =
    /Git source migration succeeded, but metadata migration failed/i.test(
      contents,
    );
  const hasPrError =
    /REVIEW_THREAD_MISSING_END_COMMIT_OID|LINE_NOT_FOUND_IN_DIFF/i.test(
      contents,
    ) || /pull request[^\r\n]{0,100}failed/i.test(contents);
  const hasReleaseSkipped =
    options.skippedReleases ||
    /--skip-releases|Skipping releases|releases too big/i.test(contents);

  if (hasMetadataTooBig || hasArchiveFailed || hasGitOkMetaFailed) {
    categories.add('issues');
    categories.add('pull-requests');
    categories.add('releases');
    categories.add('settings');
  }
  if (hasPrError) {
    categories.add('pull-requests');
  }
  if (hasReleaseSkipped) {
    categories.add('releases');
  }

  const failedCategories = Array.from(categories);
  const gitDataPreserved =
    hasGitOkMetaFailed ||
    (options.exitCode === 0 &&
      !/fatal: repository not found|fatal: unable to access/i.test(contents));

  let metadataState: GeiMetadataStatus = 'complete';
  if (hasMetadataTooBig || hasArchiveFailed || hasGitOkMetaFailed) {
    metadataState = 'failed';
  } else if (hasPrError || (errors.length > 0 && failedCategories.length > 0)) {
    metadataState = 'partial';
  } else if (hasReleaseSkipped) {
    metadataState = 'skipped';
  } else if (warnings.length > 0) {
    metadataState = 'partial';
  }

  return {
    metadataState,
    gitDataPreserved,
    failedMetadataCategories: failedCategories,
    warnings,
    errors,
  };
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
