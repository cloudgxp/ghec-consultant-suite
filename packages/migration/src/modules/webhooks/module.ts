import { MIGRATION_SCHEMA_VERSION } from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '../../core/types.js';
import {
  hooksMatch,
  resolveTargetWebhookActive,
  webhookPayload,
} from './reconciler.js';
import type {
  RawWebhook,
  WebhookDefinition,
  WebhooksData,
  WebhooksModuleOptions,
} from './types.js';

function pathFor(ctx: MigrationContext): string {
  return ctx.scope.level === 'organization'
    ? '/orgs/{org}/hooks'
    : '/repos/{owner}/{repo}/hooks';
}
function paramsFor(ctx: MigrationContext): Record<string, string> {
  return ctx.scope.level === 'organization'
    ? { org: ctx.scope.targetOrg }
    : {
        owner: ctx.scope.targetOrg,
        repo: ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '',
      };
}
function parse(raw: RawWebhook): WebhookDefinition | undefined {
  if (!raw.config?.url) return undefined;
  return {
    id: raw.id,
    url: raw.config.url,
    events: raw.events ?? [],
    active: raw.active ?? false,
    contentType: raw.config.content_type ?? 'json',
    insecureSsl: String(raw.config.insecure_ssl ?? '0') === '1',
    secretConfigured: Boolean(raw.config.secret),
  };
}

function extractHooks(data: unknown): readonly RawWebhook[] {
  if (Array.isArray(data)) return data as readonly RawWebhook[];
  if (
    data &&
    typeof data === 'object' &&
    'hooks' in data &&
    Array.isArray((data as { hooks: unknown }).hooks)
  ) {
    return (data as { hooks: readonly RawWebhook[] }).hooks;
  }
  return [];
}

