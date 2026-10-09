import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  abortGeiMigration,
  downloadMigrationLogs,
  parseGeiMetadataDiagnostics,
  parseMigrationLogErrors,
  parseMigrationLogWarnings,
  type GeiCommandRunner,
} from '../src/index.js';

test('downloads GEI logs promptly and extracts warnings', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ghec-gei-logs-'));
  const commands: readonly string[][] = [];
  const runner: GeiCommandRunner = async (_command, args) => {
    (commands as string[][]).push([...args]);
    const filePath = args[args.indexOf('--migration-log-file') + 1];
    assert.ok(filePath);
    writeFileSync(
      filePath,
      'Migration complete\nWARNING: Repository metadata too big to migrate\nComment not in diff\n',
    );
    return { command: 'gh', args, exitCode: 0, stdout: '', stderr: '' };
  };
  try {
    const log = await downloadMigrationLogs(
      'RM_123',
      'target-org',
      'example',
      directory,
      {
        runner,
        sourceApiUrl: 'https://api.source.ghe.com',
        targetApiUrl: 'https://api.target.ghe.com',
      },
    );
    assert.equal(
      readFileSync(log.filePath, 'utf8').includes('Migration complete'),
      true,
    );
    assert.deepEqual(log.warnings, [
      'WARNING: Repository metadata too big to migrate',
      'Comment not in diff',
    ]);
    assert.equal(commands[0]?.includes('--migration-id'), true);
    assert.equal(commands[0]?.includes('--target-api-url'), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('issues abort with endpoint options and propagates GEI failures', async () => {
  let args: readonly string[] = [];
  const runner: GeiCommandRunner = async (_command, commandArgs) => {
    args = commandArgs;
    return {
      command: 'gh',
      args: commandArgs,
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  };
  await abortGeiMigration('RM_456', {
    runner,
    sourceApiUrl: 'https://api.source.ghe.com',
    targetApiUrl: 'https://api.target.ghe.com',
  });
  assert.deepEqual(args.slice(0, 4), [
    'gei',
    'abort-migration',
    '--migration-id',
    'RM_456',
  ]);
  assert.equal(args.includes('--github-source-api-url'), true);

  await assert.rejects(
    () =>
      abortGeiMigration('RM_456', {
        runner: async (_command, commandArgs) => ({
          command: 'gh',
          args: commandArgs,
          exitCode: 2,
          stdout: '',
          stderr: 'cannot abort',
        }),
      }),
    /cannot abort/,
  );
});

test('recognizes standard migration log warning text', () => {
  assert.deepEqual(parseMigrationLogWarnings('ok\nwarning: one\nall good\n'), [
    'warning: one',
  ]);
});

test('detects metadata overflow and classifies all metadata categories as failed', () => {
  const log = [
    'Migrating git repository... complete',
    'WARNING: Repository metadata too big to migrate (size: 45GB)',
    'Finished migration with warnings',
  ].join('\n');

  const diagnostics = parseGeiMetadataDiagnostics(log, { exitCode: 0 });
  assert.equal(diagnostics.metadataState, 'failed');
  assert.equal(diagnostics.gitDataPreserved, true);
  assert.deepEqual(
    diagnostics.failedMetadataCategories.sort(),
    ['issues', 'pull-requests', 'releases', 'settings'].sort(),
  );
  assert.equal(diagnostics.warnings.length, 1);
  assert.ok(diagnostics.warnings[0]?.includes('Repository metadata too big'));
});

test('detects review thread corruption and flags pull-requests category', () => {
  const log = [
    'Git source migration succeeded, but metadata migration encountered errors',
    'ERROR: REVIEW_THREAD_MISSING_END_COMMIT_OID on PR #42',
    'ERROR: LINE_NOT_FOUND_IN_DIFF on PR #43',
  ].join('\n');

  const diagnostics = parseGeiMetadataDiagnostics(log, { exitCode: 0 });
  assert.equal(diagnostics.metadataState, 'partial');
  assert.ok(diagnostics.failedMetadataCategories.includes('pull-requests'));
  assert.equal(diagnostics.gitDataPreserved, true);
  assert.equal(diagnostics.errors.length, 2);

  const errors = parseMigrationLogErrors(log);
  assert.equal(errors.length, 2);
  assert.ok(errors[0]?.includes('REVIEW_THREAD_MISSING_END_COMMIT_OID'));
});

test('redacts sensitive tokens in log warning diagnostics (DEC-004)', () => {
  const secret = 'ghp_secrettokenvalue1234567890123456';
  const log = `WARNING: failed connecting with https://x-access-token:${secret}@github.com/org/repo`;
  const warnings = parseMigrationLogWarnings(log);
  assert.ok(!warnings[0]?.includes(secret));
  assert.ok(warnings[0]?.includes('https://***@github.com'));
});
