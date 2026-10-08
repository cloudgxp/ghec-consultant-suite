export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error('Aborted'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new Error('Aborted'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
  });
}

export interface RateLimitStatus {
  remaining: number;
  resetAt: number; // epoch ms
  cost?: number | undefined;
}

export interface AdaptiveRateLimiterOptions {
  /**
   * Tenant label (e.g. `source` or `target`) included in pacing diagnostics so
   * operators can tell which tenant's quota is constrained. Each tenant must
   * own its own limiter instance; limiters never share state.
   */
  readonly label?: string | undefined;
}

export class AdaptiveRateLimiter {
  /** Diagnostic prefix, e.g. `[rate-limit:source]`. */
  readonly logPrefix: string;
  private graphqlLimit: RateLimitStatus = {
    remaining: 5000,
    resetAt: 0,
  };
  private restLimit: RateLimitStatus = {
    remaining: 5000,
    resetAt: 0,
  };
  private restLimitCapacity = 5000;
  private lastRequestTime = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: AdaptiveRateLimiterOptions = {}) {
    this.logPrefix = options.label
      ? `[rate-limit:${options.label}]`
      : '[rate-limit]';
  }

  getStatus(type: 'graphql' | 'rest'): RateLimitStatus {
    return type === 'graphql'
      ? { ...this.graphqlLimit }
      : { ...this.restLimit };
  }

  updateGraphQL(
    remaining?: number | undefined,
    resetAtIsoOrEpoch?: string | number | undefined,
    cost?: number | undefined,
  ): void {
    if (typeof remaining === 'number') {
      this.graphqlLimit.remaining = remaining;
    }
    if (resetAtIsoOrEpoch !== undefined) {
      this.graphqlLimit.resetAt =
        typeof resetAtIsoOrEpoch === 'number'
          ? resetAtIsoOrEpoch > 10_000_000_000
            ? resetAtIsoOrEpoch
            : resetAtIsoOrEpoch * 1000
          : !isNaN(Number(resetAtIsoOrEpoch))
            ? Number(resetAtIsoOrEpoch) > 10_000_000_000
              ? Number(resetAtIsoOrEpoch)
              : Number(resetAtIsoOrEpoch) * 1000
            : Date.parse(resetAtIsoOrEpoch);
    }
    if (typeof cost === 'number') {
      this.graphqlLimit.cost = cost;
    }
  }

  updateREST(
    remaining?: number | undefined,
    resetAtEpochOrIso?: string | number | undefined,
    limit?: number | undefined,
  ): void {
    if (typeof remaining === 'number') {
      this.restLimit.remaining = remaining;
    }
    if (typeof limit === 'number') {
      this.restLimitCapacity = limit;
    }
    if (resetAtEpochOrIso !== undefined) {
      this.restLimit.resetAt =
        typeof resetAtEpochOrIso === 'number'
          ? resetAtEpochOrIso > 10_000_000_000
            ? resetAtEpochOrIso
            : resetAtEpochOrIso * 1000
          : !isNaN(Number(resetAtEpochOrIso))
            ? Number(resetAtEpochOrIso) > 10_000_000_000
              ? Number(resetAtEpochOrIso)
              : Number(resetAtEpochOrIso) * 1000
            : Date.parse(resetAtEpochOrIso);
    }
  }

  async acquire(
    type: 'graphql' | 'rest',
    signal?: AbortSignal,
  ): Promise<() => void> {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Aborted');
    }

    const status = type === 'graphql' ? this.graphqlLimit : this.restLimit;

    // Critical pause threshold: remaining < 100 for normal capacity (>100).
    // For small/unauthenticated capacity (<=100), critically pause only when truly depleted (<= 5).
    const criticalThreshold =
      type === 'rest' && this.restLimitCapacity <= 100 ? 5 : 100;
    const isCritical = status.remaining < criticalThreshold;

    if (isCritical && status.resetAt > Date.now()) {
      const waitTimeMs = Math.max(0, status.resetAt - Date.now()) + 1000;
      if (waitTimeMs > 0) {
        const resetIso = new Date(status.resetAt).toISOString();
        console.warn(
          `${this.logPrefix} ${type.toUpperCase()} quota critically low (${status.remaining} remaining). Pausing execution for ${Math.ceil(
            waitTimeMs / 1000,
          )}s until quota reset at ${resetIso}...`,
        );
        await sleep(waitTimeMs, signal);
        // Reset remaining estimate after reset window has passed
        status.remaining = type === 'graphql' ? 5000 : this.restLimitCapacity;
      }
    }

    // Dynamic pacing threshold: remaining < 500 (serialize to concurrency 1, inject 500ms sleep)
    if (status.remaining < 500) {
      let releaseLock: () => void = () => {};
      const currentLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      const previousQueue = this.queue;
      this.queue = previousQueue.then(() => currentLock);

      await previousQueue;

      if (signal?.aborted) {
        releaseLock();
        throw signal.reason ?? new Error('Aborted');
      }

      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < 500) {
        await sleep(500 - elapsed, signal);
      }

      return () => {
        this.lastRequestTime = Date.now();
        releaseLock();
      };
    }

    return () => {
      this.lastRequestTime = Date.now();
    };
  }
}
