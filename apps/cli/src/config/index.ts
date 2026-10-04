import { readFileSync } from 'node:fs';

/**
 * Configuration and credential management.
 * In accordance with SEC-CRED-001, tokens and private keys must never be logged, printed, or exported.
 */

export interface GitHubAppConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly installationId: string;
}

export interface CliConfig {
  readonly token?: string | undefined;
  readonly app?: GitHubAppConfig | undefined;
  readonly baseUrl: string;
  readonly apiVersion: string;
}

export interface CliConfigOptions {
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
}

export function loadConfig(options?: CliConfigOptions): CliConfig {
  const token = process.env.GHEC_TOKEN?.trim() || undefined;
  const baseUrl = process.env.GHEC_BASE_URL?.trim() || 'https://api.github.com';
  const apiVersion = process.env.GHEC_API_VERSION?.trim() || '2026-03-10';

  const appId = options?.appId || process.env.GHEC_APP_ID?.trim() || undefined;
  const installationId =
    options?.installationId ||
    process.env.GHEC_APP_INSTALLATION_ID?.trim() ||
    undefined;

  let privateKey: string | undefined;
  const keyPath =
    options?.privateKeyPath || process.env.GHEC_APP_PRIVATE_KEY_PATH?.trim();

  if (keyPath) {
    try {
      privateKey = readFileSync(keyPath, 'utf8').trim();
    } catch (err) {
      throw new Error(
        `Failed to read GitHub App private key from "${keyPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  } else if (process.env.GHEC_APP_PRIVATE_KEY) {
    privateKey = process.env.GHEC_APP_PRIVATE_KEY.trim();
  }

  let app: GitHubAppConfig | undefined;
  if (appId || privateKey || installationId) {
    if (!appId || !privateKey || !installationId) {
      throw new Error(
        'Incomplete GitHub App configuration: App ID, Private Key, and Installation ID are all required.',
      );
    }
    app = {
      appId,
      privateKey,
      installationId,
    };
  }

  return {
    token,
    app,
    baseUrl,
    apiVersion,
  };
}

/** Redacts potential token, JWT, and private key patterns from any diagnostic string. */
export function sanitizeDiagnostics(message: string): string {
  return message
    .replace(
      /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]',
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      '[REDACTED_JWT]',
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,255}|ghs_[A-Za-z0-9_]{20,255})\b/g,
      '[REDACTED_TOKEN]',
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9_.-]{16,}\b/gi, '$1[REDACTED_TOKEN]')
    .replace(/\b(token\s+)[A-Za-z0-9_.-]{16,}\b/gi, '$1[REDACTED_TOKEN]');
}
