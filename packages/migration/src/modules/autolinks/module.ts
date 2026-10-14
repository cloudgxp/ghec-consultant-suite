import {
  MIGRATION_SCHEMA_VERSION,
  type ModuleExecutionResult,
  type ModulePlan,
  type ModuleVerificationResult,
  type OperationExecutionResult,
  type PlannedOperation,
  type VerificationDiscrepancy,
} from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import type {
  AutolinkDefinition,
  AutolinksMigrationData,
  RawAutolinkResponse,
} from './types.js';

function parseAutolinks(data: unknown): AutolinkDefinition[] {
  if (!Array.isArray(data)) return [];
  const results: AutolinkDefinition[] = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as RawAutolinkResponse;
    if (
      typeof raw.key_prefix === 'string' &&
      typeof raw.url_template === 'string'
    ) {
      results.push({
        id: typeof raw.id === 'number' ? raw.id : undefined,
        key_prefix: raw.key_prefix,
        url_template: raw.url_template,
        is_alphanumeric: raw.is_alphanumeric ?? true,
      });
    }
  }

  return results;
}

export class AutolinksMigrationModule implements MigrationModule<AutolinksMigrationData> {
  readonly id = 'autolinks';
  readonly displayName = 'Repository Autolinks';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['repo-settings'];

