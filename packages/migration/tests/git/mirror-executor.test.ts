import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  GitMirrorPushExecutor,
  checkScratchDiskSpace,
  runGitCommand,
  type GitCommandRunner,
} from '../../src/strategies/mirror-push/index.js';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type {
  TargetWriteClient,
  TargetWriteOperation,
} from '../../src/core/types.js';

describe('GitMirrorPushExecutor', () => {
  it('executes bare clone and mirror push with secure environment headers and redacts tokens', async () => {
    const executedCommands: {
      command: string;
      args: readonly string[];
      cwd?: string | undefined;
      environment?: Readonly<Record<string, string>> | undefined;
    }[] = [];

    const mockRunner: GitCommandRunner = async (command, args, options) => {
      executedCommands.push({
        command,
        args,
        cwd: options?.cwd,
        environment: options?.environment,
      });
      return { exitCode: 0, stdout: 'Success', stderr: '' };
    };

    const executor = new GitMirrorPushExecutor(mockRunner);
    const result = await executor.execute({
      sourceOrg: 'test-src-org',
      sourceRepo: 'large-repo',
      targetOrg: 'test-tgt-org',
      targetRepo: 'large-repo',
      sourceToken: 'ghp_sourcesecret123',
      targetToken: 'ghp_targetsecret456',
    });

    assert.equal(result.sourceRepo, 'large-repo');
    assert.equal(result.targetRepo, 'large-repo');
    assert.equal(executedCommands.length, 2);

    // 1. Clone command validation
    const cloneCmd = executedCommands[0]!;
    assert.equal(cloneCmd.command, 'git');
    assert.deepEqual(cloneCmd.args.slice(0, 4), [
      '--config-env=http.extraHeader=GHEC_SOURCE_AUTH',
      'clone',
      '--bare',
      '--',
    ]);
    assert.equal(
      cloneCmd.args[4],
      'https://github.com/test-src-org/large-repo.git',
    );
    assert.equal(
      cloneCmd.environment?.['GHEC_SOURCE_AUTH'],
      'Bearer ghp_sourcesecret123',
    );
    // Crucial: Secret must NOT be in CLI arguments
    assert.equal(
      cloneCmd.args.some((arg) => arg.includes('ghp_sourcesecret123')),
      false,
    );

    // 2. Push command validation
    const pushCmd = executedCommands[1]!;
    assert.equal(pushCmd.command, 'git');
    assert.deepEqual(pushCmd.args.slice(0, 3), [
      '--config-env=http.extraHeader=GHEC_TARGET_AUTH',
      'push',
      '--mirror',
    ]);
    assert.equal(
      pushCmd.args[4],
      'https://github.com/test-tgt-org/large-repo.git',
    );
    assert.equal(
      pushCmd.environment?.['GHEC_TARGET_AUTH'],
      'Bearer ghp_targetsecret456',
    );
    assert.equal(
      pushCmd.args.some((arg) => arg.includes('ghp_targetsecret456')),
      false,
    );
  });

  it('creates target repository if it does not exist', async () => {
    const createdMutations: TargetWriteOperation[] = [];
    const mockTargetWriteClient: TargetWriteClient = {
      async mutate(op) {
        createdMutations.push(op);
        return { status: 201 };
      },
    };

    const mockTargetReadClient: Partial<GitHubReadAdapter> = {
      async readSingle() {
        return {
          status: 404,
          data: null as never,
          observedAt: new Date().toISOString(),
        };
      },
    };

    const mockRunner: GitCommandRunner = async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const executor = new GitMirrorPushExecutor(mockRunner);
    const result = await executor.execute({
      sourceOrg: 'src-org',
      sourceRepo: 'repo-abc',
      targetOrg: 'tgt-org',
      targetRepo: 'repo-abc',
      targetRepoVisibility: 'private',
      targetClient: mockTargetReadClient as GitHubReadAdapter,
      targetWriteClient: mockTargetWriteClient,
    });

    assert.equal(result.targetCreated, true);
    assert.equal(createdMutations.length, 1);
    assert.equal(createdMutations[0]?.method, 'POST');
    assert.equal(createdMutations[0]?.path, '/orgs/{org}/repos');
  });

  it('redacts tokens on clone failure and cleans up scratch directory', async () => {
    let capturedScratchDir: string | undefined;

    const failingRunner: GitCommandRunner = async (_cmd, args) => {
      // The last argument of clone is the scratch directory
      capturedScratchDir = args[args.length - 1];
      return {
        exitCode: 128,
        stdout: '',
        stderr: 'fatal: Authentication failed for ghp_sourcesecret123',
      };
    };

    const executor = new GitMirrorPushExecutor(failingRunner);
    await assert.rejects(
      async () => {
        await executor.execute({
          sourceOrg: 'src-org',
          sourceRepo: 'repo-fail',
          targetOrg: 'tgt-org',
          targetRepo: 'repo-fail',
          sourceToken: 'ghp_sourcesecret123',
        });
      },
      (err: Error) => {
        assert.match(err.message, /\[REDACTED_TOKEN\]/);
        assert.equal(err.message.includes('ghp_sourcesecret123'), false);
        return true;
      },
    );

    // Verify temp directory was removed in finally block
    if (capturedScratchDir) {
      assert.equal(existsSync(capturedScratchDir), false);
    }
  });

  it('checks runner scratch disk space headroom and rejects insufficient disk', async () => {
    const runner: GitCommandRunner = async () => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const executor = new GitMirrorPushExecutor(runner);
    // Request 100 Petabytes of storage
    const hugeSizeBytes = 100 * 1024 * 1024 * 1024 * 1024;

    await assert.rejects(
      async () => {
        await executor.execute({
          sourceOrg: 'src-org',
          sourceRepo: 'huge-repo',
          targetOrg: 'tgt-org',
          targetRepo: 'huge-repo',
          estimatedSizeBytes: hugeSizeBytes,
        });
      },
      (err: Error) => {
        assert.match(err.message, /Runner scratch disk insufficient/);
        assert.match(err.message, /required for mirror-push/);
        return true;
      },
    );

    // Normal check returns valid disk metrics
    const check = checkScratchDiskSpace(tmpdir(), 1024 * 1024);
    assert.equal(typeof check.freeBytes, 'number');
    assert.equal(check.sufficient, true);
  });

  it('defaults to fast-snapshot shallow clone for repositories > 2 GiB', async () => {
    const executedArgs: (readonly string[])[] = [];
    const mockRunner: GitCommandRunner = async (_cmd, args) => {
      executedArgs.push(args);
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    };

    const executor = new GitMirrorPushExecutor(mockRunner);
    await executor.execute({
      sourceOrg: 'src-org',
      sourceRepo: 'chromium',
      targetOrg: 'tgt-org',
      targetRepo: 'chromium',
      estimatedSizeBytes: 55 * 1024 * 1024 * 1024,
      skipDiskCheck: true,
    });

    assert.equal(executedArgs.length, 2);
    assert.equal(executedArgs[0]?.includes('--depth'), true);
    assert.equal(executedArgs[0]?.includes('--single-branch'), true);
    assert.equal(executedArgs[1]?.includes('--all'), true);
  });

  it('uses full clone and windowed commit + tag batch fallback when mirrorPushMode is full-history', async () => {
    const executedArgs: (readonly string[])[] = [];
    const mockRunner: GitCommandRunner = async (_cmd, args) => {
      executedArgs.push(args);
      if (args.includes('--mirror')) {
        return {
          exitCode: 1,
          stdout: '',
          stderr:
            'error: RPC failed; HTTP 500 curl 22 The requested URL returned error: 500',
        };
      }
      if (args.includes('symbolic-ref')) {
        return { exitCode: 0, stdout: 'refs/heads/main\n', stderr: '' };
      }
      if (args.includes('rev-list')) {
        return {
          exitCode: 0,
          stdout: `${'a'.repeat(40)}\n${'b'.repeat(40)}\n`,
          stderr: '',
        };
      }
      if (args.includes('for-each-ref')) {
        return {
          exitCode: 0,
          stdout: 'refs/tags/v1.0.0\nrefs/tags/v1.1.0\n',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    };

    const executor = new GitMirrorPushExecutor(mockRunner);
    await executor.execute({
      sourceOrg: 'src-org',
      sourceRepo: 'chromium',
      targetOrg: 'tgt-org',
      targetRepo: 'chromium',
      estimatedSizeBytes: 55 * 1024 * 1024 * 1024,
      mirrorPushMode: 'full-history',
      skipDiskCheck: true,
    });

    // 1. Full clone (no --depth)
    assert.equal(executedArgs[0]?.includes('--depth'), false);
    // 2. Initial push --mirror
    assert.equal(executedArgs[1]?.includes('--mirror'), true);
    // 3. Fallback push --all + batched tag push
    assert.equal(
      executedArgs.some((a) => a.includes('--all')),
      true,
    );
    assert.equal(
      executedArgs.some(
        (a) => a.includes('refs/tags/v1.0.0') && a.includes('refs/tags/v1.1.0'),
      ),
      true,
    );
  });

  it('streams redacted stdout and stderr lines in real time and forwards callbacks via GitMirrorPushExecutor', async () => {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const res = await runGitCommand(
      process.execPath,
      [
        '-e',
        'console.log("Cloning with token ghp_liveSecretToken123"); console.error("Receiving objects: 50% (Bearer ghp_liveSecretToken123)");',
      ],
      {
        secrets: ['ghp_liveSecretToken123'],
        onStdout: (line) => stdoutLines.push(line),
        onStderr: (line) => stderrLines.push(line),
      },
    );

    assert.equal(res.exitCode, 0);
    assert.equal(stdoutLines.length, 1);
    assert.equal(stderrLines.length, 1);
    assert.ok(!stdoutLines[0]!.includes('ghp_liveSecretToken123'));
    assert.ok(!stderrLines[0]!.includes('ghp_liveSecretToken123'));

    // Also verify GitMirrorPushExecutor forwards onStdout and onStderr to its runner
    const forwardedStdout: string[] = [];
    const forwardedStderr: string[] = [];
    const forwardingRunner: GitCommandRunner = async (_cmd, _args, opts) => {
      opts?.onStdout?.('clone progress line');
      opts?.onStderr?.('push progress line');
      return {
        exitCode: 0,
        stdout: 'clone progress line',
        stderr: 'push progress line',
      };
    };
    const executor = new GitMirrorPushExecutor(forwardingRunner);
    await executor.execute({
      sourceOrg: 'src-org',
      sourceRepo: 'stream-repo',
      targetOrg: 'tgt-org',
      targetRepo: 'stream-repo',
      onStdout: (line) => forwardedStdout.push(line),
      onStderr: (line) => forwardedStderr.push(line),
    });

    assert.ok(forwardedStdout.includes('clone progress line'));
    assert.ok(forwardedStderr.includes('push progress line'));
  });

  it('attaches bounded, redacted partial stdout/stderr tail when runGitCommand times out', async () => {
    const streamedStderr: string[] = [];

    await assert.rejects(
      async () => {
        await runGitCommand(
          process.execPath,
          [
            '-e',
            'console.error("Counting objects: 42% using token ghp_timeoutSecret789"); setTimeout(() => {}, 5000);',
          ],
          {
            timeoutMs: 800,
            secrets: ['ghp_timeoutSecret789'],
            onStderr: (line) => streamedStderr.push(line),
          },
        );
      },
      (err: Error) => {
        assert.match(
          err.message,
          /Git command timed out after 800 milliseconds/,
        );
        assert.match(err.message, /Partial output before termination:/);
        assert.match(err.message, /Counting objects: 42%/);
        assert.equal(err.message.includes('ghp_timeoutSecret789'), false);
        return true;
      },
    );

    assert.equal(streamedStderr.length, 1);
    assert.equal(streamedStderr[0]!.includes('ghp_timeoutSecret789'), false);
  });
});
