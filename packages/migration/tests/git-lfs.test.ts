import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { MigrationScope } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  GitLfsMigrationStrategy,
  MigrationCheckpointManager,
  type GeiCommandRunner,
} from '../src/index.js';

const scope: MigrationScope = {
  version: '1.0.0',
  name: 'lfs-cutover',
  organizations: [],
  repositories: [
    {
      sourceOrg: 'source-org',
      sourceRepo: 'repository',
      targetOrg: 'target-org',
      targetRepo: 'repository',
      useGei: true,
    },
  ],
};

function lfsClient(enabled: boolean): GitHubReadAdapter {
  return {
    readSingle: async () => ({
      data: enabled
        ? {
            content: Buffer.from(
              '*.bin filter=lfs diff=lfs merge=lfs -text',
            ).toString('base64'),
            encoding: 'base64',
          }
        : {},
      observedAt: '2026-10-04T12:00:00.000Z',
      status: 200,
    }),
  } as unknown as GitHubReadAdapter;
}

test('mirrors, fetches, repoints, pushes, verifies, and checkpoints LFS objects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ghec-lfs-'));
  const stagingRoot = join(root, 'staging');
  const checkpoint = new MigrationCheckpointManager('lfs-run', scope, {
    rootDirectory: join(root, 'migrations'),
  });
  const sourceToken = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
  const targetToken = 'ghp_zyxwvutsrqponmlkjihgfedcba9876543210';
  const commands: string[][] = [];
  let fetchAttempts = 0;
  const runner: GeiCommandRunner = async (_command, args) => {
    commands.push([...args]);
    if (args[0] === 'clone') mkdirSync(args.at(-1) ?? '', { recursive: true });
    if (args.includes('fetch')) {
      fetchAttempts++;
      if (fetchAttempts === 1) {
        return {
          command: 'git',
          args,
          exitCode: 1,
          stdout: '',
          stderr: `temporary source failure ${sourceToken}`,
        };
      }
    }
    return { command: 'git', args, exitCode: 0, stdout: '', stderr: '' };
  };
  const strategy = new GitLfsMigrationStrategy({
    runner,
    quotaChecker: {
      check: async () => ({
        enabled: true,
        storageRemainingBytes: 2_000,
        bandwidthRemainingBytes: 2_000,
      }),
    },
    now: (() => {
      let time = 0;
      return () => (time += 10);
    })(),
  });
  try {
    const result = await strategy.execute({
      sourceOrg: 'source-org',
      sourceRepo: 'repository',
      targetOrg: 'target-org',
      targetRepo: 'repository',
      sourceToken,
      targetToken,
      sourceClient: lfsClient(true),
      targetClient: lfsClient(true),
      signal: new AbortController().signal,
      geiCompleted: true,
      expectedObjectCount: 4,
      expectedBytes: 1_000,
      stagingRoot,
      checkpointManager: checkpoint,
      checkpointRepository: 'source-org/repository',
      retryDelayMs: 0,
      sleep: async () => undefined,
    });
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.metrics.objectCount, 4);
    assert.equal(existsSync(result.stagingDirectory), false);
    assert.equal(fetchAttempts, 2);
    assert.deepEqual(commands[0], ['lfs', 'version']);
    assert.equal(
      commands.some((args) => args[0] === 'clone' && args.includes('--mirror')),
      true,
    );
    assert.equal(
      commands.some((args) => args.includes('fetch') && args.includes('--all')),
      true,
    );
    assert.equal(
      commands.some((args) => args.includes('set-url')),
      true,
    );
    assert.equal(
      commands.some((args) => args.includes('push') && args.includes('--all')),
      true,
    );
    assert.equal(
      commands.some((args) => args.some((arg) => arg.includes(sourceToken))),
      true,
    );
    assert.equal(
      commands.some((args) => args.some((arg) => arg.includes(targetToken))),
      true,
    );
    assert.equal(
      checkpoint.getManifest().repositories['source-org/repository']
        ?.specializedStrategies['git-lfs']?.status,
      'completed',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skips repositories without LFS and rejects pre-GEI execution', async () => {
  const calls: string[][] = [];
  const strategy = new GitLfsMigrationStrategy({
    runner: async (_command, args) => {
      calls.push([...args]);
      return { command: 'git', args, exitCode: 0, stdout: '', stderr: '' };
    },
    quotaChecker: { check: async () => ({ enabled: true }) },
  });
  const input = {
    sourceOrg: 'source',
    sourceRepo: 'repository',
    targetOrg: 'target',
    targetRepo: 'repository',
    sourceToken: 'source-token',
    targetToken: 'target-token',
    sourceClient: lfsClient(false),
    targetClient: lfsClient(false),
    signal: new AbortController().signal,
    geiCompleted: true,
    stagingRoot: join(tmpdir(), 'ghec-lfs-never-created'),
  };
  const skipped = await strategy.execute(input);
  assert.equal(skipped.status, 'skipped');
  assert.deepEqual(calls, [['lfs', 'version']]);

  await assert.rejects(
    () => strategy.execute({ ...input, geiCompleted: false }),
    /only after GEI completes/,
  );
});

test('blocks an LFS transfer when target storage is insufficient', async () => {
  const strategy = new GitLfsMigrationStrategy({
    runner: async (_command, args) => ({
      command: 'git',
      args,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }),
    quotaChecker: {
      check: async () => ({ enabled: true, storageRemainingBytes: 10 }),
    },
  });
  await assert.rejects(
    () =>
      strategy.execute({
        sourceOrg: 'source',
        sourceRepo: 'repository',
        targetOrg: 'target',
        targetRepo: 'repository',
        sourceToken: 'source-token',
        targetToken: 'target-token',
        sourceClient: lfsClient(true),
        targetClient: lfsClient(true),
        signal: new AbortController().signal,
        geiCompleted: true,
        expectedBytes: 11,
      }),
    /storage quota is insufficient/,
  );
});
