import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Entity } from '@ghec/contracts';

export const REDACTED_SECRET_PATTERN = '[REDACTED_SECRET_PATTERN]';

export const SECRET_PATTERNS: readonly RegExp[] = [
  // GitHub Personal Access Tokens (classic and fine-grained)
  /ghp_[A-Za-z0-9_]{36,}/g,
  /github_pat_[A-Za-z0-9_]{82,}/g,
  // GitHub App Server/User-to-Server tokens
  /ghs_[A-Za-z0-9_]{36,}/g,
  /ghu_[A-Za-z0-9_]{36,}/g,
  // Private keys (RSA, OpenSSH, EC, DSA, PKCS8)
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
  // Webhook secrets and authorization headers
  /(?:bearer\s+|authorization:\s*(?:bearer\s*)?)[A-Za-z0-9_.-]{20,}/gi,
  /(?:webhook_secret|token|password|auth_token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
];

/**
 * Generate a cryptographically random 32-byte hexadecimal salt.
 */
export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Computes the SHA-256 digest of an operator salt for public bundle configuration recording.
 */
export function computeSaltDigest(salt: string): string {
  return createHash('sha256').update(salt).digest('hex');
}

/**
 * Pseudonymizes a GitHub username using HMAC-SHA256 with an operator salt.
 * Result format: "usr_" + HMAC-SHA256(salt, username).slice(0, 16)
 */
export function pseudonymizeUsername(salt: string, username: string): string {
  const hmac = createHmac('sha256', salt)
    .update(username)
    .digest('hex')
    .slice(0, 16);
  return `usr_${hmac}`;
}

/**
 * Scans a string for known secret token patterns and replaces them with [REDACTED_SECRET_PATTERN].
 */
export function redactSecretsInString(text: string): {
  sanitized: string;
  secretDetected: boolean;
} {
  let sanitized = text;
  let secretDetected = false;

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(sanitized)) {
      secretDetected = true;
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, REDACTED_SECRET_PATTERN);
    }
  }

  return { sanitized, secretDetected };
}

/**
 * Recursively scans all string properties of an entity or object, redacting detected secret patterns.
 * Also strips unauthorized PII fields (email, bio, avatar, socialProfiles) on identity entities.
 */
export function screenAndRedactSecrets(entity: Entity): {
  redactedEntity: Entity;
  secretDetected: boolean;
} {
  let detected = false;

  function traverse(value: unknown): unknown {
    if (typeof value === 'string') {
      const { sanitized, secretDetected } = redactSecretsInString(value);
      if (secretDetected) {
        detected = true;
      }
      return sanitized;
    }
    if (Array.isArray(value)) {
      return value.map(traverse);
    }
    if (value !== null && typeof value === 'object') {
      const copy: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        // Strip PII fields if present
        if (
          key === 'email' ||
          key === 'bio' ||
          key === 'avatarUrl' ||
          key === 'avatar_url' ||
          key === 'socialProfiles'
        ) {
          continue;
        }
        copy[key] = traverse(val);
      }
      return copy;
    }
    return value;
  }

  const redactedEntity = traverse(entity) as Entity;
  return { redactedEntity, secretDetected: detected };
}
