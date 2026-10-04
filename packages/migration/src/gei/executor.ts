import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { sanitizeDiagnostics } from '@ghec/github-client';
import type {
  GeiCommandResult,
  GeiCommandRunner,
  GeiMigrationRequest,
  GeiMigrationResult,
} from './types.js';

const RELEASE_LIMIT_BYTES = 10 * 1024 ** 3;
const METADATA_LIMIT_BYTES = 40 * 1024 ** 3;

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

/** Runs a command without a shell and redacts its output before it leaves this boundary. */
export const runGeiCommand: GeiCommandRunner = async (
  command,
  args,
  options = {},
) => {
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new Error('GEI command was aborted.');
  }
  const secrets = options.secrets ?? [];
  return new Promise<GeiCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = collectLines(options.onStdout, secrets);
    const stderr = collectLines(options.onStderr, secrets);
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => {
      child.kill('SIGTERM');
      settle(() =>
        reject(options.signal?.reason ?? new Error('GEI command was aborted.')),
      );
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      settle(() =>
        reject(
          new Error(
            `GEI command timed out after ${options.timeoutMs ?? 0} milliseconds.`,
          ),
        ),
      );
    }, options.timeoutMs ?? 0);
    if (options.timeoutMs === undefined) clearTimeout(timeout);
    options.signal?.addEventListener('abort', abort, { once: true });
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
          command,
          args: [...args],
          exitCode: exitCode ?? 1,
          stdout: stdout.text(),
          stderr: stderr.text(),
        });
      }),
    );
  });
};

function assertIdentifier(label: string, value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new Error(`${label} must be a non-empty GitHub identifier.`);
  }
}

function shouldSkipReleases(request: GeiMigrationRequest): boolean {
  return (
    request.skipReleases === true ||
    (request.releaseBytes ?? 0) > RELEASE_LIMIT_BYTES ||
    (request.metadataBytes ?? 0) > METADATA_LIMIT_BYTES
  );
}

export function buildGeiMigrationArgs(
  request: GeiMigrationRequest,
): readonly string[] {
  assertIdentifier('sourceOrg', request.sourceOrg);
  assertIdentifier('sourceRepo', request.sourceRepo);
  assertIdentifier('targetOrg', request.targetOrg);
  assertIdentifier('targetRepo', request.targetRepo);
  const args = [
    'gei',
    'migrate-repo',
    '--github-source-org',
    request.sourceOrg,
    '--source-repo',
    request.sourceRepo,
    '--github-target-org',
    request.targetOrg,
    '--target-repo',
    request.targetRepo,
  ];
  if (request.sourceApiUrl)
    args.push('--github-source-api-url', request.sourceApiUrl);
  if (request.targetApiUrl) args.push('--target-api-url', request.targetApiUrl);
  if (request.targetRepoVisibility)
    args.push('--target-repo-visibility', request.targetRepoVisibility);
  if (shouldSkipReleases(request)) args.push('--skip-releases');
  return args;
}

/** Spawns `gh gei migrate-repo` with credentials supplied only through its environment. */
export class GeiProcessExecutor {
  private readonly runner: GeiCommandRunner;

  constructor(runner: GeiCommandRunner = runGeiCommand) {
    this.runner = runner;
  }

  async execute(request: GeiMigrationRequest): Promise<GeiMigrationResult> {
    const args = buildGeiMigrationArgs(request);
    const secrets = [request.sourceToken ?? '', request.targetToken ?? ''];
    const result = await this.runner('gh', args, {
      environment: {
        ...(request.sourceToken ? { GH_SOURCE_PAT: request.sourceToken } : {}),
        ...(request.targetToken ? { GH_PAT: request.targetToken } : {}),
      },
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.timeoutMs !== undefined
        ? { timeoutMs: request.timeoutMs }
        : {}),
      ...(request.onOutput
        ? { onStdout: request.onOutput, onStderr: request.onOutput }
        : {}),
      secrets,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `GEI migrate-repo failed with exit code ${result.exitCode}: ${redact(result.stderr || result.stdout, secrets)}`,
      );
    }
    const stdout = redact(result.stdout, secrets);
    const stderr = redact(result.stderr, secrets);
    const migrationId = `${stdout}\n${stderr}`.match(
      /\bRM_[A-Za-z0-9_-]+\b/,
    )?.[0];
    return {
      ...(migrationId ? { migrationId } : {}),
      skippedReleases: shouldSkipReleases(request),
      command: ['gh', ...args],
      stdout,
      stderr,
    };
  }
}
