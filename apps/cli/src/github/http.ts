import type { GitHubReadAdapter, ReadOperation, ReadPage } from './adapter.js';

export interface HttpAdapterOptions {
  token?: string | undefined;
  baseUrl?: string | undefined;
  apiVersion?: string | undefined;
  maxAttempts?: number | undefined;
  maxRetrySeconds?: number | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof globalThis.fetch | undefined;
}

function parseLinkHeader(header: string | null): {
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
  private readonly token?: string | undefined;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly maxAttempts: number;
  private readonly maxRetrySeconds: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: HttpAdapterOptions = {}) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(
      /\/$/,
      '',
    );
    this.apiVersion = options.apiVersion ?? '2026-03-10';
    this.maxAttempts = options.maxAttempts ?? 4;
    this.maxRetrySeconds = options.maxRetrySeconds ?? 300;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private async sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        return reject(signal.reason ?? new Error('Aborted'));
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error('Aborted'));
        },
        { once: true },
      );
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.apiVersion,
      'User-Agent': 'ghec-consultant-cli/0.1.0',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async executeRequest(
    url: string,
    signal: AbortSignal,
  ): Promise<Response> {
    let attempt = 0;
    const startTime = Date.now();

    while (attempt < this.maxAttempts) {
      attempt++;
      if (signal.aborted) {
        throw signal.reason ?? new Error('Aborted');
      }

      const timeoutController = new AbortController();
      const onParentAbort = () => timeoutController.abort(signal.reason);
      signal.addEventListener('abort', onParentAbort, { once: true });
      const timer = setTimeout(() => {
        timeoutController.abort(
          new Error(`Request timed out after ${this.timeoutMs}ms`),
        );
      }, this.timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: timeoutController.signal,
        });

        clearTimeout(timer);
        signal.removeEventListener('abort', onParentAbort);

        // Check if rate limited or server error
        if (
          response.status === 429 ||
          (response.status === 403 && response.headers.get('retry-after'))
        ) {
          const retryAfterSec = parseInt(
            response.headers.get('retry-after') ?? '60',
            10,
          );
          const elapsedSec = (Date.now() - startTime) / 1000;
          if (
            elapsedSec + retryAfterSec > this.maxRetrySeconds ||
            attempt >= this.maxAttempts
          ) {
            return response;
          }
          await this.sleep(retryAfterSec * 1000, signal);
          continue;
        }

        if (response.status >= 500 && attempt < this.maxAttempts) {
          const backoff = Math.min(
            this.maxRetrySeconds * 1000,
            (Math.pow(2, attempt) + Math.random()) * 1000,
          );
          await this.sleep(backoff, signal);
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timer);
        signal.removeEventListener('abort', onParentAbort);

        if (signal.aborted) {
          throw signal.reason ?? new Error('Aborted');
        }

        if (attempt >= this.maxAttempts) {
          throw err;
        }

        const backoff = (Math.pow(2, attempt) + Math.random()) * 1000;
        await this.sleep(backoff, signal);
      }
    }

    throw new Error(`Exceeded maximum request attempts (${this.maxAttempts})`);
  }

  async readPage<T>(
    operation: ReadOperation,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ReadPage<T>> {
    let url: string;
    if (cursor) {
      url = cursor;
    } else {
      const path = resolvePath(
        operation.path ??
          `/${operation.id.replace(/^rest\./, '').replace(/\./g, '/')}`,
        operation.pathParams,
      );
      const urlObj = new URL(
        `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
      );
      if (operation.queryParams) {
        for (const [key, value] of Object.entries(operation.queryParams)) {
          urlObj.searchParams.set(key, String(value));
        }
      }
      url = urlObj.toString();
    }

    const response = await this.executeRequest(url, signal);
    const observedAt = new Date().toISOString();
    const remainingRequests = response.headers.get('x-ratelimit-remaining')
      ? parseInt(response.headers.get('x-ratelimit-remaining')!, 10)
      : null;
    const resetAt = response.headers.get('x-ratelimit-reset')
      ? new Date(
          parseInt(response.headers.get('x-ratelimit-reset')!, 10) * 1000,
        ).toISOString()
      : null;

    if (!response.ok) {
      return {
        items: [],
        nextCursor: null,
        observedAt,
        remainingRequests,
        resetAt,
        status: response.status,
      };
    }

    const links = parseLinkHeader(response.headers.get('link'));
    const nextCursor = links.next ?? null;
    const body = await response.json();
    const items = Array.isArray(body) ? (body as T[]) : [body as T];

    return {
      items,
      nextCursor,
      observedAt,
      remainingRequests,
      resetAt,
      status: response.status,
    };
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
}
