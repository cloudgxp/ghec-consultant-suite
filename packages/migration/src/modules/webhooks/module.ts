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
import { hooksMatch, webhookPayload } from './reconciler.js';
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

export class WebhooksMigrationModule implements MigrationModule<WebhooksData> {
  readonly id = 'webhooks';
  readonly displayName = 'Organization & Repository Webhooks Reconciliation';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];
  private readonly secretProvider: WebhooksModuleOptions['secretProvider'];
  constructor(options: WebhooksModuleOptions = {}) {
    this.secretProvider = options.secretProvider;
  }
  async discover(ctx: MigrationContext): Promise<WebhooksData> {
    const response = await ctx.sourceClient.readSingle<{
      readonly hooks?: readonly RawWebhook[];
    }>(
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
    return {
      level: ctx.scope.level,
      hooks: (response.data?.hooks ?? []).flatMap((hook) => {
        const parsed = parse(hook);
        return parsed ? [parsed] : [];
      }),
    };
  }
  async plan(ctx: MigrationContext, source: WebhooksData): Promise<ModulePlan> {
    const response = await ctx.targetClient.readSingle<{
      readonly hooks?: readonly RawWebhook[];
    }>(
      {
        id: 'rest.webhooks.list',
        transport: 'rest',
        verifiedReadOnly: true,
        path: pathFor(ctx),
        pathParams: paramsFor(ctx),
      },
      ctx.signal,
    );
    const target = (response.data?.hooks ?? []).flatMap((hook) => {
      const parsed = parse(hook);
      return parsed ? [parsed] : [];
    });
    const warnings: string[] = [];
    const operations: PlannedOperation[] = source.hooks.map((hook) => {
      const existing = target.find((candidate) => hooksMatch(hook, candidate));
      const operation = !existing
        ? 'create'
        : existing.active === hook.active
          ? 'noop'
          : 'update';
      if (hook.secretConfigured && !this.secretProvider)
        warnings.push(
          `Webhook "${hook.url}" has a source secret but no replacement secret provider.`,
        );
      return {
        id: `webhooks:${ctx.scope.targetOrg}:${hook.url}`,
        resourceType: 'webhook',
        resourceName: hook.url,
        operation,
        sourceState: hook,
        destinationCurrentState: existing,
        payload: operation === 'noop' ? undefined : { hookId: existing?.id },
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
        results.push({ operationId: op.id, status: 'succeeded', completedAt });
        continue;
      }
      if (ctx.dryRun) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
          httpStatus: 200,
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
          body: webhookPayload(hook, secret),
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
      });
    }
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: results.some((result) => result.status === 'failed')
        ? 'failed'
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
    for (const op of plan.operations) {
      const expected = op.sourceState as WebhookDefinition;
      const actual = current.hooks.find((hook) => hooksMatch(expected, hook));
      if (!actual || actual.active !== expected.active)
        discrepancies.push({
          resourceName: expected.url,
          expected: String(expected.active),
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
