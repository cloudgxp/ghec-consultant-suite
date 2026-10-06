import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GitLfsClient } from './lfs-client.js';
import { repositoryUsesLfs, verifyTargetLfsAvailability } from './verifier.js';
import type {
  GitLfsMigrationRequest,
  GitLfsMigrationResult,
  GitLfsPreflightResult,
  GitLfsStrategyOptions,
} from './types.js';

function assertIdentifier(label: string, value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) {
    throw new Error(`${label} must be a non-empty GitHub identifier.`);
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Git LFS migration was aborted.'));
      return;
    }
    const timer = setTimeout(resolvePromise, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Git LFS migration was aborted.'));
      },
      { once: true },
    );
  });
}

/** Stage 4 strategy for LFS objects omitted by GitHub Enterprise Importer. */
export class GitLfsMigrationStrategy {
  readonly id = 'strategy-git-lfs';
  readonly displayName = 'Git LFS Dual-Remote Streamed Migration';
  private readonly client: GitLfsClient;
  private readonly quotaChecker: GitLfsStrategyOptions['quotaChecker'];
  private readonly now: () => number;

  constructor(options: GitLfsStrategyOptions) {
    this.client = new GitLfsClient(
      options.runner ? { runner: options.runner } : {},
    );
    this.quotaChecker = options.quotaChecker;
    this.now = options.now ?? Date.now;
  }

  async preflight(
    request: GitLfsMigrationRequest,
  ): Promise<GitLfsPreflightResult> {
    const usesLfs = await repositoryUsesLfs(
      request.sourceClient,
      request.sourceOrg,
      request.sourceRepo,
      request.signal,
    );
    await this.client.checkInstalled(request.signal);
    const targetQuota = await this.quotaChecker.check(
      request.targetOrg,
      request.targetRepo,
      request.signal,
    );
    if (
      !targetQuota.enabled ||
      targetQuota.storageEnabled === false ||
      targetQuota.bandwidthEnabled === false
    ) {
      throw new Error(
        `Target Git LFS quota is unavailable: ${targetQuota.detail ?? 'not enabled'}.`,
      );
    }
    if (
      request.expectedBytes !== undefined &&
      targetQuota.storageRemainingBytes !== undefined &&
      request.expectedBytes > targetQuota.storageRemainingBytes
    ) {
      throw new Error(
        'Target Git LFS storage quota is insufficient for the expected transfer.',
      );
    }
    return { usesLfs, gitLfsAvailable: true, targetQuota };
  }

  async execute(
    request: GitLfsMigrationRequest,
  ): Promise<GitLfsMigrationResult> {
    if (!request.geiCompleted) {
      throw new Error('Git LFS transfer may run only after GEI completes.');
    }
    for (const [label, value] of [
      ['sourceOrg', request.sourceOrg],
      ['sourceRepo', request.sourceRepo],
      ['targetOrg', request.targetOrg],
      ['targetRepo', request.targetRepo],
    ] as const) {
      assertIdentifier(label, value);
    }
    const startedAt = this.now();
    const preflight = await this.preflight(request);
    const stagingDirectory = join(
      resolve(request.stagingRoot ?? './migrations/.staging-lfs'),
      `${request.targetRepo}.git`,
    );
    if (!preflight.usesLfs) {
      this.recordCheckpoint(request, 'skipped');
      return {
        status: 'skipped',
        stagingDirectory,
        metrics: {
          objectCount: 0,
          bytesPushed: 0,
          durationMs: this.now() - startedAt,
        },
      };
    }
    if (request.dryRun) {
      this.recordCheckpoint(request, 'completed');
      return {
        status: 'completed',
        stagingDirectory,
        metrics: {
          objectCount: request.expectedObjectCount ?? 0,
          bytesPushed: request.expectedBytes ?? 0,
          durationMs: this.now() - startedAt,
        },
      };
    }
    if (existsSync(stagingDirectory)) {
      throw new Error(
        `LFS staging directory already exists: ${stagingDirectory}`,
      );
    }
    mkdirSync(resolve(request.stagingRoot ?? './migrations/.staging-lfs'), {
      recursive: true,
      mode: 0o700,
    });
    const attempts = request.maxAttempts ?? 3;
    const sleep = request.sleep ?? delay;
    try {
      await this.client.cloneMirror(
        stagingDirectory,
        request.sourceOrg,
        request.sourceRepo,
        request.sourceToken,
        request.signal,
      );
      await this.retry(
        () =>
          this.client.fetchAll(
            stagingDirectory,
            request.sourceToken,
            request.signal,
          ),
        attempts,
        request.retryDelayMs ?? 1_000,
        sleep,
        request.signal,
      );
      await this.client.setTargetRemote(
        stagingDirectory,
        request.targetOrg,
        request.targetRepo,
        request.targetToken,
        request.signal,
      );
      await this.retry(
        () =>
          this.client.pushAll(
            stagingDirectory,
            request.targetToken,
            request.signal,
          ),
        attempts,
        request.retryDelayMs ?? 1_000,
        sleep,
        request.signal,
      );
      await verifyTargetLfsAvailability(
        request.targetClient,
        request.targetOrg,
        request.targetRepo,
        request.signal,
      );
      this.recordCheckpoint(request, 'completed');
      const metrics = {
        objectCount: request.expectedObjectCount ?? 0,
        bytesPushed: request.expectedBytes ?? 0,
        durationMs: this.now() - startedAt,
      };
      rmSync(stagingDirectory, { recursive: true, force: true });
      return { status: 'completed', stagingDirectory, metrics };
    } catch (error) {
      this.recordCheckpoint(request, 'failed', error);
      throw error;
    }
  }

  private async retry(
    operation: () => Promise<void>,
    maxAttempts: number,
    retryDelayMs: number,
    sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await operation();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) await sleep(retryDelayMs * attempt, signal);
      }
    }
    throw lastError;
  }

  private recordCheckpoint(
    request: GitLfsMigrationRequest,
    status: 'completed' | 'failed' | 'skipped',
    error?: unknown,
  ): void {
    if (!request.checkpointManager || !request.checkpointRepository) return;
    request.checkpointManager.recordStageResult(
      request.checkpointRepository,
      'specializedStrategies',
      {
        'git-lfs': {
          status,
          ...(error instanceof Error ? { error: error.message } : {}),
        },
      },
    );
  }
}
