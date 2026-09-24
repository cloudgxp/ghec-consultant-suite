/** Authoritative read adapter interfaces for GHEC discovery collectors. */
export interface ReadOperation {
  readonly id: string;
  readonly transport: 'graphql' | 'rest';
  readonly verifiedReadOnly: true;
  readonly path?: string;
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly queryParams?: Readonly<Record<string, string | number | boolean>>;
}

export interface ReadPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly observedAt: string;
  readonly remainingRequests: number | null;
  readonly resetAt: string | null;
  readonly status: number;
}

export interface GitHubReadAdapter {
  /** Implementation must resolve IDs through a reviewed operation registry; never arbitrary queries. */
  readPage<T>(
    operation: ReadOperation,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ReadPage<T>>;

  /** Convenience method to read a single resource endpoint (e.g. GET /orgs/{org}). */
  readSingle<T>(
    operation: ReadOperation,
    signal: AbortSignal,
  ): Promise<{ data: T; observedAt: string; status: number }>;

  /** Convenience method to exhaust all pages up to an optional safety limit. */
  fetchAll<T>(
    operation: ReadOperation,
    signal: AbortSignal,
    maxPages?: number,
  ): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
    reason?: string;
  }>;
}
