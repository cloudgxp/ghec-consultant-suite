import { createHash } from 'node:crypto';

export interface NormalizedSshKey {
  readonly type: string;
  readonly base64: string;
  readonly comment?: string | undefined;
  readonly normalized: string;
  readonly fingerprint: string;
}

/**
 * Normalizes an SSH public key and calculates its standard OpenSSH SHA-256 fingerprint.
 */
export function normalizeSshKey(rawKey: string): NormalizedSshKey {
  const trimmed = rawKey.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    // Fallback if key string has no space delimiter
    const hash = createHash('sha256')
      .update(trimmed)
      .digest('base64')
      .replace(/=+$/, '');
    return {
      type: '',
      base64: trimmed,
      normalized: trimmed,
      fingerprint: `SHA256:${hash}`,
    };
  }

  const type = parts[0] ?? '';
  const base64 = parts[1] ?? '';
  const comment = parts.slice(2).join(' ') || undefined;

  let fingerprint: string;
  try {
    const keyBuffer = Buffer.from(base64, 'base64');
    const hash = createHash('sha256')
      .update(keyBuffer)
      .digest('base64')
      .replace(/=+$/, '');
    fingerprint = `SHA256:${hash}`;
  } catch {
    const hash = createHash('sha256')
      .update(base64)
      .digest('base64')
      .replace(/=+$/, '');
    fingerprint = `SHA256:${hash}`;
  }

  return {
    type,
    base64,
    comment,
    normalized: `${type} ${base64}`,
    fingerprint,
  };
}

/**
 * Compares two SSH public keys ignoring comments and whitespace differences.
 */
export function areSshKeysEqual(keyA: string, keyB: string): boolean {
  const normA = normalizeSshKey(keyA);
  const normB = normalizeSshKey(keyB);
  return (
    normA.normalized === normB.normalized ||
    normA.fingerprint === normB.fingerprint
  );
}
