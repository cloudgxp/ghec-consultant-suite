import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { sanitizeDiagnostics } from '@ghec/github-client';
import { checkScratchDiskSpace } from './headroom.js';
import type {
  DiskSpaceCheckResult,
  GitCommandResult,
  GitCommandRunner,
  MirrorPushRequest,
  MirrorPushResult,
} from './types.js';

function redact(message: string, secrets: readonly string[] = []): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce(
      (sanitized, secret) => sanitized.replaceAll(secret, '[REDACTED_TOKEN]'),
      sanitizeDiagnostics(message),
    );
}

function collectLines(
  onLine: ((line: string) => void) | undefined,
  secrets: readonly string[],
): { append(chunk: Buffer): void; flush(): void; text(): string } {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const lines: string[] = [];
  const emit = (line: string) => {
    const safeLine = redact(line, secrets);
    lines.push(safeLine);
    onLine?.(safeLine);
  };
  return {
    append(chunk) {
      pending += decoder.write(chunk);
      const completeLines = pending.split(/\r?\n/);
      pending = completeLines.pop() ?? '';
      for (const line of completeLines) emit(line);
    },
    flush() {
      pending += decoder.end();
      if (pending) emit(pending);
      pending = '';
    },
    text: () => lines.join('\n'),
  };
}

