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
import { transferReleaseAsset } from './asset-transfer.js';
import type {
  MigrationRelease,
  MigrationReleaseAsset,
  RawApiAsset,
  RawApiRelease,
  ReleasesMigrationData,
  ReleasesModuleOptions,
} from './types.js';

export class ReleasesMigrationModule implements MigrationModule<ReleasesMigrationData> {
  readonly id = 'releases';
  readonly displayName = 'Releases & Release Assets Migration';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  constructor(private readonly options: ReleasesModuleOptions = {}) {}

  /**
   * Discovers releases and release assets from source repository.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<ReleasesMigrationData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'ReleasesMigrationModule requires sourceRepo in migration context.',
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
          'releases' in repoEntity &&
          Array.isArray(
            (repoEntity as unknown as { releases: unknown[] }).releases,
          )
        ) {
          const rawReleases = (
            repoEntity as unknown as { releases: RawApiRelease[] }
          ).releases;
          return {
            repo,
            releases: rawReleases.map(mapApiRelease),
          };
        }
      }
    }

    // 2. Live GitHub API mode
    try {
      let rawReleases: RawApiRelease[] = [];
      const fetchResult = await ctx.sourceClient.fetchAll<RawApiRelease>(
        {
          id: 'rest.repos.listReleases',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/releases',
          pathParams: { owner: ctx.scope.sourceOrg, repo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      if (fetchResult && Array.isArray(fetchResult.items)) {
        rawReleases = [...fetchResult.items];
      } else {
        // Fallback to readSingle
        const res = await ctx.sourceClient.readSingle<RawApiRelease[]>(
          {
            id: 'rest.repos.listReleases',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/releases',
            pathParams: { owner: ctx.scope.sourceOrg, repo },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          rawReleases = res.data;
        }
      }

      return {
        repo,
        releases: rawReleases.map(mapApiRelease),
      };
    } catch (err) {
      ctx.logger.error(
        `Failed to discover releases for ${ctx.scope.sourceOrg}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  /**
   * Plans release and asset migration by diffing source releases against target releases.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: ReleasesMigrationData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    // Query destination repository releases
    const targetReleaseMap = new Map<string, MigrationRelease>();
    try {
      const fetchResult = await ctx.targetClient.fetchAll<RawApiRelease>(
        {
          id: 'rest.repos.listReleases',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/releases',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      const items = Array.isArray(fetchResult?.items) ? fetchResult.items : [];
      for (const item of items) {
        targetReleaseMap.set(item.tag_name, mapApiRelease(item));
      }
    } catch {
      try {
        const res = await ctx.targetClient.readSingle<RawApiRelease[]>(
          {
            id: 'rest.repos.listReleases',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/releases',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          for (const item of res.data) {
            targetReleaseMap.set(item.tag_name, mapApiRelease(item));
          }
        }
      } catch {
        warnings.push(
          `Could not query target releases on ${targetIdentifier}; assuming empty target.`,
        );
      }
    }

    // Compare releases and assets
    for (const srcRelease of sourceData.releases) {
      const targetRelease = targetReleaseMap.get(srcRelease.tagName);
      const releaseOpId = `release:${targetRepo}:${srcRelease.tagName}`;

      if (!targetRelease) {
        operations.push({
          id: releaseOpId,
          resourceType: 'release',
          resourceName: srcRelease.tagName,
          operation: 'create',
          sourceState: srcRelease,
          payload: {
            tag_name: srcRelease.tagName,
            target_commitish: srcRelease.targetCommitish,
            name: srcRelease.name,
            body: srcRelease.body,
            draft: srcRelease.draft,
            prerelease: srcRelease.prerelease,
            make_latest: srcRelease.makeLatest,
          },
          reason: `Release tag "${srcRelease.tagName}" is missing on target repository.`,
        });

        // Plan asset transfers for this new release
        for (const srcAsset of srcRelease.assets) {
          const assetOpId = `release-asset:${targetRepo}:${srcRelease.tagName}:${srcAsset.name}`;
          operations.push({
            id: assetOpId,
            resourceType: 'release-asset',
            resourceName: `${srcRelease.tagName}/${srcAsset.name}`,
            operation: 'create',
            sourceState: srcAsset,
            payload: {
              tagName: srcRelease.tagName,
              asset: srcAsset,
            },
            reason: `Asset "${srcAsset.name}" (${srcAsset.size} bytes) is part of release "${srcRelease.tagName}".`,
          });
        }
      } else {
        operations.push({
          id: releaseOpId,
          resourceType: 'release',
          resourceName: srcRelease.tagName,
          operation: 'noop',
          sourceState: srcRelease,
          destinationCurrentState: targetRelease,
          reason: `Release tag "${srcRelease.tagName}" already exists on target repository.`,
        });

        // Compare assets within existing release
        const targetAssetMap = new Map(
          targetRelease.assets.map((a) => [a.name, a]),
        );

        for (const srcAsset of srcRelease.assets) {
          const assetOpId = `release-asset:${targetRepo}:${srcRelease.tagName}:${srcAsset.name}`;
          const targetAsset = targetAssetMap.get(srcAsset.name);

          if (!targetAsset || targetAsset.size !== srcAsset.size) {
            operations.push({
              id: assetOpId,
              resourceType: 'release-asset',
              resourceName: `${srcRelease.tagName}/${srcAsset.name}`,
              operation: 'create',
              sourceState: srcAsset,
              destinationCurrentState: targetAsset,
              payload: {
                tagName: srcRelease.tagName,
                targetReleaseId: targetRelease.id,
                asset: srcAsset,
              },
              reason: targetAsset
                ? `Asset "${srcAsset.name}" size mismatch (${srcAsset.size} bytes vs ${targetAsset.size} bytes).`
                : `Asset "${srcAsset.name}" (${srcAsset.size} bytes) is missing on target release.`,
            });
          } else {
            operations.push({
              id: assetOpId,
              resourceType: 'release-asset',
              resourceName: `${srcRelease.tagName}/${srcAsset.name}`,
              operation: 'noop',
              sourceState: srcAsset,
              destinationCurrentState: targetAsset,
              reason: `Asset "${srcAsset.name}" (${srcAsset.size} bytes) already exists on target release.`,
            });
          }
        }
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
   * Applies planned releases and asset transfers.
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

    // Keep track of created release IDs by tag name during live run
    const createdReleaseIds = new Map<string, number>();

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'noop') {
        const assetSize =
          (op.sourceState as MigrationReleaseAsset | undefined)?.size ??
          (op.payload as { asset?: MigrationReleaseAsset } | undefined)?.asset
            ?.size;
        const defaultReason =
          op.resourceType === 'release-asset' && assetSize !== undefined
            ? `Asset "${op.resourceName}" (${assetSize} bytes) already exists on target release.`
            : `Release "${op.resourceName}" already exists on target repository.`;
        results.push({
          operationId: op.id,
          status: 'succeeded',
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          reason: op.reason ?? defaultReason,
          completedAt,
        });
        continue;
      }

      if (op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'skipped',
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          ...(op.reason ? { reason: op.reason } : {}),
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `[DRY-RUN] Simulating ${op.operation} on ${op.resourceType} ${op.resourceName}`,
        );
        const assetSize =
          (op.payload as { asset?: MigrationReleaseAsset } | undefined)?.asset
            ?.size ??
          (op.sourceState as MigrationReleaseAsset | undefined)?.size;
        const defaultReason =
          op.resourceType === 'release-asset' && assetSize !== undefined
            ? `[DRY-RUN] Simulated streaming release asset "${op.resourceName}" (${assetSize} bytes).`
            : `[DRY-RUN] Simulated ${op.operation} on ${op.resourceType} "${op.resourceName}".`;
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          reason: op.reason ?? defaultReason,
          completedAt,
        });
        continue;
      }

      try {
        if (op.resourceType === 'release' && op.operation === 'create') {
          const res = await ctx.targetWriteClient!.mutate<{ id: number }>(
            {
              id: 'rest.repos.createRelease',
              method: 'POST',
              path: '/repos/{owner}/{repo}/releases',
              pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
              body: op.payload,
            },
            ctx.signal,
          );

          if (res.status >= 200 && res.status < 300) {
            if (res.data?.id) {
              createdReleaseIds.set(op.resourceName, res.data.id);
            }
            const isDraft = Boolean(
              (op.payload as { draft?: boolean } | undefined)?.draft,
            );
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              resourceType: op.resourceType,
              resourceName: op.resourceName,
              operationType: op.operation,
              reason: `Recreated${isDraft ? ' draft' : ''} release "${op.resourceName}" on target repository.`,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              httpStatus: res.status,
              resourceType: op.resourceType,
              resourceName: op.resourceName,
              operationType: op.operation,
              ...(op.reason ? { reason: op.reason } : {}),
              error: `GitHub API error creating release (HTTP ${res.status})`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        } else if (
          op.resourceType === 'release-asset' &&
          op.operation === 'create'
        ) {
          const payload = op.payload as {
            tagName: string;
            targetReleaseId?: number;
            asset: MigrationReleaseAsset;
          };
          const targetReleaseId =
            payload.targetReleaseId ?? createdReleaseIds.get(payload.tagName);

          if (!targetReleaseId) {
            results.push({
              operationId: op.id,
              status: 'failed',
              resourceType: op.resourceType,
              resourceName: op.resourceName,
              operationType: op.operation,
              ...(op.reason ? { reason: op.reason } : {}),
              error: `Target release ID unknown for asset transfer ${payload.asset.name}`,
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
            continue;
          }

          const transferRes = await transferReleaseAsset({
            asset: payload.asset,
            targetReleaseId,
            targetOrg: ctx.scope.targetOrg,
            targetRepo,
            sourceToken:
              process.env.GHEC_SOURCE_TOKEN ?? process.env.GH_SOURCE_PAT,
            targetToken: process.env.GHEC_TARGET_TOKEN ?? process.env.GH_PAT,
            signal: ctx.signal,
          });

          if (transferRes.success) {
            const streamedBytes =
              transferRes.bytesStreamed ?? payload.asset.size ?? 0;
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: 201,
              resourceType: op.resourceType,
              resourceName: op.resourceName,
              operationType: op.operation,
              reason: `Streamed release asset "${payload.asset.name}" (${streamedBytes} bytes) to release "${payload.tagName}".`,
              completedAt: new Date().toISOString(),
            });
          } else {
            results.push({
              operationId: op.id,
              status: 'failed',
              resourceType: op.resourceType,
              resourceName: op.resourceName,
              operationType: op.operation,
              ...(op.reason ? { reason: op.reason } : {}),
              error: transferRes.error ?? 'Asset streaming failed',
              completedAt: new Date().toISOString(),
            });
            if (!ctx.continueOnError) break;
          }
        }
      } catch (err) {
        results.push({
          operationId: op.id,
          status: 'failed',
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          ...(op.reason ? { reason: op.reason } : {}),
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
   * Verifies that all expected releases and assets exist on the destination repository.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    if (plan.operations.length === 0) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    // Query target releases
    const targetReleaseMap = new Map<string, MigrationRelease>();
    try {
      const fetchResult = await ctx.targetClient.fetchAll<RawApiRelease>(
        {
          id: 'rest.repos.listReleases',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/releases',
          pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          queryParams: { per_page: 100 },
        },
        ctx.signal,
      );

      const items = Array.isArray(fetchResult?.items) ? fetchResult.items : [];
      for (const item of items) {
        targetReleaseMap.set(item.tag_name, mapApiRelease(item));
      }
    } catch {
      try {
        const res = await ctx.targetClient.readSingle<RawApiRelease[]>(
          {
            id: 'rest.repos.listReleases',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/releases',
            pathParams: { owner: ctx.scope.targetOrg, repo: targetRepo },
          },
          ctx.signal,
        );
        if (res.status === 200 && Array.isArray(res.data)) {
          for (const item of res.data) {
            targetReleaseMap.set(item.tag_name, mapApiRelease(item));
          }
        }
      } catch (err) {
        discrepancies.push({
          resourceName: targetRepo,
          expected: 'reachable',
          actual: 'unreachable',
          message: `Failed to query target repository releases: ${(err as Error).message}`,
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
      if (op.resourceType === 'release') {
        const targetRelease = targetReleaseMap.get(op.resourceName);
        if (!targetRelease) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Release "${op.resourceName}" is missing on target repository.`,
          });
        }
      } else if (op.resourceType === 'release-asset') {
        const [tagName, assetName] = op.resourceName.split('/');
        const targetRelease = targetReleaseMap.get(tagName ?? '');
        const targetAsset = targetRelease?.assets.find(
          (a) => a.name === assetName,
        );
        const expectedAsset = (op.sourceState ??
          (op.payload as { asset?: MigrationReleaseAsset })?.asset) as
          MigrationReleaseAsset | undefined;

        if (!targetAsset) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: 'present',
            actual: 'missing',
            message: `Release asset "${op.resourceName}" is missing on target repository.`,
          });
        } else if (expectedAsset && expectedAsset.size !== targetAsset.size) {
          discrepancies.push({
            resourceName: op.resourceName,
            expected: `${expectedAsset.size} bytes`,
            actual: `${targetAsset.size} bytes`,
            message: `Release asset "${op.resourceName}" byte size mismatch.`,
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

function mapApiAsset(raw: RawApiAsset): MigrationReleaseAsset {
  return {
    id: raw.id,
    name: raw.name,
    label: raw.label,
    contentType: raw.content_type ?? 'application/octet-stream',
    size: raw.size ?? 0,
    downloadUrl: raw.url ?? raw.browser_download_url ?? '',
  };
}

function mapApiRelease(raw: RawApiRelease): MigrationRelease {
  return {
    id: raw.id,
    tagName: raw.tag_name,
    targetCommitish: raw.target_commitish ?? raw.tag_name,
    name: raw.name,
    body: raw.body,
    draft: raw.draft ?? false,
    prerelease: raw.prerelease ?? false,
    makeLatest: raw.make_latest,
    createdAt: raw.created_at ?? new Date(0).toISOString(),
    publishedAt: raw.published_at,
    assets: (raw.assets ?? []).map(mapApiAsset),
  };
}
