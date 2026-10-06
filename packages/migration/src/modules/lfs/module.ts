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
import { LfsStreamer } from './lfs-streamer.js';
import type {
  LfsMigrationData,
  LfsModuleOptions,
  LfsObject,
  LfsStreamerInterface,
  LfsUploadPayload,
} from './types.js';

export class LfsMigrationModule implements MigrationModule<LfsMigrationData> {
  readonly id = 'lfs';
  readonly displayName = 'Git LFS Object Batch Streaming';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  private readonly streamer: LfsStreamerInterface;
  private readonly concurrency: number;

  constructor(private readonly options: LfsModuleOptions = {}) {
    this.streamer = options.streamer ?? new LfsStreamer();
    this.concurrency = options.concurrency ?? 4;
  }

  /**
   * Discovers Git LFS usage and tracked LFS objects on source repository.
   */
  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<LfsMigrationData> {
    const repo = ctx.scope.sourceRepo ?? '';
    if (!repo) {
      throw new Error(
        'LfsMigrationModule requires sourceRepo in migration context.',
      );
    }

    // 1. Check if explicitly provided via options
    if (this.options.objects && this.options.objects.length > 0) {
      return {
        repo,
        hasLfs: true,
        objects: this.options.objects,
      };
    }

    // 2. Cached discovery bundle mode
    let hasLfs = false;
    const objects: LfsObject[] = [];

    if (cachedData && typeof cachedData === 'object') {
      const bundle = cachedData as DiscoveryBundle;
      if (bundle.entities) {
        const lfsEntity = bundle.entities.find(
          (e) => e.kind === 'lfs' && e.repositoryId === repo,
        );
        if (
          lfsEntity &&
          'indicator' in lfsEntity &&
          lfsEntity.indicator === 'detected'
        ) {
          hasLfs = true;
        }

        // Check for large_asset / lfs asset entities
        for (const entity of bundle.entities) {
          if (
            entity.kind === 'asset' &&
            entity.repositoryId === repo &&
            (entity.assetKind === 'large_asset' ||
              (entity as unknown as { assetKind: string }).assetKind === 'lfs')
          ) {
            objects.push({
              oid: entity.name,
              size: entity.size.value ?? 0,
            });
          }
        }

        if (hasLfs || objects.length > 0) {
          return {
            repo,
            hasLfs: true,
            objects,
          };
        }
      }
    }

    // 3. Live check .gitattributes on source repo
    try {
      const res = await ctx.sourceClient.readSingle<{
        content?: string;
        encoding?: string;
      }>(
        {
          id: 'rest.repos.getContent',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/contents/{path}',
          pathParams: {
            owner: ctx.scope.sourceOrg,
            repo,
            path: '.gitattributes',
          },
        },
        ctx.signal,
      );

      if (
        res.status === 200 &&
        res.data?.content &&
        res.data.encoding === 'base64'
      ) {
        const decoded = Buffer.from(res.data.content, 'base64').toString(
          'utf8',
        );
        if (decoded.includes('filter=lfs')) {
          hasLfs = true;
        }
      }
    } catch {
      // 404 means no .gitattributes, repo does not use LFS
      ctx.logger.info(
        `No .gitattributes found for ${ctx.scope.sourceOrg}/${repo}`,
      );
    }

    return {
      repo,
      hasLfs,
      objects,
    };
  }

