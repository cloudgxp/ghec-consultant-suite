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

test('GitLfsClient parameter validation rejects option injection and malicious characters', async () => {
  const { validateGitHubIdentifier, validateStagingDirectory, GitLfsClient } =
    await import('../src/strategies/git-lfs/lfs-client.js');

  // Valid identifiers
  assert.doesNotThrow(() =>
    validateGitHubIdentifier('acme-org', 'organization'),
  );
  assert.doesNotThrow(() =>
    validateGitHubIdentifier('my_cool-repo.v2', 'repository'),
  );

  // Invalid identifiers (leading dashes, invalid characters, dots)
  assert.throws(
    () => validateGitHubIdentifier('--upload-pack=/evil', 'repository'),
    /Invalid GitHub repository/,
  );
  assert.throws(
    () => validateGitHubIdentifier('-v', 'organization'),
    /Invalid GitHub organization/,
  );
  assert.throws(
    () => validateGitHubIdentifier('.git', 'repository'),
    /Invalid GitHub repository/,
  );
  assert.throws(
    () => validateGitHubIdentifier('org;rm -rf /', 'organization'),
    /Invalid GitHub organization/,
  );
  assert.throws(
    () => validateGitHubIdentifier('', 'repository'),
    /Invalid GitHub repository/,
  );

  // Staging directory validation
  assert.doesNotThrow(() => validateStagingDirectory('/tmp/staging/dir'));
  assert.throws(
    () => validateStagingDirectory('--upload-pack'),
    /Invalid staging directory/,
  );
  assert.throws(
    () => validateStagingDirectory('-x'),
    /Invalid staging directory/,
  );

  // Runner invocation ensures '--' delimiter is passed
  const calls: string[][] = [];
  const client = new GitLfsClient({
    runner: async (_cmd, args) => {
      calls.push([...args]);
      return { command: 'git', args, exitCode: 0, stdout: '', stderr: '' };
    },
  });

  await client.cloneMirror(
    '/tmp/test-staging',
    'safe-org',
    'safe-repo',
    'ghp_secretToken123',
    new AbortController().signal,
  );

  assert.equal(calls.length, 1);
  const cloneArgs = calls[0]!;
  assert.equal(cloneArgs[0], 'clone');
  assert.equal(cloneArgs[1], '--mirror');
  assert.equal(cloneArgs[2], '--');
  assert.ok(cloneArgs[3]?.includes('github.com/safe-org/safe-repo.git'));
  assert.equal(cloneArgs[4], '/tmp/test-staging');
});

test('GitLfsMigrationStrategy execute with dryRun: true simulates transfer without network writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ghec-lfs-dry-'));
  const checkpoint = new MigrationCheckpointManager('lfs-dry-run', scope, {
    rootDirectory: join(root, 'migrations'),
  });
  const commands: string[][] = [];
  const runner: GeiCommandRunner = async (_command, args) => {
    commands.push([...args]);
    return { command: 'git', args, exitCode: 0, stdout: '', stderr: '' };
  };
  let quotaChecked = false;
  const strategy = new GitLfsMigrationStrategy({
    runner,
    quotaChecker: {
      check: async () => {
        quotaChecked = true;
        return {
          enabled: true,
          storageRemainingBytes: 5_000,
          bandwidthRemainingBytes: 5_000,
        };
      },
    },
  });

  try {
    const result = await strategy.execute({
      sourceOrg: 'source-org',
      sourceRepo: 'repository',
      targetOrg: 'target-org',
      targetRepo: 'repository',
      sourceToken: 'ghp_src1234567890',
      targetToken: 'ghp_tgt1234567890',
      sourceClient: lfsClient(true),
      targetClient: lfsClient(true),
      signal: new AbortController().signal,
      geiCompleted: true,
      dryRun: true,
      expectedObjectCount: 10,
      expectedBytes: 4096,
      checkpointManager: checkpoint,
      checkpointRepository: 'source-org/repository',
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.metrics.objectCount, 10);
    assert.equal(result.metrics.bytesPushed, 4096);
    assert.equal(quotaChecked, true);
    // Verified: runner is called only for git lfs version (preflight), never for clone, fetch, or push
    assert.ok(
      commands.every(
        (c) =>
          !c.includes('push') && !c.includes('clone') && !c.includes('fetch'),
      ),
    );

    const cp = checkpoint.getManifest();
    assert.equal(
      cp.repositories['source-org/repository']?.specializedStrategies['git-lfs']
        ?.status,
      'completed',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