  async discover(ctx: MigrationContext): Promise<AutolinksMigrationData> {
    const sourceOrg = ctx.scope.sourceOrg;
    const sourceRepo = ctx.scope.sourceRepo ?? '';

    if (!sourceRepo) {
      return {
        owner: sourceOrg,
        repo: '',
        autolinks: [],
      };
    }

    let autolinks: AutolinkDefinition[];

    try {
      const res = await ctx.sourceClient.readSingle<unknown>(
        {
          id: 'rest.repos.listAutolinks',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/autolinks',
          pathParams: { owner: sourceOrg, repo: sourceRepo },
        },
        ctx.signal,
      );
      autolinks = parseAutolinks(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover autolinks for ${sourceOrg}/${sourceRepo}: ${message}`,
        { cause: err },
      );
    }

    return {
      owner: sourceOrg,
      repo: sourceRepo,
      autolinks,
    };
  }

  async plan(
    ctx: MigrationContext,
    source: AutolinksMigrationData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? source.repo;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    if (!targetRepo) {
      return {
        moduleId: this.id,
        scopeLevel: this.scopeLevel,
        targetIdentifier: `${targetOrg}/<unknown>`,
        operations: [],
        warnings: ['No target repository specified for autolinks planning.'],
      };
    }

    const targetAutolinksByPrefix = new Map<string, AutolinkDefinition>();
    try {
      const res = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.repos.listTargetAutolinks',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/autolinks',
          pathParams: { owner: targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );
      const parsed = parseAutolinks(res.data);
      for (const link of parsed) {
        targetAutolinksByPrefix.set(link.key_prefix, link);
      }
    } catch {
      // Fresh repository or autolinks uninitialized
    }

    for (const srcLink of source.autolinks) {
      const targetLink = targetAutolinksByPrefix.get(srcLink.key_prefix);

      if (!targetLink) {
        operations.push({
          id: `op-autolink-create-${srcLink.key_prefix.replace(/[^a-zA-Z0-9_-]/g, '')}`,
          resourceType: 'autolink',
          resourceName: `${targetOrg}/${targetRepo}:${srcLink.key_prefix}`,
          operation: 'create',
          sourceState: srcLink as unknown as Record<string, unknown>,
          destinationCurrentState: undefined,
          payload: {
            key_prefix: srcLink.key_prefix,
            url_template: srcLink.url_template,
            is_alphanumeric: srcLink.is_alphanumeric,
          },
          reason: `Creating autolink reference for prefix '${srcLink.key_prefix}'`,
        });
      } else {
        const matches =
          targetLink.url_template === srcLink.url_template &&
          targetLink.is_alphanumeric === srcLink.is_alphanumeric;

        if (matches) {
          operations.push({
            id: `op-autolink-noop-${srcLink.key_prefix.replace(/[^a-zA-Z0-9_-]/g, '')}`,
            resourceType: 'autolink',
            resourceName: `${targetOrg}/${targetRepo}:${srcLink.key_prefix}`,
            operation: 'noop',
            sourceState: srcLink as unknown as Record<string, unknown>,
            destinationCurrentState: targetLink as unknown as Record<
              string,
              unknown
            >,
            reason: `Autolink reference for prefix '${srcLink.key_prefix}' already matches target configuration`,
          });
        } else {
          operations.push({
            id: `op-autolink-update-${srcLink.key_prefix.replace(/[^a-zA-Z0-9_-]/g, '')}`,
            resourceType: 'autolink',
            resourceName: `${targetOrg}/${targetRepo}:${srcLink.key_prefix}`,
            operation: 'update',
            sourceState: srcLink as unknown as Record<string, unknown>,
            destinationCurrentState: targetLink as unknown as Record<
              string,
              unknown
            >,
            payload: {
              key_prefix: srcLink.key_prefix,
              url_template: srcLink.url_template,
              is_alphanumeric: srcLink.is_alphanumeric,
              existing_id: targetLink.id,
            },
            reason: `Updating autolink reference for prefix '${srcLink.key_prefix}' (requires re-creation)`,
          });
        }
      }
    }

    if (operations.length === 0) {
      operations.push({
        id: `op-autolink-noop-empty-${targetOrg}-${targetRepo}`,
        resourceType: 'autolink',
        resourceName: `${targetOrg}/${targetRepo}`,
        operation: 'noop',
        sourceState: {},
        destinationCurrentState: {},
        reason: 'No autolinks defined on source repository',
      });
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${targetOrg}/${targetRepo}`,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'noop') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 201,
          completedAt,
        });
        continue;
      }

      if (!ctx.targetWriteClient) {
        throw new Error(
          `Cannot apply operation '${op.id}' without targetWriteClient`,
        );
      }

      try {
        const payload = (op.payload as Record<string, unknown>) ?? {};

        // If updating and existing_id is present, delete old autolink first
        if (
          op.operation === 'update' &&
          typeof payload.existing_id === 'number'
        ) {
          const deleteOp: TargetWriteOperation = {
            id: `mutate-${op.id}-delete`,
            method: 'DELETE',
            path: '/repos/{owner}/{repo}/autolinks/{autolink_id}',
            pathParams: {
              owner: targetOrg,
              repo: targetRepo,
              autolink_id: String(payload.existing_id),
            },
          };
          await ctx.targetWriteClient.mutate(deleteOp, ctx.signal);
        }

        const createOp: TargetWriteOperation = {
          id: `mutate-${op.id}-create`,
          method: 'POST',
          path: '/repos/{owner}/{repo}/autolinks',
          pathParams: { owner: targetOrg, repo: targetRepo },
          body: {
            key_prefix: payload.key_prefix,
            url_template: payload.url_template,
            is_alphanumeric: payload.is_alphanumeric,
          },
        };

        const res = await ctx.targetWriteClient.mutate(createOp, ctx.signal);
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: res.status,
          completedAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        });

        if (!ctx.continueOnError) {
          break;
        }
      }
    }

    const hasFailed = results.some((r) => r.status === 'failed');
    const hasSucceeded = results.some((r) => r.status === 'succeeded');
    let overallStatus: ModuleExecutionResult['status'];

    if (!hasFailed && hasSucceeded) {
      overallStatus = 'complete';
    } else if (hasFailed && hasSucceeded) {
      overallStatus = 'partial';
    } else if (hasFailed && !hasSucceeded) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'skipped';
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: overallStatus,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    const targetAutolinksByPrefix = new Map<string, AutolinkDefinition>();
    try {
      const res = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.repos.verifyAutolinks',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/autolinks',
          pathParams: { owner: targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );
      const parsed = parseAutolinks(res.data);
      for (const link of parsed) {
        targetAutolinksByPrefix.set(link.key_prefix, link);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}/${targetRepo}:autolinks`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target autolinks: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    for (const op of plan.operations) {
      if (
        op.operation === 'noop' ||
        op.operation === 'create' ||
        op.operation === 'update'
      ) {
        const payload = (op.payload as Record<string, unknown>) ?? {};
        const prefix =
          (payload.key_prefix as string | undefined) ??
          (op.sourceState as { key_prefix?: string })?.key_prefix;

        if (!prefix) continue;

        const targetLink = targetAutolinksByPrefix.get(prefix);
        if (!targetLink) {
          discrepancies.push({
            resourceName: `${targetOrg}/${targetRepo} (autolink:${prefix})`,
            expected: `Autolink for '${prefix}' present`,
            actual: 'missing',
            message: `Missing autolink reference for prefix '${prefix}' on target repository.`,
          });
          continue;
        }

        const expectedUrl =
          (payload.url_template as string | undefined) ??
          (op.sourceState as { url_template?: string })?.url_template;

        if (expectedUrl && targetLink.url_template !== expectedUrl) {
          discrepancies.push({
            resourceName: `${targetOrg}/${targetRepo} (autolink:${prefix}:url_template)`,
            expected: expectedUrl,
            actual: targetLink.url_template,
            message: `Autolink url_template mismatch for '${prefix}': expected "${expectedUrl}", found "${targetLink.url_template}".`,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