  /**
   * Plans LFS object migration using Git LFS Batch API handshake against destination.
   */
  async plan(
    ctx: MigrationContext,
    sourceData: LfsMigrationData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? sourceData.repo;
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    if (!sourceData.hasLfs || sourceData.objects.length === 0) {
      return {
        moduleId: this.id,
        scopeLevel: this.scopeLevel,
        targetIdentifier,
        operations: [],
        warnings,
      };
    }

    const targetEndpoint =
      this.options.targetLfsUrl ??
      `https://github.com/${ctx.scope.targetOrg}/${targetRepo}.git`;
    const sourceEndpoint =
      this.options.sourceLfsUrl ??
      `https://github.com/${ctx.scope.sourceOrg}/${sourceData.repo}.git`;

    let targetBatchRes;
    try {
      targetBatchRes = await this.streamer.requestBatch(
        targetEndpoint,
        'upload',
        sourceData.objects,
        ctx.signal,
      );
    } catch (err) {
      warnings.push(
        `Failed to negotiate LFS batch upload with target ${targetEndpoint}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        moduleId: this.id,
        scopeLevel: this.scopeLevel,
        targetIdentifier,
        operations: [],
        warnings,
      };
    }

    const missingObjects: LfsObject[] = [];
    const targetObjectMap = new Map(
      targetBatchRes.objects.map((obj) => [obj.oid, obj]),
    );

    for (const srcObj of sourceData.objects) {
      const targetObj = targetObjectMap.get(srcObj.oid);
      if (targetObj?.actions?.upload) {
        missingObjects.push(srcObj);
      }
    }

    // If objects are missing on target, request download URLs from source LFS
    const sourceDownloadMap = new Map<
      string,
      { href: string; header?: Record<string, string> }
    >();

    if (missingObjects.length > 0) {
      try {
        const sourceBatchRes = await this.streamer.requestBatch(
          sourceEndpoint,
          'download',
          missingObjects,
          ctx.signal,
        );

        for (const obj of sourceBatchRes.objects) {
          if (obj.actions?.download) {
            sourceDownloadMap.set(obj.oid, {
              href: obj.actions.download.href,
              ...(obj.actions.download.header
                ? { header: obj.actions.download.header }
                : {}),
            });
          }
        }
      } catch (err) {
        warnings.push(
          `Failed to negotiate LFS batch download with source ${sourceEndpoint}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const srcObj of sourceData.objects) {
      const opId = `lfs:${targetRepo}:${srcObj.oid}`;
      const targetObj = targetObjectMap.get(srcObj.oid);

      if (targetObj?.actions?.upload) {
        const sourceDownload = sourceDownloadMap.get(srcObj.oid);
        const payload: LfsUploadPayload = {
          oid: srcObj.oid,
          size: srcObj.size,
          uploadAction: targetObj.actions.upload,
          verifyAction: targetObj.actions.verify,
          sourceDownloadUrl: sourceDownload?.href,
          sourceDownloadHeader: sourceDownload?.header,
        };

        operations.push({
          id: opId,
          resourceType: 'lfs-object',
          resourceName: srcObj.oid,
          operation: 'create',
          sourceState: srcObj,
          payload,
          reason: `LFS object "${srcObj.oid}" (${srcObj.size} bytes) is missing on target LFS store.`,
        });
      } else {
        operations.push({
          id: opId,
          resourceType: 'lfs-object',
          resourceName: srcObj.oid,
          operation: 'noop',
          sourceState: srcObj,
          destinationCurrentState: targetObj,
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
   * Applies planned LFS transfers via streaming workers.
   */
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];

    const createOps = plan.operations.filter((op) => op.operation === 'create');
    const noopOps = plan.operations.filter((op) => op.operation === 'noop');
    const skipOps = plan.operations.filter((op) => op.operation === 'skip');

    for (const op of noopOps) {
      results.push({
        operationId: op.id,
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });
    }

    for (const op of skipOps) {
      results.push({
        operationId: op.id,
        status: 'skipped',
        completedAt: new Date().toISOString(),
      });
    }

    if (ctx.dryRun) {
      const totalBytes = createOps.reduce(
        (acc, op) => acc + ((op.payload as LfsUploadPayload)?.size ?? 0),
        0,
      );
      ctx.logger.info(
        `[DRY-RUN] Simulating transfer of ${createOps.length} LFS objects (${totalBytes} bytes)`,
      );
      for (const op of createOps) {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt: new Date().toISOString(),
        });
      }

      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        results,
        durationMs: Date.now() - startTime,
      };
    }

    // Execute with worker concurrency
    let cursor = 0;
    const executeWorker = async () => {
      while (cursor < createOps.length) {
        if (ctx.signal.aborted) break;
        const op = createOps[cursor++];
        if (!op) break;

        const payload = op.payload as LfsUploadPayload;
        if (!payload.sourceDownloadUrl || !payload.uploadAction?.href) {
          results.push({
            operationId: op.id,
            status: 'failed',
            error: `Missing download URL or upload URL for LFS object ${payload.oid}`,
            completedAt: new Date().toISOString(),
          });
          if (!ctx.continueOnError) break;
          continue;
        }

        try {
          await this.streamer.transferObject(
            payload.sourceDownloadUrl,
            payload.uploadAction.href,
            payload.oid,
            payload.size,
            payload.uploadAction.header,
            payload.sourceDownloadHeader,
            payload.verifyAction,
            ctx.signal,
          );

          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: 200,
            completedAt: new Date().toISOString(),
          });
        } catch (err) {
          results.push({
            operationId: op.id,
            status: 'failed',
            error: (err as Error).message || 'Failed to transfer LFS object',
            completedAt: new Date().toISOString(),
          });
          if (!ctx.continueOnError) break;
        }
      }
    };

    const workerCount = Math.min(this.concurrency, createOps.length || 1);
    const workers = Array.from({ length: workerCount }, () => executeWorker());
    await Promise.all(workers);

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
   * Verifies LFS object availability on destination repository.
   */
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;
    const discrepancies: VerificationDiscrepancy[] = [];

    const expectedObjects: LfsObject[] = [];
    for (const op of plan.operations) {
      if (op.resourceType === 'lfs-object' && op.operation !== 'skip') {
        const payload = op.payload as LfsUploadPayload | undefined;
        const sourceState = op.sourceState as LfsObject | undefined;
        const oid = payload?.oid ?? sourceState?.oid ?? op.resourceName;
        const size = payload?.size ?? sourceState?.size ?? 0;
        expectedObjects.push({ oid, size });
      }
    }

    if (expectedObjects.length === 0) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    const targetEndpoint =
      this.options.targetLfsUrl ??
      `https://github.com/${ctx.scope.targetOrg}/${targetRepo}.git`;

    try {
      const verifyBatchRes = await this.streamer.requestBatch(
        targetEndpoint,
        'download',
        expectedObjects,
        ctx.signal,
      );

      const targetObjectMap = new Map(
        verifyBatchRes.objects.map((o) => [o.oid, o]),
      );

      for (const expected of expectedObjects) {
        const objRes = targetObjectMap.get(expected.oid);
        if (!objRes || !objRes.actions?.download) {
          discrepancies.push({
            resourceName: expected.oid,
            expected: 'available',
            actual: 'missing',
            message: `LFS object "${expected.oid}" (${expected.size} bytes) is missing or unverified on target repository ${targetIdentifier}.`,
          });
        }
      }
    } catch (err) {
      discrepancies.push({
        resourceName: targetRepo,
        expected: 'reachable',
        actual: 'unreachable',
        message: `Failed to verify LFS availability on ${targetEndpoint}: ${(err as Error).message}`,
      });
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
