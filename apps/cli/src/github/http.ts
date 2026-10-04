import { Octokit } from 'octokit';
import { sanitizeDiagnostics } from '../config/index.js';
import type { TokenProvider } from './auth.js';
import type {
  EndpointProbeResult,
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from './adapter.js';

export interface HttpAdapterOptions {
  token?: string | undefined;
  authProvider?: TokenProvider | undefined;
  rateLimiter?: AdaptiveRateLimiter | undefined;
  baseUrl?: string | undefined;
  apiVersion?: string | undefined;
  maxAttempts?: number | undefined;
  maxRetrySeconds?: number | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof globalThis.fetch | undefined;
}

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

export class AdaptiveRateLimiter {
  private graphqlLimit: RateLimitStatus = {
    remaining: 5000,
    resetAt: 0,
  };
  private restLimit: RateLimitStatus = {
    remaining: 5000,
    resetAt: 0,
  };
  private lastRequestTime = 0;
  private queue: Promise<void> = Promise.resolve();

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
  ): void {
    if (typeof remaining === 'number') {
      this.restLimit.remaining = remaining;
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

    // Critical pause threshold: remaining < 100
    if (status.remaining < 100 && status.resetAt > Date.now()) {
      const waitTimeMs = Math.max(0, status.resetAt - Date.now()) + 1000;
      if (waitTimeMs > 0) {
        const resetIso = new Date(status.resetAt).toISOString();
        console.warn(
          `[rate-limit] ${type.toUpperCase()} quota critically low (${status.remaining} remaining). Pausing execution for ${Math.ceil(
            waitTimeMs / 1000,
          )}s until quota reset at ${resetIso}...`,
        );
        await sleep(waitTimeMs, signal);
        // Reset remaining estimate after reset window has passed
        status.remaining = 5000;
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

function parseLinkHeader(header: string | null | undefined): {
  next?: string;
  last?: string;
} {
  if (!header) return {};
  const links: { next?: string; last?: string } = {};
  const parts = header.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      const [, url, rel] = match;
      if (url && (rel === 'next' || rel === 'last')) {
        links[rel] = url;
      }
    }
  }
  return links;
}

function resolvePath(
  template: string,
  params?: Readonly<Record<string, string>>,
): string {
  let resolved = template;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(
        new RegExp(`\\{${key}\\}`, 'g'),
        encodeURIComponent(value),
      );
    }
  }
  return resolved;
}

export class HttpGitHubReadAdapter implements GitHubReadAdapter {
  private readonly octokit: Octokit;
  private readonly maxAttempts: number;
  private readonly maxRetrySeconds: number;
  private readonly authProvider?: TokenProvider | undefined;
  private readonly rateLimiter: AdaptiveRateLimiter;

  constructor(options: HttpAdapterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 4;
    this.maxRetrySeconds = options.maxRetrySeconds ?? 300;
    this.authProvider = options.authProvider;
    this.rateLimiter = options.rateLimiter ?? new AdaptiveRateLimiter();
    const baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(
      /\/$/,
      '',
    );
    const apiVersion = options.apiVersion ?? '2026-03-10';

    this.octokit = new Octokit({
      auth: options.token,
      baseUrl,
      userAgent: 'ghec-consultant-cli/0.1.0',
      request: {
        timeout: options.timeoutMs ?? 30_000,
        fetch: options.fetchImpl,
        headers: {
          'X-GitHub-Api-Version': apiVersion,
          Accept: 'application/vnd.github+json',
        },
      },
      throttle: {
        onRateLimit: (
          retryAfter: number,
          requestOptions: { method: string; url: string },
          _octokit: unknown,
          retryCount: number,
        ) => {
          console.warn(
            `[rate-limit] Primary rate limit hit on ${requestOptions.method} ${requestOptions.url}. Retry after ${retryAfter}s (attempt ${retryCount + 1}/${this.maxAttempts}).`,
          );
          if (
            retryAfter > this.maxRetrySeconds ||
            retryCount >= this.maxAttempts
          ) {
            return false;
          }
          return true;
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          requestOptions: { method: string; url: string },
          _octokit: unknown,
          retryCount: number,
        ) => {
          console.warn(
            `[rate-limit] Secondary rate limit hit on ${requestOptions.method} ${requestOptions.url}. Retry after ${retryAfter}s (attempt ${retryCount + 1}/${this.maxAttempts}).`,
          );
          if (
            retryAfter > this.maxRetrySeconds ||
            retryCount >= this.maxAttempts
          ) {
            return false;
          }
          return true;
        },
      },
      retry: {
        doNotRetry: [400, 401, 403, 404, 410, 422, 451],
        maxRetries: this.maxAttempts,
      },
    });

    if (this.authProvider) {
      this.octokit.hook.wrap('request', async (request, requestOptions) => {
        const token = await this.authProvider!.getToken(
          requestOptions.request?.signal,
        );
        requestOptions.headers = {
          ...requestOptions.headers,
          authorization: `Bearer ${token}`,
        };
        return request(requestOptions);
      });
    }
  }

  getAuthProvider(): TokenProvider | undefined {
    return this.authProvider;
  }

  getRateLimiter(): AdaptiveRateLimiter {
    return this.rateLimiter;
  }

  async queryGraphQL<T>(
    query: string,
    variables: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<GraphQLResponse<T>> {
    if (signal.aborted) {
      throw signal.reason ?? new Error('Aborted');
    }
    const release = await this.rateLimiter.acquire('graphql', signal);
    const observedAt = new Date().toISOString();

    try {
      const response = await this.octokit.request('POST /graphql', {
        query,
        variables,
        request: { signal },
      });

      const body = response.data as {
        data?: T;
        errors?: Array<{ message?: string }>;
      };

      if (body.errors && body.errors.length > 0 && !body.data) {
        const messages = body.errors
          .map((e) => e.message ?? 'Unknown GraphQL error')
          .join('; ');
        throw new Error(
          sanitizeDiagnostics(`GraphQL query failed: ${messages}`),
        );
      }

      const data = (body.data ?? {}) as T;
      const rateLimitData = (
        data as unknown as {
          rateLimit?: { cost?: number; remaining?: number; resetAt?: string };
        }
      ).rateLimit;

      const headerRemaining = response.headers['x-ratelimit-remaining']
        ? parseInt(String(response.headers['x-ratelimit-remaining']), 10)
        : undefined;
      const headerReset = response.headers['x-ratelimit-reset']
        ? new Date(
            parseInt(String(response.headers['x-ratelimit-reset']), 10) * 1000,
          ).toISOString()
        : undefined;

      const remainingPoints = rateLimitData?.remaining ?? headerRemaining;
      const resetAt = rateLimitData?.resetAt ?? headerReset;
      this.rateLimiter.updateGraphQL(
        remainingPoints,
        resetAt,
        rateLimitData?.cost,
      );

      return {
        data,
        observedAt,
        cost: rateLimitData?.cost,
        remainingPoints,
        resetAt,
      };
    } catch (err: unknown) {
      if (signal.aborted) {
        throw signal.reason ?? new Error('Aborted');
      }
      if (
        err instanceof Error &&
        err.message.startsWith('GraphQL query failed:')
      ) {
        throw err;
      }
      const octoErr = err as {
        response?: { data?: { errors?: Array<{ message?: string }> } };
        message?: string;
      };
      if (octoErr.response?.data?.errors?.length) {
        const messages = octoErr.response.data.errors
          .map((e) => e.message ?? 'Unknown GraphQL error')
          .join('; ');
        throw new Error(
          sanitizeDiagnostics(`GraphQL query failed: ${messages}`),
          { cause: err },
        );
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new Error(sanitizeDiagnostics(`GraphQL query failed: ${rawMsg}`), {
        cause: err,
      });
    } finally {
      release();
    }
  }

  async readPage<T>(
    operation: ReadOperation,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ReadPage<T>> {
    if (signal.aborted) {
      throw signal.reason ?? new Error('Aborted');
    }
    const release = await this.rateLimiter.acquire('rest', signal);
    const observedAt = new Date().toISOString();

    try {
      let response: {
        status: number;
        data: unknown;
        headers: Record<string, string | number | undefined>;
      };

      if (cursor) {
        response = await this.octokit.request(cursor, {
          request: { signal },
        });
      } else {
        const path = resolvePath(
          operation.path ??
            `/${operation.id.replace(/^rest\./, '').replace(/\./g, '/')}`,
          operation.pathParams,
        );
        const queryParams = operation.queryParams ?? {};
        response = await this.octokit.request(`GET ${path}`, {
          ...queryParams,
          request: { signal },
        });
      }

      const remainingRequests = response.headers['x-ratelimit-remaining']
        ? parseInt(String(response.headers['x-ratelimit-remaining']), 10)
        : null;
      const resetAt = response.headers['x-ratelimit-reset']
        ? new Date(
            parseInt(String(response.headers['x-ratelimit-reset']), 10) * 1000,
          ).toISOString()
        : null;

      this.rateLimiter.updateREST(
        remainingRequests ?? undefined,
        resetAt ?? undefined,
      );

      const linkHeader =
        typeof response.headers['link'] === 'string'
          ? response.headers['link']
          : null;
      const links = parseLinkHeader(linkHeader);
      const nextCursor = links.next ?? null;
      const body = response.data;
      const items = Array.isArray(body) ? (body as T[]) : [body as T];

      return {
        items,
        nextCursor,
        observedAt,
        remainingRequests,
        resetAt,
        status: response.status,
      };
    } catch (err: unknown) {
      if (signal.aborted) {
        throw signal.reason ?? new Error('Aborted');
      }
      if (typeof err === 'object' && err !== null && 'status' in err) {
        const status = Number((err as { status: unknown }).status) || 500;
        const headers =
          (
            err as {
              response?: { headers?: Record<string, string | undefined> };
            }
          ).response?.headers ?? {};
        const remainingRequests = headers['x-ratelimit-remaining']
          ? parseInt(String(headers['x-ratelimit-remaining']), 10)
          : null;
        const resetAt = headers['x-ratelimit-reset']
          ? new Date(
              parseInt(String(headers['x-ratelimit-reset']), 10) * 1000,
            ).toISOString()
          : null;

        this.rateLimiter.updateREST(
          remainingRequests ?? undefined,
          resetAt ?? undefined,
        );

        return {
          items: [],
          nextCursor: null,
          observedAt,
          remainingRequests,
          resetAt,
          status,
        };
      }
      throw err;
    } finally {
      release();
    }
  }

  async readSingle<T>(
    operation: ReadOperation,
    signal: AbortSignal,
  ): Promise<{ data: T; observedAt: string; status: number }> {
    const page = await this.readPage<T>(operation, null, signal);
    return {
      data: page.items[0] as T,
      observedAt: page.observedAt,
      status: page.status,
    };
  }

  async fetchAll<T>(
    operation: ReadOperation,
    signal: AbortSignal,
    maxPages = 100,
  ): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
    reason?: string;
  }> {
    const allItems: T[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    let lastObservedAt: string;

    do {
      pageCount++;
      const page: ReadPage<T> = await this.readPage<T>(
        operation,
        cursor,
        signal,
      );
      lastObservedAt = page.observedAt;

      if (page.status >= 400) {
        return {
          items: allItems,
          observedAt: lastObservedAt,
          complete: false,
          reason: `HTTP ${page.status} on page ${pageCount}`,
        };
      }

      allItems.push(...page.items);
      cursor = page.nextCursor;

      if (pageCount >= maxPages && cursor) {
        return {
          items: allItems,
          observedAt: lastObservedAt,
          complete: false,
          reason: `Exceeded maximum page budget (${maxPages})`,
        };
      }
    } while (cursor && !signal.aborted);

    return {
      items: allItems,
      observedAt: lastObservedAt,
      complete: true,
    };
  }

  async probeEndpoint(
    path: string,
    signal: AbortSignal,
  ): Promise<EndpointProbeResult> {
    if (signal.aborted) {
      throw signal.reason ?? new Error('Aborted');
    }
    const release = await this.rateLimiter.acquire('rest', signal);
    try {
      const response = await this.octokit.request(`GET ${path}`, {
        request: { signal },
      });

      const scopesHeader = response.headers['x-oauth-scopes'];
      const acceptedScopesHeader = response.headers['x-accepted-oauth-scopes'];
      const ssoHeader = response.headers['x-github-sso'];

      const oauthScopes =
        typeof scopesHeader === 'string'
          ? scopesHeader
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const acceptedOAuthScopes =
        typeof acceptedScopesHeader === 'string'
          ? acceptedScopesHeader
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      let ssoRequired = false;
      let ssoUrl: string | undefined;
      if (typeof ssoHeader === 'string') {
        ssoRequired = ssoHeader.includes('required');
        const match = ssoHeader.match(/url=([^;]+)/);
        if (match) ssoUrl = match[1];
      }

      return {
        status: response.status,
        oauthScopes,
        acceptedOAuthScopes,
        ssoRequired,
        ssoUrl,
      };
    } catch (err: unknown) {
      if (signal.aborted) {
        throw signal.reason ?? new Error('Aborted');
      }

      if (typeof err === 'object' && err !== null && 'status' in err) {
        const httpError = err as {
          status: number;
          message?: string;
          response?: {
            headers?: Record<string, string | undefined>;
            data?: { message?: string };
          };
        };

        const headers = httpError.response?.headers ?? {};
        const scopesHeader = headers['x-oauth-scopes'];
        const acceptedScopesHeader = headers['x-accepted-oauth-scopes'];
        const ssoHeader = headers['x-github-sso'];

        const oauthScopes =
          typeof scopesHeader === 'string'
            ? scopesHeader
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;

        const acceptedOAuthScopes =
          typeof acceptedScopesHeader === 'string'
            ? acceptedScopesHeader
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;

        let ssoRequired = false;
        let ssoUrl: string | undefined;
        if (typeof ssoHeader === 'string') {
          ssoRequired = ssoHeader.includes('required');
          const match = ssoHeader.match(/url=([^;]+)/);
          if (match) ssoUrl = match[1];
        }

        const msg = httpError.response?.data?.message ?? httpError.message;

        return {
          status: httpError.status,
          oauthScopes,
          acceptedOAuthScopes,
          ssoRequired,
          ssoUrl,
          message: msg,
        };
      }

      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 500,
        message: msg,
      };
    } finally {
      release();
    }
  }
}
