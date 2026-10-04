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

export function webhookPayload(
  hook: WebhookDefinition,
  secret?: string,
): Record<string, unknown> {
  return {
    active: hook.active,
    events: hook.events,
    config: {
      url: hook.url,
      content_type: hook.contentType,
      insecure_ssl: hook.insecureSsl ? '1' : '0',
      ...(secret === undefined ? {} : { secret }),
    },
  };
}
