import {
  AdaptiveRateLimiter,
  sanitizeDiagnostics,
  type TokenProvider,
} from '@ghec/github-client';
import type { TargetWriteClient, TargetWriteOperation } from '../core/types.js';

export interface HttpTargetWriteClientOptions {
  readonly token?: string | undefined;
  readonly authProvider?: TokenProvider | undefined;
  readonly baseUrl?: string | undefined;
  readonly apiVersion?: string | undefined;
  readonly rateLimiter?: AdaptiveRateLimiter | undefined;
  readonly fetchImpl?: typeof globalThis.fetch | undefined;
}

export class HttpTargetWriteClient implements TargetWriteClient {
  private readonly token?: string | undefined;
  private readonly authProvider?: TokenProvider | undefined;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly rateLimiter: AdaptiveRateLimiter;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: HttpTargetWriteClientOptions = {}) {
    this.token = options.token;
    this.authProvider = options.authProvider;
    let base = (options.baseUrl ?? 'https://api.github.com').trim();
    while (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    this.baseUrl = base;
    this.apiVersion = options.apiVersion ?? '2026-03-10';
    this.rateLimiter =
      options.rateLimiter ??
      new AdaptiveRateLimiter({ label: 'target-writer' });
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async mutate<T = unknown>(
    operation: TargetWriteOperation,
    signal: AbortSignal,
  ): Promise<{ status: number; data?: T | undefined }> {
    if (signal.aborted) {
      throw signal.reason ?? new Error('Mutation aborted');
    }

    let urlPath = operation.path;
    if (operation.pathParams) {
      for (const [key, value] of Object.entries(operation.pathParams)) {
        urlPath = urlPath.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    const fullUrl = `${this.baseUrl}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;

    let authToken = this.token;
    if (!authToken && this.authProvider) {
      authToken = await this.authProvider.getToken(signal);
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': this.apiVersion,
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    if (operation.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const release = await this.rateLimiter.acquire('rest', signal);

    let res: Response;
    try {
      const requestInit: RequestInit = {
        method: operation.method,
        headers,
        signal,
      };
      if (operation.body !== undefined) {
        requestInit.body = JSON.stringify(operation.body);
      }
      res = await this.fetchImpl(fullUrl, requestInit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Mutation "${operation.id}" network error: ${sanitizeDiagnostics(msg)}`,
        { cause: err },
      );
    } finally {
      release();
    }

    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');

    this.rateLimiter.updateREST(
      remaining ? parseInt(remaining, 10) : undefined,
      reset ? parseInt(reset, 10) : undefined,
    );

    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore read error
      }
      const err = new Error(
        `Mutation "${operation.id}" failed with HTTP ${res.status}: ${sanitizeDiagnostics(bodyText)}`,
      );
      (err as unknown as { status: number }).status = res.status;
      (err as unknown as { bodyText: string }).bodyText = bodyText;
      throw err;
    }

    if (res.status === 204) {
      return { status: res.status, data: undefined };
    }

    const text = await res.text();
    if (!text.trim()) {
      return { status: res.status, data: undefined };
    }

    try {
      const data = JSON.parse(text) as T;
      return { status: res.status, data };
    } catch {
      return { status: res.status, data: undefined };
    }
  }
}
