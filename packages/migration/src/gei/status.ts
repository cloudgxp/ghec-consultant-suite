import type {
  GeiMigrationStatus,
  GeiStatusClient,
  GeiStatusOptions,
} from './types.js';

function asState(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['state', 'status']) {
    const candidate = record[key];
    if (typeof candidate === 'string') return candidate.toUpperCase();
  }
  return undefined;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('GEI status polling was aborted.'));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('GEI status polling was aborted.'));
      },
      { once: true },
    );
  });
}

/** Polls a reviewed, read-only migration status endpoint with capped backoff. */
export async function pollGeiMigrationStatus(
  migrationId: string,
  targetClient: GeiStatusClient,
  signal: AbortSignal,
  options: GeiStatusOptions = {},
): Promise<GeiMigrationStatus> {
  const maxAttempts = options.maxAttempts ?? Number.POSITIVE_INFINITY;
  let delay = options.initialDelayMs ?? 5_000;
  const maxDelay = options.maxDelayMs ?? 60_000;
  const sleep = options.sleep ?? wait;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted)
      throw signal.reason ?? new Error('GEI status polling was aborted.');
    const response = await targetClient.readSingle<unknown>(
      {
        id: 'rest.migrations.get-status',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/orgs/{org}/migrations/{migration_id}',
        pathParams: {
          org: options.targetOrg ?? 'unknown',
          migration_id: migrationId,
        },
      },
      signal,
    );
    const state = asState(response.data);
    if (!state)
      throw new Error(`GEI migration ${migrationId} returned no status.`);
    const status = { migrationId, state, raw: response.data };
    if (['SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(state)) return status;
    if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(state)) {
      throw new Error(
        `GEI migration ${migrationId} finished with status ${state}.`,
      );
    }
    if (attempt === maxAttempts) break;
    await sleep(delay, signal);
    delay = Math.min(delay * 2, maxDelay);
  }
  throw new Error(
    `GEI migration ${migrationId} did not finish before polling expired.`,
  );
}
