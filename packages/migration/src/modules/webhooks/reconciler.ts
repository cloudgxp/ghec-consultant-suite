import type { WebhookDefinition } from './types.js';

export function hooksMatch(
  left: WebhookDefinition,
  right: WebhookDefinition,
): boolean {
  return (
    left.url === right.url &&
    [...left.events].sort().join(',') === [...right.events].sort().join(',')
  );
}

/**
 * Determines the safe `active` state for a migrated webhook on the target.
 * If the source webhook had an HMAC secret configured (`secretConfigured: true`)
 * and no replacement secret is supplied, the target webhook must be created/updated
 * as `active: false` so unverified/unsigned payloads are not delivered before the
 * customer configures their secret and activates the webhook.
 */
export function resolveTargetWebhookActive(
  hook: WebhookDefinition,
  hasReplacementSecret: boolean,
  sandboxRehearsal = false,
): boolean {
  if (sandboxRehearsal) return false;
  if (!hook.active) return false;
  if (hook.secretConfigured && !hasReplacementSecret) return false;
  return true;
}

export function webhookPayload(
  hook: WebhookDefinition,
  secret?: string,
  isCreate = false,
  sandboxRehearsal = false,
): Record<string, unknown> {
  const hasReplacementSecret = secret !== undefined && secret.length > 0;
  return {
    ...(isCreate ? { name: 'web' } : {}),
    active: resolveTargetWebhookActive(
      hook,
      hasReplacementSecret,
      sandboxRehearsal,
    ),
    events: hook.events,
    config: {
      url: hook.url,
      content_type: hook.contentType,
      insecure_ssl: hook.insecureSsl ? '1' : '0',
      ...(secret === undefined ? {} : { secret }),
    },
  };
}
