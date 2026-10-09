import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { sanitizeDiagnostics } from '@ghec/github-client';
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

export const runGitCommand: GitCommandRunner = async (
  command,
  args,
  options = {},
) => {
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new Error('Git command was aborted.');
  }
  const secrets = options.secrets ?? [];
  return new Promise<GitCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = collectLines(undefined, secrets);
    const stderr = collectLines(undefined, secrets);

    let settled = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM');
          settle(() =>
            reject(
              new Error(
                `Git command timed out after ${options.timeoutMs} milliseconds.`,
              ),
            ),
          );
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
      settle(() =>
        reject(options.signal?.reason ?? new Error('Git command was aborted.')),
      );
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

export function checkScratchDiskSpace(
  dir: string,
  estimatedSizeBytes: number,
  headroomMultiplier = 1.5,
): DiskSpaceCheckResult {
  const requiredBytes = Math.ceil(estimatedSizeBytes * headroomMultiplier);
  try {
    const stats = statfsSync(dir);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      freeBytes,
      requiredBytes,
      sufficient: freeBytes >= requiredBytes,
      path: dir,
    };
  } catch {
    return {
      freeBytes: 0,
      requiredBytes,
      sufficient: true,
      path: dir,
    };
  }
}

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
    } = request;

    const effectiveSignal = signal ?? new AbortController().signal;

    if (!sourceOrg || !sourceRepo || !targetOrg || !targetRepo) {
      throw new Error(
        'MirrorPushRequest requires sourceOrg, sourceRepo, targetOrg, and targetRepo.',
      );
    }

    const parentScratch = request.scratchDir ?? tmpdir();
    let diskSpaceChecked: DiskSpaceCheckResult | undefined;

    if (
      !request.skipDiskCheck &&
      estimatedSizeBytes !== undefined &&
      estimatedSizeBytes > 0
    ) {
      diskSpaceChecked = checkScratchDiskSpace(
        parentScratch,
        estimatedSizeBytes,
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

    // Provision target repo if not already existing
    let targetCreated = false;
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

    const secretsToRedact: string[] = [];
    if (sourceToken) secretsToRedact.push(sourceToken);
    if (targetToken) secretsToRedact.push(targetToken);

    const scratchDir = mkdtempSync(join(parentScratch, 'ghec-mirror-push-'));
    let combinedStdout = '';
    let combinedStderr = '';

    try {
      // 1. Bare Clone
      const cloneArgs: string[] = [];
      const cloneEnv: Record<string, string> = {};

      if (sourceToken) {
        cloneEnv.GHEC_SOURCE_AUTH = `Bearer ${sourceToken}`;
        cloneArgs.push('--config-env=http.extraHeader=GHEC_SOURCE_AUTH');
      }

      cloneArgs.push(
        'clone',
        '--bare',
        '--',
        `https://github.com/${sourceOrg}/${sourceRepo}.git`,
        scratchDir,
      );

      const cloneResult = await this.runner('git', cloneArgs, {
        environment: cloneEnv,
        secrets: secretsToRedact,
        signal,
        timeoutMs,
      });

      combinedStdout += cloneResult.stdout;
      combinedStderr += cloneResult.stderr;

      if (cloneResult.exitCode !== 0) {
        throw new Error(
          `git clone --bare failed with exit code ${cloneResult.exitCode}: ${redact(cloneResult.stderr || cloneResult.stdout, secretsToRedact)}`,
        );
      }

      // 2. Mirror Push
      const pushArgs: string[] = [];
      const pushEnv: Record<string, string> = {};

      if (targetToken) {
        pushEnv.GHEC_TARGET_AUTH = `Bearer ${targetToken}`;
        pushArgs.push('--config-env=http.extraHeader=GHEC_TARGET_AUTH');
      }

      pushArgs.push(
        'push',
        '--mirror',
        '--',
        `https://github.com/${targetOrg}/${targetRepo}.git`,
      );

      const pushResult = await this.runner('git', pushArgs, {
        cwd: scratchDir,
        environment: pushEnv,
        secrets: secretsToRedact,
        signal,
        timeoutMs,
      });

      combinedStdout += `\n${pushResult.stdout}`;
      combinedStderr += `\n${pushResult.stderr}`;

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
