import type { WebhookDefinition } from './types.js';

export type WebhookReconciliationActionType =
  'RE_ENABLE_AND_RESECRET' | 'CREATE_MISSING' | 'NOOP';

export interface WebhookReconciliationDecision {
  readonly action: WebhookReconciliationActionType;
  readonly targetHookId?: number | undefined;
  readonly payload: Record<string, unknown>;
  readonly reason: string;
}

/**
 * Reconciles source webhooks against post-GEI destination state per DEC-014.
 *
 * GEI automatically transfers active webhooks into a disabled state on the target.
 * Rather than blindly attempting POST (which creates duplicate endpoints), this reconciliation
 * identifies target hooks matching by payload URL, rehydrates secret tokens from vault/env,
 * and activates the hook via PATCH.
 */
export function reconcileWebhookState(
  source: WebhookDefinition,
  target?: WebhookDefinition,
  vaultSecret?: string,
): WebhookReconciliationDecision {
  if (!target) {
    return {
      action: 'CREATE_MISSING',
      payload: {
        name: 'web',
        active: source.active,
        events: source.events,
        config: {
          url: source.url,
          content_type: source.contentType,
          insecure_ssl: source.insecureSsl ? '1' : '0',
          ...(vaultSecret ? { secret: vaultSecret } : {}),
        },
      },
      reason: 'Webhook does not exist at destination; creating new webhook.',
    };
  }

  // Target exists. If target is inactive (the GEI default), re-enable and update secret.
  if (!target.active || vaultSecret !== undefined) {
    return {
      action: 'RE_ENABLE_AND_RESECRET',
      targetHookId: target.id,
      payload: {
        active: true,
        events: source.events,
        config: {
          url: source.url,
          content_type: source.contentType,
          insecure_ssl: source.insecureSsl ? '1' : '0',
          ...(vaultSecret ? { secret: vaultSecret } : {}),
        },
      },
      reason:
        'Target webhook was migrated by GEI in disabled state or requires secret rehydration; enabling and securing.',
    };
  }

  return {
    action: 'NOOP',
    targetHookId: target.id,
    payload: {},
    reason: 'Target webhook is already active with matching configuration.',
  };
}
