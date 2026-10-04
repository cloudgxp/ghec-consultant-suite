import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
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
import type {
  RawGitHubVariablesResponse,
  RepoVariable,
  RepoVariablesData,
} from './types.js';

export class RepoVariablesMigrationModule implements MigrationModule<RepoVariablesData> {
  readonly id = 'repo-variables';
  readonly displayName = 'Repository Actions Variables';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  /**
   * Discovers repository Actions variables from source GitHub tenant or cached discovery bundle.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<RepoVariablesData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'RepoVariablesMigrationModule requires sourceRepo in migration context.',
      );
    }

    // 1. Cached discovery mode
    if (cachedData) {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const repoEntity = bundle.entities.find(
          (e) => e.kind === 'repository' && e.name === repo,
        );

        if (repoEntity) {
          const varEntities = bundle.entities.filter(
            (e) =>
              e.kind === 'configuration-metadata' &&
              e.domain === 'actions' &&
              e.configurationKind === 'secret' &&
              e.level === 'repository' &&
              e.repositoryId === repoEntity.id,
          );

          const variables: RepoVariable[] = varEntities.map((e) => {
            if (e.kind === 'configuration-metadata') {
              return {
                name: e.name,
                value: '', // Cached metadata redacts raw values
                createdAt: e.createdAt ?? undefined,
                updatedAt: e.updatedAt ?? undefined,
              };
            }
            return { name: '', value: '' };
          });

          return { repo, variables };
        }
      }
    }

    // 2. Live read mode
    try {
      const res = await ctx.sourceClient.readSingle<RawGitHubVariablesResponse>(
        {
          id: 'rest.actions.listRepoVariables',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/actions/variables',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
        },
        ctx.signal,
      );

      const variables: RepoVariable[] = [];
      if (res.status === 200 && res.data?.variables) {
        for (const v of res.data.variables) {
          if (v.name && v.value !== undefined) {
            variables.push({
              name: v.name,
              value: v.value,
              createdAt: v.created_at ?? undefined,
              updatedAt: v.updated_at ?? undefined,
            });
          }
        }
      }

      return { repo, variables };
    } catch (err) {
      ctx.logger.error(
        `Failed to discover variables for ${ctx.scope.sourceOrg}/${repo}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Plans variable migrations by diffing source variables against target repository variables.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: RepoVariablesData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    // Query destination repository variables
    const targetVarMap = new Map<string, RepoVariable>();
    try {
      const res = await ctx.targetClient.readSingle<RawGitHubVariablesResponse>(
        {
          id: 'rest.actions.listRepoVariables',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/actions/variables',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );

      if (res.status === 200 && res.data?.variables) {
        for (const v of res.data.variables) {
          if (v.name && v.value !== undefined) {
            targetVarMap.set(v.name, {
              name: v.name,
              value: v.value,
              createdAt: v.created_at ?? undefined,
              updatedAt: v.updated_at ?? undefined,
            });
          }
        }
      }
    } catch {
      warnings.push(
        `Could not query target variables on ${targetIdentifier}; assuming empty target.`,
      );
    }

    // Compare variables
    for (const srcVar of sourceData.variables) {
      const opId = `repo-variables:${targetRepo}:${srcVar.name}`;
      const targetVar = targetVarMap.get(srcVar.name);

      if (!targetVar) {
        operations.push({
          id: opId,
          resourceType: 'variable',
          resourceName: srcVar.name,
          operation: 'create',
          sourceState: srcVar,
          payload: { name: srcVar.name, value: srcVar.value },
          reason: 'Variable exists in source but is missing in destination.',
        });
      } else if (targetVar.value !== srcVar.value) {
        operations.push({
          id: opId,
          resourceType: 'variable',
          resourceName: srcVar.name,
          operation: 'update',
          sourceState: srcVar,
          destinationCurrentState: targetVar,
          payload: { value: srcVar.value },
          reason: 'Variable value in destination differs from source value.',
        });
      } else {
        operations.push({
          id: opId,
          resourceType: 'variable',
          resourceName: srcVar.name,
          operation: 'noop',
          sourceState: srcVar,
          destinationCurrentState: targetVar,
        });
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier,
      operations,
      warnings,
    };
  }

  /**
   * Applies planned variable mutations against the target repository.
   */
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const results: OperationExecutionResult[] = [];

    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

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
        ctx.logger.info(
          `[DRY-RUN] Simulating ${op.operation} on variable ${op.resourceName}`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      try {
        if (op.operation === 'create') {
          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.actions.createRepoVariable',
              method: 'POST',
              path: '/repos/{owner}/{repo}/actions/variables',
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
              body: op.payload,
            },
            ctx.signal,
          );

          if (res.status >= 200 && res.status < 300) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: res.status,
              error: `GitHub API error (HTTP ${res.status})`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        } else if (op.operation === 'update') {
          const res = await ctx.targetWriteClient!.mutate(
            {
              id: 'rest.actions.updateRepoVariable',
              method: 'PATCH',
              path: '/repos/{owner}/{repo}/actions/variables/{name}',
              pathParams: {
                owner: ctx.scope.targetOrg,
                repo: targetRepo,
                name: op.resourceName,
              },
              body: op.payload,
            },
            ctx.signal,
          );

          if (res.status >= 200 && res.status < 300) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: res.status,
              error: `GitHub API error (HTTP ${res.status})`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        }
      } catch (err) {
        results.push({
          operationId: op.id,
          status: 'failed',
          error: (err as Error).message || 'Unknown network error',
          completedAt: new Date().toISOString(),
        });
        if (!ctx.continueOnError) break;
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

  /**
   * Verifies destination variables post-migration to confirm target state compliance.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    // Query actual variables present on target
    const targetVarMap = new Map<string, RepoVariable>();
    try {
      const res = await ctx.targetClient.readSingle<RawGitHubVariablesResponse>(
        {
          id: 'rest.actions.listRepoVariables',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/actions/variables',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
        },
        ctx.signal,
      );

      if (res.status === 200 && res.data?.variables) {
        for (const v of res.data.variables) {
          if (v.name && v.value !== undefined) {
            targetVarMap.set(v.name, {
              name: v.name,
              value: v.value,
              createdAt: v.created_at ?? undefined,
              updatedAt: v.updated_at ?? undefined,
            });
          }
        }
      }
    } catch (err) {
      discrepancies.push({
        resourceName: targetRepo,
        expected: 'reachable',
        actual: 'unreachable',
        message: `Failed to query target repository variables: ${(err as Error).message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    // Audit each planned variable
    for (const op of plan.operations) {
      if (
        op.operation === 'create' ||
        op.operation === 'update' ||
        op.operation === 'noop'
      ) {
        const expected =
          (op.sourceState as RepoVariable | undefined) ??
          (op.payload as { name?: string; value?: string } | undefined);
        const actual = targetVarMap.get(op.resourceName);

        if (!actual) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: expected?.value ?? 'present',
            actual: 'missing',
            message: `Variable "${op.resourceName}" is missing on target repository.`,
          });
        } else if (expected && expected.value !== actual.value) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: expected.value,
            actual: actual.value,
            message: `Variable "${op.resourceName}" value mismatch on target repository.`,
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
