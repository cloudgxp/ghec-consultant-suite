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
import { areSshKeysEqual, normalizeSshKey } from './fingerprint.js';
import type {
  DeployKeysMigrationData,
  DeployKeysModuleOptions,
  MigrationDeployKey,
  RawApiDeployKey,
} from './types.js';

export class DeployKeysMigrationModule implements MigrationModule<DeployKeysMigrationData> {
  readonly id = 'deploy-keys';
  readonly displayName = 'Repository Deploy Keys Rehydration';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  constructor(private readonly options: DeployKeysModuleOptions = {}) {}

  /**
   * Discovers deploy keys on source repository.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<DeployKeysMigrationData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'DeployKeysMigrationModule requires sourceRepo in migration context.',
      );
    }

    // 1. Cached discovery bundle mode
    if (cachedData && typeof cachedData === 'object') {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const repoEntity = bundle.entities.find(
          (e) => e.kind === 'repository' && e.name === repo,
        );
        if (
          repoEntity &&
          'deployKeys' in repoEntity &&
          Array.isArray(
            (repoEntity as unknown as { deployKeys: unknown[] }).deployKeys,
          )
        ) {
          const rawKeys = (
            repoEntity as unknown as { deployKeys: RawApiDeployKey[] }
          ).deployKeys;
          return {
            repo,
            keys: rawKeys.map(mapApiDeployKey),
          };
        }
      }
    }

    // 2. Live GitHub API query
    try {
      let rawKeys: RawApiDeployKey[] = [];
      const fetchResult = await ctx.sourceClient.fetchAll<RawApiDeployKey>(
        {
          id: 'rest.repos.listDeployKeys',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/keys',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      if (fetchResult && Array.isArray(fetchResult.items)) {
        rawKeys = [...fetchResult.items];
      } else {
        const res = await ctx.sourceClient.readSingle<RawApiDeployKey[]>(
          {
            id: 'rest.repos.listDeployKeys',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/keys',
            pathParams: { owner: ctx.scope.sourceOrg, repo },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          rawKeys = res.data;
        }
      }

      return {
        repo,
        keys: rawKeys.map(mapApiDeployKey),
      };
    } catch (err) {
      ctx.logger.error(
        `Failed to discover deploy keys for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  /**
   * Plans deploy key migration by diffing source keys against target repository keys.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: DeployKeysMigrationData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    // Query destination repository deploy keys
    const targetKeys: MigrationDeployKey[] = [];
    try {
      const fetchResult = await ctx.targetClient.fetchAll<RawApiDeployKey>(
        {
          id: 'rest.repos.listDeployKeys',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/keys',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      const items = Array.isArray(fetchResult?.items) ? fetchResult.items : [];
      for (const item of items) {
        targetKeys.push(mapApiDeployKey(item));
      }
    } catch {
      try {
        const res = await ctx.targetClient.readSingle<RawApiDeployKey[]>(
          {
            id: 'rest.repos.listDeployKeys',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/keys',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          for (const item of res.data) {
            targetKeys.push(mapApiDeployKey(item));
          }
        }
      } catch {
        warnings.push(
          `Could not query target deploy keys on ${targetIdentifier}; assuming empty target.`,
        );
      }
    }

    // Compare keys
    for (const srcKey of sourceData.keys) {
      const opId = `deploy-key:${targetRepo}:${srcKey.title}`;
      const matchingTargetKey = targetKeys.find((tk) =>
        areSshKeysEqual(tk.key, srcKey.key),
      );
      const titleMatchKey = targetKeys.find((tk) => tk.title === srcKey.title);

      if (titleMatchKey && !matchingTargetKey) {
        warnings.push(
          `Deploy key title "${srcKey.title}" already exists on target with different public key.`,
        );
      }

      if (!matchingTargetKey) {
        operations.push({
          id: opId,
          resourceType: 'deploy-key',
          resourceName: srcKey.title,
          operation: 'create',
          sourceState: srcKey,
          payload: {
            title: srcKey.title,
            key: srcKey.key,
            read_only: srcKey.readOnly,
          },
          reason: `Deploy key "${srcKey.title}" is missing on target repository.`,
        });
      } else {
        operations.push({
          id: opId,
          resourceType: 'deploy-key',
          resourceName: srcKey.title,
          operation: 'noop',
          sourceState: srcKey,
          destinationCurrentState: matchingTargetKey,
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
   * Applies planned deploy key additions.
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
          `[DRY-RUN] Simulating ${op.operation} on deploy key "${op.resourceName}"`,
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
              id: 'rest.repos.createDeployKey',
              method: 'POST',
              path: '/repos/{owner}/{repo}/keys',
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
          } else if (res.status === 422) {
            // Key already in use or unprocessable
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: 422,
              error:
                'Deploy key already in use or rejected by GitHub policy (HTTP 422)',
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: res.status,
              error: `GitHub API error creating deploy key (HTTP ${res.status})`,
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
   * Verifies destination repository deploy keys.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    const targetKeys: MigrationDeployKey[] = [];
    try {
      const fetchResult = await ctx.targetClient.fetchAll<RawApiDeployKey>(
        {
          id: 'rest.repos.listDeployKeys',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/keys',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      const items = Array.isArray(fetchResult?.items) ? fetchResult.items : [];
      for (const item of items) {
        targetKeys.push(mapApiDeployKey(item));
      }
    } catch {
      try {
        const res = await ctx.targetClient.readSingle<RawApiDeployKey[]>(
          {
            id: 'rest.repos.listDeployKeys',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/keys',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          for (const item of res.data) {
            targetKeys.push(mapApiDeployKey(item));
          }
        }
      } catch (err) {
        discrepancies.push({
          resourceName: targetRepo,
          expected: 'reachable',
          actual: 'unreachable',
          message: `Failed to query target repository deploy keys: ${(err as Error).message}`,
        });
        return {
          moduleId: this.id,
          verified: false,
          discrepancies,
        };
      }
    }

    // Verify operations
    for (const op of plan.operations) {
      if (op.resourceType === 'deploy-key') {
        const expected =
          (op.sourceState as MigrationDeployKey | undefined) ??
          (op.payload as
            { key?: string; read_only?: boolean; title?: string } | undefined);
        const expectedKey = expected?.key ?? '';
        const matchingTarget = targetKeys.find((tk) =>
          areSshKeysEqual(tk.key, expectedKey),
        );

        if (!matchingTarget) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Deploy key "${op.resourceName}" is missing on target repository.`,
          });
        } else {
          const expectedReadOnly =
            (expected as MigrationDeployKey)?.readOnly ??
            (expected as { read_only?: boolean })?.read_only;
          if (
            expectedReadOnly !== undefined &&
            matchingTarget.readOnly !== expectedReadOnly
          ) {
            discrepancies.push({
              resourceName: op.resourceName,
              expected: `read_only: ${expectedReadOnly}`,
              actual: `read_only: ${matchingTarget.readOnly}`,
              message: `Deploy key "${op.resourceName}" read_only permission mismatch.`,
            });
          }
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

function mapApiDeployKey(raw: RawApiDeployKey): MigrationDeployKey {
  const norm = normalizeSshKey(raw.key);
  return {
    id: raw.id,
    key: raw.key,
    title: raw.title,
    readOnly: raw.read_only ?? true,
    verified: raw.verified,
    createdAt: raw.created_at,
    fingerprint: norm.fingerprint,
  };
}
