/**
 * Configuration and credential management.
 * In accordance with SEC-CRED-001, tokens must never be logged, printed, or exported.
 */

export interface CliConfig {
  readonly token?: string | undefined;
  readonly baseUrl: string;
  readonly apiVersion: string;
}

export function loadConfig(): CliConfig {
  const token = process.env.GHEC_TOKEN?.trim() || undefined;
  const baseUrl = process.env.GHEC_BASE_URL?.trim() || 'https://api.github.com';
  const apiVersion = process.env.GHEC_API_VERSION?.trim() || '2026-03-10';

  return {
    token,
    baseUrl,
    apiVersion,
  };
}

/** Redacts potential token patterns from any diagnostic string. */
export function sanitizeDiagnostics(message: string): string {
  return message
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,255}|ghs_[A-Za-z0-9_]{20,255})\b/g,
      '[REDACTED_TOKEN]',
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9_.-]{16,}\b/gi, '$1[REDACTED_TOKEN]')
    .replace(/\b(token\s+)[A-Za-z0-9_.-]{16,}\b/gi, '$1[REDACTED_TOKEN]');
}
