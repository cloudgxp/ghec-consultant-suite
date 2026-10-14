import { Buffer } from 'node:buffer';
import sodium from 'libsodium-wrappers';
import {
  AdaptiveRateLimiter,
  sanitizeDiagnostics,
  sleep,
} from '@ghec/github-client';

export interface SeederClientOptions {
  readonly token?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly fetchImpl?: typeof globalThis.fetch | undefined;
  readonly maxRetries?: number | undefined;
  readonly logger?: ((message: string) => void) | undefined;
}

export interface ApiResponse<T = unknown> {
  readonly status: number;
  readonly ok: boolean;
  readonly data: T;
  readonly headers: Headers;
}

export class SeederGitHubClient {
  private readonly token?: string | undefined;
  private readonly baseUrl: string;
  private readonly dryRun: boolean;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly maxRetries: number;
  private readonly rateLimiter: AdaptiveRateLimiter;
  private readonly logger?: ((message: string) => void) | undefined;

  constructor(options: SeederClientOptions = {}) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(
      /\/+$/,
      '',
    );
    this.dryRun = Boolean(options.dryRun);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 5;
    this.rateLimiter = new AdaptiveRateLimiter({ label: 'seeder' });
    this.logger = options.logger;
  }

  isDryRun(): boolean {
    return this.dryRun;
  }

  getRateLimiter(): AdaptiveRateLimiter {
    return this.rateLimiter;
  }

  async request<T = unknown>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<ApiResponse<T>> {
    const method = options.method ?? 'GET';
    const isMutation = method !== 'GET';

    if (this.dryRun && isMutation) {
      if (this.logger) {
        this.logger(
          `[DRY-RUN] Intercepted mutating request: ${method} ${path}`,
        );
      }
      return {
        status: 200,
        ok: true,
        data: { dryRun: true } as unknown as T,
        headers: new Headers(),
      };
    }

    const url = path.startsWith('http')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const baseHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ghec-consultant-suite-seeder',
      ...(options.headers ?? {}),
    };

    if (this.token) {
      baseHeaders.Authorization = `Bearer ${this.token}`;
    }

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      const release = await this.rateLimiter.acquire('rest');

      const reqInit: RequestInit = {
        method,
        headers: baseHeaders,
      };

      if (options.body !== undefined && isMutation) {
        if (
          typeof options.body === 'string' ||
          options.body instanceof Uint8Array ||
          options.body instanceof Buffer
        ) {
          reqInit.body = options.body as unknown as BodyInit;
        } else {
          baseHeaders['Content-Type'] = 'application/json';
          reqInit.body = JSON.stringify(options.body);
        }
      }

      try {
        const response = await this.fetchImpl(url, reqInit);

        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');
        const limit = response.headers.get('x-ratelimit-limit');
        if (remaining !== null || reset !== null || limit !== null) {
          this.rateLimiter.updateREST(
            remaining ? Number.parseInt(remaining, 10) : undefined,
            reset ? Number.parseInt(reset, 10) : undefined,
            limit ? Number.parseInt(limit, 10) : undefined,
          );
        }

        const isRateLimit =
          response.status === 429 ||
          (response.status === 403 &&
            (remaining === '0' ||
              response.headers.get('retry-after') !== null ||
              (await response.clone().text())
                .toLowerCase()
                .includes('secondary rate limit')));

        if (isRateLimit && attempt < this.maxRetries) {
          attempt++;
          const retryAfterSec = response.headers.get('retry-after');
          let delayMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
          if (retryAfterSec) {
            delayMs = Math.max(
              delayMs,
              Number.parseInt(retryAfterSec, 10) * 1000,
            );
          }
          if (this.logger) {
            this.logger(
              sanitizeDiagnostics(
                `Rate limited on ${method} ${path} (status ${response.status}). Retrying in ${Math.round(delayMs)}ms (attempt ${attempt}/${this.maxRetries})...`,
              ),
            );
          }
          await sleep(delayMs);
          continue;
        }

        let responseData: unknown;
        const text = await response.text();
        try {
          responseData = text ? JSON.parse(text) : null;
        } catch {
          responseData = text;
        }

        return {
          status: response.status,
          ok: response.ok,
          data: responseData as T,
          headers: response.headers,
        };
      } catch (err: unknown) {
        if (attempt >= this.maxRetries) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            sanitizeDiagnostics(
              `Network error during ${method} ${path}: ${msg}`,
            ),
            {
              cause: err,
            },
          );
        }
        attempt++;
        const backoffMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(backoffMs);
      } finally {
        release();
      }
    }

    throw new Error(
      sanitizeDiagnostics(
        `Exceeded max retries (${this.maxRetries}) for ${method} ${path}`,
      ),
    );
  }
}

/**
 * Encrypts a plaintext secret using libsodium sealed-box against a base64 public key.
 * Used for GitHub Actions repository and organization secrets (DEC-004 compliant).
 */
export async function encryptSecret(
  secretValue: string,
  publicKeyBase64: string,
): Promise<string> {
  await sodium.ready;
  const messageBytes = sodium.from_string(secretValue);
  const keyBytes = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}
