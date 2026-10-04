import { createSign } from 'node:crypto';
import type { GitHubAppConfig } from '../config/index.js';
import { sanitizeDiagnostics } from '../config/index.js';

export interface TokenProvider {
  getToken(signal?: AbortSignal): Promise<string>;
  getInstallationInfo?(): { appId: string; installationId: string };
  getPermissions?(): Record<string, string> | undefined;
}

/**
 * Generates an RS256 JWT for GitHub App authentication using native node:crypto.
 * Sets standard iat (-60s drift tolerance) and exp (+10m maximum).
 * Never logs or echoes the private key.
 */
export function createGitHubAppJwt(
  appId: string,
  privateKeyPem: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iat: now - 60,
    exp: now + 10 * 60,
    iss: appId,
  };

  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  try {
    const sign = createSign('RSA-SHA256');
    sign.update(unsignedToken);
    sign.end();
    const signature = sign.sign(privateKeyPem, 'base64url');
    return `${unsignedToken}.${signature}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to sign GitHub App JWT: ${sanitizeDiagnostics(msg)}`,
      { cause: err },
    );
  }
}

export class GitHubAppAuthProvider implements TokenProvider {
  private readonly config: GitHubAppConfig;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  private cachedToken: string | null = null;
  private cachedExpiresAt: number | null = null;
  private cachedPermissions: Record<string, string> | undefined = undefined;

  constructor(
    config: GitHubAppConfig,
    options?: {
      baseUrl?: string;
      fetchImpl?: typeof globalThis.fetch;
    },
  ) {
    this.config = config;
    this.baseUrl = (options?.baseUrl || 'https://api.github.com').replace(
      /\/$/,
      '',
    );
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  }

  getInstallationInfo(): { appId: string; installationId: string } {
    return {
      appId: this.config.appId,
      installationId: this.config.installationId,
    };
  }

  /**
   * Returns a valid installation access token.
   * If cached token has less than 5 minutes of lifetime remaining, automatically refreshes it.
   */
  async getToken(signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Aborted');
    }

    const fiveMinutesMs = 5 * 60 * 1000;
    if (
      this.cachedToken &&
      this.cachedExpiresAt &&
      Date.now() < this.cachedExpiresAt - fiveMinutesMs
    ) {
      return this.cachedToken;
    }

    return this.refreshAccessToken(signal);
  }

  private async refreshAccessToken(signal?: AbortSignal): Promise<string> {
    const jwt = createGitHubAppJwt(this.config.appId, this.config.privateKey);
    const tokenUrl = `${this.baseUrl}/app/installations/${encodeURIComponent(this.config.installationId)}/access_tokens`;

    try {
      const response = await this.fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        ...(signal ? { signal } : {}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedMessage = errorText;
        try {
          const parsed = JSON.parse(errorText) as { message?: string };
          if (parsed.message) parsedMessage = parsed.message;
        } catch {
          // Keep raw text
        }
        throw new Error(
          sanitizeDiagnostics(
            `GitHub App installation token exchange failed (HTTP ${response.status}): ${parsedMessage}`,
          ),
        );
      }

      const body = (await response.json()) as {
        token: string;
        expires_at: string;
        permissions?: Record<string, string>;
      };

      if (!body.token || !body.expires_at) {
        throw new Error(
          'GitHub App access token response missing token or expires_at.',
        );
      }

      this.cachedToken = body.token;
      this.cachedExpiresAt = Date.parse(body.expires_at);
      this.cachedPermissions = body.permissions;

      return this.cachedToken;
    } catch (err) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Aborted');
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        sanitizeDiagnostics(`Failed to authenticate as GitHub App: ${rawMsg}`),
        { cause: err },
      );
    }
  }

  getPermissions(): Record<string, string> | undefined {
    return this.cachedPermissions;
  }
}