function formatPartialOutputTail(
  stdoutText: string,
  stderrText: string,
  maxChars = 1500,
): string {
  const combined = [
    stderrText.trim() ? `stderr:\n${stderrText.trim()}` : '',
    stdoutText.trim() ? `stdout:\n${stdoutText.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (!combined) return '';
  const tail =
    combined.length > maxChars
      ? `...${combined.slice(combined.length - (maxChars - 3))}`
      : combined;
  return ` Partial output before termination:\n${tail}`;
}

export const runGitCommand: GitCommandRunner = async (
  command,
  args,
  options = {},
) => {
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new Error('Git command was aborted.');
  }
  const secrets = [...(options.secrets ?? [])];
  const envMap: Record<string, string | undefined> = {
    ...process.env,
    ...options.environment,
  };
  for (const authVar of ['GHEC_SOURCE_AUTH', 'GHEC_TARGET_AUTH'] as const) {
    const val = envMap[authVar];
    if (typeof val === 'string' && val.startsWith('Bearer ')) {
      const rawToken = val.slice('Bearer '.length).trim();
      if (rawToken) {
        const b64 = Buffer.from(`x-access-token:${rawToken}`, 'utf8').toString(
          'base64',
        );
        envMap[authVar] = `AUTHORIZATION: basic ${b64}`;
        secrets.push(rawToken, b64);
      }
    }
  }
  const effectiveArgs =
    command === 'git'
      ? [
          '-c',
          'pack.threads=2',
          '-c',
          'pack.windowMemory=100m',
          '-c',
          'pack.packSizeLimit=2g',
          '-c',
          'core.deltaBaseCacheLimit=128m',
          '-c',
          'http.postBuffer=524288000',
          ...args,
        ]
      : args;
  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn(command, effectiveArgs, {
      cwd: options.cwd,
      env: envMap,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = collectLines(options.onStdout, secrets);
    const stderr = collectLines(options.onStderr, secrets);

    let settled = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM');
          settle(() => {
            stdout.flush();
            stderr.flush();
            const tail = formatPartialOutputTail(stdout.text(), stderr.text());
            reject(
              new Error(
                `Git command timed out after ${options.timeoutMs} milliseconds.${tail}`,
              ),
            );
          });
        }, options.timeoutMs)
      : undefined;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      callback();
    };

    const onAbort = () => {
      child.kill('SIGTERM');
      settle(() => {
        stdout.flush();
        stderr.flush();
        const tail = formatPartialOutputTail(stdout.text(), stderr.text());
        const reason = options.signal?.reason;
        const baseMsg =
          reason instanceof Error
            ? reason.message
            : reason !== undefined
              ? String(reason)
              : 'Git command was aborted.';
        reject(new Error(`${redact(baseMsg, secrets)}${tail}`));
      });
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => stdout.append(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.append(chunk));

    child.once('error', (error) =>
      settle(() =>
        reject(new Error(redact(error.message, secrets), { cause: error })),
      ),
    );

    child.once('close', (exitCode) =>
      settle(() => {
        stdout.flush();
        stderr.flush();
        resolve({
          exitCode: exitCode ?? 0,
          stdout: stdout.text(),
          stderr: stderr.text(),
        });
      }),
    );
  });
};

export class GitMirrorPushExecutor {
  private readonly runner: GitCommandRunner;

  constructor(runner?: GitCommandRunner) {
    this.runner = runner ?? runGitCommand;
  }

  async execute(request: MirrorPushRequest): Promise<MirrorPushResult> {
    const startTime = Date.now();
    const {
      sourceOrg,
      sourceRepo,
      targetOrg,
      targetRepo,
      targetRepoVisibility = 'private',
      sourceToken,
      targetToken,
      estimatedSizeBytes,
      signal,
      timeoutMs,
      onStdout,
      onStderr,
    } = request;
    const streamCallbacks = {
      ...(onStdout ? { onStdout } : {}),
      ...(onStderr ? { onStderr } : {}),
    };

    const effectiveSignal = signal ?? new AbortController().signal;

    if (!sourceOrg || !sourceRepo || !targetOrg || !targetRepo) {
      throw new Error(
        'MirrorPushRequest requires sourceOrg, sourceRepo, targetOrg, and targetRepo.',
      );
    }

    const parentScratch =
      request.scratchDir ??
      process.env.GHEC_SCRATCH_DIR ??
      process.env.RUNNER_TEMP ??
      tmpdir();
    let diskSpaceChecked: DiskSpaceCheckResult | undefined;

    const mirrorPushMode = request.mirrorPushMode ?? 'fast-snapshot';
    const useShallowPackGuard =
      mirrorPushMode === 'fast-snapshot' &&
      estimatedSizeBytes !== undefined &&
      estimatedSizeBytes > 500 * 1024 * 1024;

    if (
      !request.skipDiskCheck &&
      estimatedSizeBytes !== undefined &&
      estimatedSizeBytes > 0
    ) {
      const effectiveDiskEstimate =
        useShallowPackGuard && estimatedSizeBytes <= 100 * 1024 * 1024 * 1024
          ? Math.min(estimatedSizeBytes, 20 * 1024 * 1024 * 1024)
          : estimatedSizeBytes;
      diskSpaceChecked = checkScratchDiskSpace(
        parentScratch,
        effectiveDiskEstimate,
      );
      if (!diskSpaceChecked.sufficient) {
        const freeGiB = (diskSpaceChecked.freeBytes / 1024 ** 3).toFixed(2);
        const reqGiB = (diskSpaceChecked.requiredBytes / 1024 ** 3).toFixed(2);
        const repoGiB = (estimatedSizeBytes / 1024 ** 3).toFixed(2);
        throw new Error(
          `Runner scratch disk insufficient: ${freeGiB} GiB free on "${parentScratch}", but ${reqGiB} GiB required for mirror-push (1.5x headroom of ${repoGiB} GiB). Please run on a larger runner or attach scratch storage.`,
        );
      }
    }

    const secretsToRedact: string[] = [];
    if (sourceToken) secretsToRedact.push(sourceToken);
    if (targetToken) secretsToRedact.push(targetToken);

    const scratchDir = mkdtempSync(join(parentScratch, 'ghec-mirror-push-'));
    let combinedStdout = '';
    let combinedStderr = '';
    let targetCreated = false;

    try {
      // 1. Bare Clone (before provisioning target repo so failed clones never leave empty target repos)
      const cloneArgs: string[] = [];
      const cloneEnv: Record<string, string> = {};

      if (sourceToken) {
        cloneEnv.GHEC_SOURCE_AUTH = `Bearer ${sourceToken}`;
        cloneArgs.push('--config-env=http.extraHeader=GHEC_SOURCE_AUTH');
      }

      if (useShallowPackGuard) {
        cloneArgs.push(
          'clone',
          '--bare',
          '--depth',
          '1',
          '--single-branch',
          '--',
          `https://github.com/${sourceOrg}/${sourceRepo}.git`,
          scratchDir,
        );
      } else {
        cloneArgs.push(
          'clone',
          '--bare',
          '--',
          `https://github.com/${sourceOrg}/${sourceRepo}.git`,
          scratchDir,
        );
      }

      const cloneResult = await this.runner('git', cloneArgs, {
        environment: cloneEnv,
        secrets: secretsToRedact,
        signal,
        timeoutMs,
        ...streamCallbacks,
      });

      combinedStdout += cloneResult.stdout;
      combinedStderr += cloneResult.stderr;

      if (cloneResult.exitCode !== 0) {
        throw new Error(
          `git clone --bare failed with exit code ${cloneResult.exitCode}: ${redact(cloneResult.stderr || cloneResult.stdout, secretsToRedact)}`,
        );
      }

      if (useShallowPackGuard && existsSync(join(scratchDir, 'shallow'))) {
        const symRefRes = await this.runner('git', ['symbolic-ref', 'HEAD'], {
          cwd: scratchDir,
          secrets: secretsToRedact,
          signal,
          timeoutMs,
          ...streamCallbacks,
        });
        const branchRef = symRefRes.stdout.trim() || 'refs/heads/main';
        const commitTreeRes = await this.runner(
          'git',
          [
            '-c',
            'user.name=GHEC Migration',
            '-c',
            'user.email=ghec-migration@users.noreply.github.com',
            'commit-tree',
            'HEAD^{tree}',
            '-m',
            `Shallow mirror snapshot of ${sourceOrg}/${sourceRepo}`,
          ],
          {
            cwd: scratchDir,
            environment: {
              GIT_AUTHOR_NAME: 'GHEC Migration',
              GIT_AUTHOR_EMAIL: 'ghec-migration@users.noreply.github.com',
              GIT_COMMITTER_NAME: 'GHEC Migration',
              GIT_COMMITTER_EMAIL: 'ghec-migration@users.noreply.github.com',
            },
            secrets: secretsToRedact,
            signal,
            timeoutMs,
            ...streamCallbacks,
          },
        );
        const newCommitSha = commitTreeRes.stdout.trim();
        if (
          commitTreeRes.exitCode === 0 &&
          /^[0-9a-f]{40}$/i.test(newCommitSha)
        ) {
          await this.runner('git', ['update-ref', branchRef, newCommitSha], {
            cwd: scratchDir,
            secrets: secretsToRedact,
            signal,
            timeoutMs,
            ...streamCallbacks,
          });
          rmSync(join(scratchDir, 'shallow'), { force: true });
        }
      }

      // 2. Provision target repo if not already existing
      let targetExists = false;

      if (request.targetClient) {
        try {
          const checkRes = await request.targetClient.readSingle(
            {
              id: 'rest.repos.get',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}',
              pathParams: { owner: targetOrg, repo: targetRepo },
            },
            effectiveSignal,
          );
          if (checkRes.status === 200) {
            targetExists = true;
          }
        } catch {
          targetExists = false;
        }
      }

      if (!targetExists) {
        if (request.targetWriteClient) {
          await request.targetWriteClient.mutate(
            {
              id: 'rest.repos.createInOrg',
              method: 'POST',
              path: '/orgs/{org}/repos',
              pathParams: { org: targetOrg },
              body: {
                name: targetRepo,
                visibility: targetRepoVisibility,
                private: targetRepoVisibility === 'private',
              },
            },
            effectiveSignal,
          );
          targetCreated = true;
        } else if (targetToken) {
          try {
            const res = await fetch(
              `https://api.github.com/orgs/${targetOrg}/repos`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${targetToken}`,
                  Accept: 'application/vnd.github+json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: targetRepo,
                  visibility: targetRepoVisibility,
                  private: targetRepoVisibility === 'private',
                }),
                signal: effectiveSignal,
              },
            );
            if (res.ok || res.status === 201 || res.status === 422) {
              targetCreated = res.status === 201;
            }
          } catch {
            // If fetch fails, git push may still attempt creation or error cleanly
          }
        }
      }

      // 3. Mirror Push
      const pushArgs: string[] = [];
      const pushEnv: Record<string, string> = {};

      if (targetToken) {
        pushEnv.GHEC_TARGET_AUTH = `Bearer ${targetToken}`;
        pushArgs.push('--config-env=http.extraHeader=GHEC_TARGET_AUTH');
      }

      pushArgs.push(
        'push',
        ...(useShallowPackGuard ? ['--force', '--all'] : ['--mirror']),
        '--',
        `https://github.com/${targetOrg}/${targetRepo}.git`,
      );

      let pushResult = await this.runner('git', pushArgs, {
        cwd: scratchDir,
        environment: pushEnv,
        secrets: secretsToRedact,
        signal,
        timeoutMs,
        ...streamCallbacks,
      });

      combinedStdout += `\n${pushResult.stdout}`;
      combinedStderr += `\n${pushResult.stderr}`;

      if (pushResult.exitCode !== 0 && !useShallowPackGuard) {
        const errOut = `${pushResult.stderr}\n${pushResult.stdout}`;
        if (
          errOut.includes('HTTP 500') ||
          errOut.includes('unexpected disconnect') ||
          errOut.includes('remote end hung up') ||
          errOut.includes('exceeds maximum allowed size')
        ) {
          const remoteUrl = `https://github.com/${targetOrg}/${targetRepo}.git`;
          const authPrefix = targetToken
            ? ['--config-env=http.extraHeader=GHEC_TARGET_AUTH']
            : [];

          // Step 1: Windowed commit-range push for default branch if history is deep
          const symRefRes = await this.runner('git', ['symbolic-ref', 'HEAD'], {
            cwd: scratchDir,
            secrets: secretsToRedact,
            signal,
            timeoutMs,
            ...streamCallbacks,
          });
          const branchRef = symRefRes.stdout.trim() || 'refs/heads/main';
          const revListRes = await this.runner(
            'git',
            ['rev-list', '--reverse', branchRef],
            {
              cwd: scratchDir,
              secrets: secretsToRedact,
              signal,
              timeoutMs,
              ...streamCallbacks,
            },
          );
          if (revListRes.exitCode === 0) {
            const commits = revListRes.stdout
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => /^[0-9a-f]{40}$/i.test(line));
            const windowSize = 25000;
            for (
              let idx = windowSize - 1;
              idx < commits.length - 1;
              idx += windowSize
            ) {
              const sha = commits[idx];
              if (!sha) continue;
              const stepPush = await this.runner(
                'git',
                [...authPrefix, 'push', '--', remoteUrl, `${sha}:${branchRef}`],
                {
                  cwd: scratchDir,
                  environment: pushEnv,
                  secrets: secretsToRedact,
                  signal,
                  timeoutMs,
                  ...streamCallbacks,
                },
              );
              combinedStdout += `\n${stepPush.stdout}`;
              combinedStderr += `\n${stepPush.stderr}`;
            }
          }

          // Step 2: Push all branches
          pushResult = await this.runner(
            'git',
            [...authPrefix, 'push', '--all', '--', remoteUrl],
            {
              cwd: scratchDir,
              environment: pushEnv,
              secrets: secretsToRedact,
              signal,
              timeoutMs,
              ...streamCallbacks,
            },
          );
          combinedStdout += `\n${pushResult.stdout}`;
          combinedStderr += `\n${pushResult.stderr}`;

          // Step 3: Push tags in batches of 500 when full-history mode is requested
          if (
            pushResult.exitCode === 0 &&
            request.mirrorPushMode === 'full-history'
          ) {
            const tagListRes = await this.runner(
              'git',
              ['for-each-ref', '--format=%(refname)', 'refs/tags'],
              {
                cwd: scratchDir,
                secrets: secretsToRedact,
                signal,
                timeoutMs,
                ...streamCallbacks,
              },
            );
            if (tagListRes.exitCode === 0) {
              const tagRefs = tagListRes.stdout
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.startsWith('refs/tags/'));
              const tagBatchSize = 500;
              for (let i = 0; i < tagRefs.length; i += tagBatchSize) {
                const batch = tagRefs.slice(i, i + tagBatchSize);
                const tagPush = await this.runner(
                  'git',
                  [...authPrefix, 'push', '--', remoteUrl, ...batch],
                  {
                    cwd: scratchDir,
                    environment: pushEnv,
                    secrets: secretsToRedact,
                    signal,
                    timeoutMs,
                    ...streamCallbacks,
                  },
                );
                combinedStdout += `\n${tagPush.stdout}`;
                combinedStderr += `\n${tagPush.stderr}`;
              }
            }
          }
        }
      }

      if (pushResult.exitCode !== 0) {
        throw new Error(
          `git push --mirror failed with exit code ${pushResult.exitCode}: ${redact(pushResult.stderr || pushResult.stdout, secretsToRedact)}`,
        );
      }

      return {
        sourceOrg,
        sourceRepo,
        targetOrg,
        targetRepo,
        durationMs: Date.now() - startTime,
        stdout: combinedStdout,
        stderr: combinedStderr,
        targetCreated,
        ...(diskSpaceChecked ? { diskSpaceChecked } : {}),
      };
    } finally {
      try {
        rmSync(scratchDir, { recursive: true, force: true });
      } catch {
        // Ignored in cleanup
      }
    }
  }
}
