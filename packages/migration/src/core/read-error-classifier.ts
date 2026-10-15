import { sanitizeDiagnostics } from '@ghec/github-client';

export const VERIFY_READ_ERROR_PREFIX = '[VERIFY_READ_ERROR]' as const;

/**
 * Extracts an HTTP status code from a thrown error or message if present.
 */
export function extractErrorHttpStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    for (const key of ['status', 'httpStatus', 'statusCode']) {
      const val = obj[key];
      if (typeof val === 'number' && val >= 100 && val <= 599) {
        return val;
      }
    }
  }
  const msg = (
    error instanceof Error ? error.message : String(error ?? '')
  ).slice(0, 1024);
  const match = msg.match(
    /\b(?:HTTP|status(?:\s+code)?)(?:\s*:\s*|\s+)([1-5]\d{2})\b/i,
  );
  if (match?.[1]) {
    return Number.parseInt(match[1], 10);
  }
  if (/\b404\b/.test(msg) && /not found/i.test(msg)) {
    return 404;
  }
  if (/\b410\b/.test(msg)) {
    return 410;
  }
  return undefined;
}

/**
 * Determines whether an error thrown while querying an optional GitHub sub-resource
 * endpoint represents an expected feature-disabled / absent state (HTTP 404/410)
 * as opposed to an unexpected API, auth, rate-limit, or network failure.
 */
export function isExpectedFeatureAbsentError(error: unknown): boolean {
  const status = extractErrorHttpStatus(error);
  if (status !== undefined) {
    return status === 404 || status === 410;
  }

  const msg = (
    error instanceof Error ? error.message : String(error ?? '')
  ).toLowerCase();

  if (
    msg.includes('rate limit') ||
    msg.includes('secondary rate') ||
    msg.includes('abuse detection') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('bad credentials') ||
    msg.includes('internal server error') ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('socket hang up') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    /\b(401|403|429|500|502|503|504)\b/.test(msg)
  ) {
    return false;
  }

  if (
    msg.includes('not found') ||
    msg.includes('404') ||
    msg.includes('410') ||
    msg.includes('disabled') ||
    msg.includes('not enabled')
  ) {
    return true;
  }

  return false;
}

/**
 * Formats a sanitized diagnostic string for a read failure (DEC-004 compliant).
 * Supports both `formatSanitizedReadError(contextLabel, error)` and `formatSanitizedReadError(error)`.
 */
export function formatSanitizedReadError(
  contextOrError: unknown,
  maybeError?: unknown,
): string {
  const hasContext =
    maybeError !== undefined && typeof contextOrError === 'string';
  const contextLabel = hasContext ? contextOrError : undefined;
  const error = hasContext ? maybeError : contextOrError;

  const rawMessage =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const status = extractErrorHttpStatus(error);
  const statusPrefix =
    status !== undefined && !rawMessage.includes(String(status))
      ? `HTTP ${status}: `
      : '';
  const sanitized = sanitizeDiagnostics(`${statusPrefix}${rawMessage}`);
  return contextLabel
    ? `${sanitizeDiagnostics(contextLabel)}: ${sanitized}`
    : sanitized;
}