export class WebhooksMigrationModule implements MigrationModule<WebhooksData> {
  readonly id: string = 'webhooks';
  readonly displayName: string =
    'Organization & Repository Webhooks Reconciliation';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];
  private readonly secretProvider: WebhooksModuleOptions['secretProvider'];
  constructor(options: WebhooksModuleOptions = {}) {
    this.secretProvider = options.secretProvider;
  }
  async discover(ctx: MigrationContext): Promise<WebhooksData> {
    const response = await ctx.sourceClient.readSingle<unknown>(
      {
        id: 'rest.webhooks.list',
        transport: 'rest',
        verifiedReadOnly: true,
        path: pathFor(ctx),
        pathParams:
          ctx.scope.level === 'organization'
            ? { org: ctx.scope.sourceOrg }
            : { owner: ctx.scope.sourceOrg, repo: ctx.scope.sourceRepo ?? '' },
      },
      ctx.signal,
    );
    if (response.status >= 400) {
      const error = new Error(
        `HTTP ${response.status} querying webhooks at ${pathFor(ctx)}`,
      );
      (error as unknown as { status: number }).status = response.status;
      throw error;
    }
    return {
      level: ctx.scope.level,
      hooks: extractHooks(response.data).flatMap((hook) => {
        const parsed = parse(hook);
        return parsed ? [parsed] : [];
      }),
    };
  }
  async plan(ctx: MigrationContext, source: WebhooksData): Promise<ModulePlan> {
    let rawHooks: readonly RawWebhook[];
    try {
      const response = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.webhooks.list',
          transport: 'rest',
          verifiedReadOnly: true,
          path: pathFor(ctx),
          pathParams: paramsFor(ctx),
        },
        ctx.signal,
      );
      rawHooks = response.status < 400 ? extractHooks(response.data) : [];
    } catch {
      rawHooks = [];
    }
    const target = rawHooks.flatMap((hook) => {
      const parsed = parse(hook);
      return parsed ? [parsed] : [];
    });
    const warnings: string[] = [];
    const targetKey =
      ctx.scope.level === 'organization'
        ? ctx.scope.targetOrg
        : `${ctx.scope.targetOrg}/${ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? ''}`;
    const hasSecretProvider = this.secretProvider !== undefined;
    const operations: PlannedOperation[] = source.hooks.map((hook) => {
      const existing = target.find((candidate) => hooksMatch(hook, candidate));
      const expectedActive = resolveTargetWebhookActive(
        hook,
        hasSecretProvider,
      );
      let operation: 'create' | 'update' | 'noop';
      if (!existing) {
        operation = 'create';
      } else {
        const needsSecretRehydration =
          hook.secretConfigured && hasSecretProvider;
        const configChanged =
          existing.active !== expectedActive ||
          existing.contentType !== hook.contentType ||
          existing.insecureSsl !== hook.insecureSsl;
        operation = configChanged || needsSecretRehydration ? 'update' : 'noop';
      }
      if (hook.secretConfigured && !hasSecretProvider)
        warnings.push(
          `Webhook \`${hook.url}\` has a source secret but no replacement secret provider; it will remain inactive (active: false) until the secret is configured.`,
        );
      const reason =
        operation === 'create'
          ? `Creating webhook for \`${hook.url}\`${hook.secretConfigured && !hasSecretProvider ? ' (inactive until HMAC secret is configured)' : ' (active; no signing secret configured on source)'}`
          : operation === 'update'
            ? `Reconciling webhook configuration for \`${hook.url}\`${hook.secretConfigured && !hasSecretProvider ? ' (inactive until HMAC secret is configured)' : ''}`
            : hook.secretConfigured && !hasSecretProvider
              ? `Webhook \`${hook.url}\` already matches target configuration (inactive until HMAC secret is configured)`
              : `Webhook \`${hook.url}\` already matches target configuration (active; no signing secret configured on source)`;
      return {
        id: `${this.id}:${targetKey}:${hook.url}`,
        resourceType: 'webhook',
        resourceName: hook.url,
        operation,
        reason,
        sourceState: hook,
        destinationCurrentState: existing,
        payload:
          operation === 'noop'
            ? undefined
            : { hookId: existing?.id, expectedActive },
      };
    });
    return {
      moduleId: this.id,
      scopeLevel: ctx.scope.level,
      targetIdentifier:
        ctx.scope.level === 'organization'
          ? ctx.scope.targetOrg
          : `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
      operations,
      warnings,
    };
  }
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const results: OperationExecutionResult[] = [];
    const startedAt = Date.now();
    if (!ctx.targetWriteClient && !ctx.dryRun)
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();
      const hook = op.sourceState as WebhookDefinition;
      if (op.operation === 'noop') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          reason: op.reason,
        });
        continue;
      }
      if (ctx.dryRun) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
          httpStatus: 200,
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          reason: op.reason,
        });
        continue;
      }
      const hookId = (op.payload as { hookId?: number } | undefined)?.hookId;
      const secret = await this.secretProvider?.getSecret({
        url: hook.url,
        sourceOrg: ctx.scope.sourceOrg,
        sourceRepo: ctx.scope.sourceRepo,
        targetOrg: ctx.scope.targetOrg,
        targetRepo: ctx.scope.targetRepo,
        signal: ctx.signal,
      });
      const response = await ctx.targetWriteClient!.mutate(
        {
          id: `rest.webhooks.${op.operation}`,
          method: op.operation === 'update' ? 'PATCH' : 'POST',
          path:
            op.operation === 'update'
              ? `${pathFor(ctx)}/{hook_id}`
              : pathFor(ctx),
          pathParams: {
            ...paramsFor(ctx),
            ...(hookId === undefined ? {} : { hook_id: String(hookId) }),
          },
          body: webhookPayload(hook, secret, op.operation === 'create'),
        },
        ctx.signal,
      );
      results.push({
        operationId: op.id,
        status:
          response.status >= 200 && response.status < 300
            ? 'succeeded'
            : 'failed',
        httpStatus: response.status,
        completedAt: new Date().toISOString(),
        resourceType: op.resourceType,
        resourceName: op.resourceName,
        operationType: op.operation,
        reason: op.reason,
      });
    }
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: results.some((result) => result.status === 'failed')
        ? 'failed'
        : results.length === 0
          ? 'skipped'
          : 'complete',
      results,
      durationMs: Date.now() - startedAt,
    };
  }
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const current = await this.discover({
      ...ctx,
      sourceClient: ctx.targetClient,
      scope: {
        level: ctx.scope.level,
        sourceOrg: ctx.scope.targetOrg,
        targetOrg: ctx.scope.targetOrg,
        ...(ctx.scope.targetRepo ? { sourceRepo: ctx.scope.targetRepo } : {}),
        ...(ctx.scope.targetRepo ? { targetRepo: ctx.scope.targetRepo } : {}),
      },
    });
    const discrepancies: VerificationDiscrepancy[] = [];
    const hasSecretProvider = this.secretProvider !== undefined;
    for (const op of plan.operations) {
      const expected = op.sourceState as WebhookDefinition;
      const expectedActive = resolveTargetWebhookActive(
        expected,
        hasSecretProvider,
      );
      const actual = current.hooks.find((hook) => hooksMatch(expected, hook));
      const activeMatches =
        actual !== undefined &&
        (actual.active === expectedActive || actual.active === expected.active);
      if (!actual || !activeMatches)
        discrepancies.push({
          resourceName: expected.url,
          expected: String(expectedActive),
          actual: actual ? String(actual.active) : 'missing',
          message: 'Webhook target state does not match the plan.',
        });
    }
    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}

export class OrgWebhooksMigrationModule extends WebhooksMigrationModule {
  override readonly id: string = 'org-webhooks';
  override readonly displayName: string =
    'Organization Webhooks Reconciliation';
  override readonly scopeLevel: MigrationScopeLevel = 'organization';
  override readonly dependencies: readonly string[] = [];
}
