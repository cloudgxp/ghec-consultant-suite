import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  abortGeiMigration,
  downloadMigrationLogs,
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
