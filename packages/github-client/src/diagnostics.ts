/** Redacts potential token, JWT, and private key patterns from any diagnostic string. */
export function sanitizeDiagnostics(message: string): string {
  return message
    .replace(
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----(?:(?!-----BEGIN)[\s\S])*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]',
    )
    .replace(
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
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
    .replace(/\b(token\s+)[A-Za-z0-9_.-]{16,}\b/gi, '$1[REDACTED_TOKEN]')
    .replace(/(https?:\/\/)[^\s/@]+@/g, '$1***@');
}
