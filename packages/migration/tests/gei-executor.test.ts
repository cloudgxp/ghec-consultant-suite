import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubTargetClient } from '@ghec/github-client';
import {
  buildGeiMigrationArgs,
  checkGeiPreflight,
  GeiProcessExecutor,
  pollGeiMigrationStatus,
  type GeiCommandRunner,
} from '../src/index.js';

const sourceToken = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
const targetToken = 'ghp_zyxwvutsrqponmlkjihgfedcba9876543210';

test('builds GEI commands with secure environment credentials and release safeguards', async () => {
  const observed: Array<{
    args: readonly string[];
    environment?: NodeJS.ProcessEnv;
  }> = [];
  const runner: GeiCommandRunner = async (_command, args, options) => {
    observed.push({ args, environment: options?.environment });
    return {
      command: 'gh',
      args,
      exitCode: 0,
      stdout: `Migration queued: RM_12345\n${sourceToken}`,
      stderr: '',
    };
  };
  const result = await new GeiProcessExecutor(runner).execute({
    sourceOrg: 'source-org',
    sourceRepo: 'source-repo',
    targetOrg: 'target-org',
    targetRepo: 'target-repo',
    sourceToken,
    targetToken,
    sourceApiUrl: 'https://api.source.ghe.com',
    targetApiUrl: 'https://api.target.ghe.com',
    targetRepoVisibility: 'internal',
    metadataBytes: 41 * 1024 ** 3,
  });

  assert.equal(result.migrationId, 'RM_12345');
  assert.equal(result.skippedReleases, true);
  assert.equal(result.stdout.includes(sourceToken), false);
  assert.equal(result.stdout.includes('[REDACTED_TOKEN]'), true);
  assert.equal(observed[0]?.args.includes(sourceToken), false);
  assert.equal(observed[0]?.args.includes(targetToken), false);
  assert.equal(observed[0]?.args.includes('--skip-releases'), true);
  assert.equal(observed[0]?.environment?.GH_SOURCE_PAT, sourceToken);
  assert.equal(observed[0]?.environment?.GH_PAT, targetToken);
});

test('rejects non-zero GEI results without leaking credentials', async () => {
  const runner: GeiCommandRunner = async (_command, args) => ({
    command: 'gh',
    args,
    exitCode: 1,
    stdout: '',
    stderr: `Authentication failed for ${targetToken}`,
  });
  await assert.rejects(
    () =>
      new GeiProcessExecutor(runner).execute({
        sourceOrg: 'source',
        sourceRepo: 'repo',
        targetOrg: 'target',
        targetRepo: 'repo',
        targetToken,
      }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).message.includes(targetToken), false);
      assert.match((error as Error).message, /REDACTED_TOKEN/);
      return true;
    },
  );
});

test('validates the gh CLI and GEI extension before execution', async () => {
  const runner: GeiCommandRunner = async (_command, args) => ({
    command: 'gh',
    args,
    exitCode: 0,
    stdout:
      args[0] === '--version' ? 'gh version 2.80.0' : 'github/gh-gei\t1.0.0',
    stderr: '',
  });
  const ready = await checkGeiPreflight(undefined, runner);
  assert.equal(ready.ready, true);

  const missing = await checkGeiPreflight(
    undefined,
    async (_command, args) => ({
      command: 'gh',
      args,
      exitCode: 0,
      stdout: args[0] === '--version' ? 'gh version 2.80.0' : 'other/extension',
      stderr: '',
    }),
  );
  assert.equal(missing.ready, false);
  assert.equal(
    missing.checks[1]?.installCommand,
    'gh extension install github/gh-gei',
  );
});

test('polls migration state with capped backoff until success', async () => {
  const states = ['queued', 'SUCCEEDED'];
  const operations: string[] = [];
  const client = {
    readSingle: async (operation: { id: string }) => {
      operations.push(operation.id);
      return {
        data: { state: states.shift() },
        observedAt: '2026-10-04T12:00:00.000Z',
        status: 200,
      };
    },
  } as unknown as GitHubTargetClient;
  const status = await pollGeiMigrationStatus(
    'RM_123',
    client,
    new AbortController().signal,
    {
      targetOrg: 'target-org',
      initialDelayMs: 1,
      sleep: async () => undefined,
    },
  );
  assert.equal(status.state, 'SUCCEEDED');
  assert.deepEqual(operations, [
    'rest.migrations.get-status',
    'rest.migrations.get-status',
  ]);
});

test('rejects malformed migration identifiers before spawning', () => {
  assert.throws(
    () =>
      buildGeiMigrationArgs({
        sourceOrg: 'source/org',
        sourceRepo: 'repo',
        targetOrg: 'target',
        targetRepo: 'repo',
      }),
    /sourceOrg/,
  );
});
