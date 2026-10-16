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
  LfsTrackedBlob,
  LfsUploadPayload,
} from './types.js';

function parseGitattributesLfsPatterns(content: string): string[] {
  const patterns: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!line.includes('filter=lfs')) continue;
    const firstToken = line.split(/\s+/)[0];
    if (firstToken) {
      patterns.push(firstToken);
    }
  }
  return patterns;
}

function matchesLfsGlob(
  filePath: string,
  patterns: readonly string[],
): boolean {
  if (filePath === '.gitattributes') return false;
  const fileName = filePath.split('/').pop() ?? filePath;
  for (const pattern of patterns) {
    if (pattern === filePath || pattern === fileName) {
      return true;
    }
    if (pattern.startsWith('*.') && !pattern.slice(2).includes('/')) {
      const ext = pattern.slice(1).toLowerCase();
      if (fileName.toLowerCase().endsWith(ext)) {
        return true;
      }
    }
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(filePath) || regex.test(fileName)) {
      return true;
    }
  }
  return false;
}

function parseGitLfsPointer(
  content: string,
): { readonly oid: string; readonly size: number } | undefined {
  const trimmed = content.trim();
  if (!trimmed.startsWith('version https://git-lfs.github.com/spec/v1')) {
    return undefined;
  }
  const oidMatch = /^oid sha256:([0-9a-fA-F]{64})$/m.exec(trimmed);
  const sizeMatch = /^size (\d+)$/m.exec(trimmed);
  if (!oidMatch?.[1] || !sizeMatch?.[1]) {
    return undefined;
  }
  const size = Number(sizeMatch[1]);
  if (!Number.isFinite(size) || size < 0) {
    return undefined;
  }
  return {
    oid: oidMatch[1].toLowerCase(),
    size,
  };
}

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

  private resolveSourceToken(): string | undefined {
    return (
      this.options.sourceToken ??
      process.env.GHEC_SOURCE_TOKEN?.trim() ??
      process.env.GHEC_TOKEN?.trim() ??
      undefined
    );
  }

  private resolveTargetToken(): string | undefined {
    return (
      this.options.targetToken ??
      process.env.GHEC_TARGET_TOKEN?.trim() ??
      process.env.GHEC_TOKEN?.trim() ??
      undefined
    );
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
    let lfsPatterns: string[] = [];
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
          lfsPatterns = parseGitattributesLfsPatterns(decoded);
        }
      }
    } catch {
      // 404 means no .gitattributes, repo does not use LFS
      ctx.logger.info(
        `No .gitattributes found for ${ctx.scope.sourceOrg}/${repo}`,
      );
    }

    if (!hasLfs) {
      return {
        repo,
        hasLfs: false,
        objects,
      };
    }

    // 4. Walk repository recursive Git tree(s) to discover LFS pointer blobs & tracked files
    const seenOids = new Map<string, LfsObject>();
    const trackedBlobsMap = new Map<string, LfsTrackedBlob>();
    const visitedBlobShas = new Set<string>();
    const treeRefs: string[] = ['HEAD'];

    try {
      const branchesRes = await ctx.sourceClient.fetchAll<{
        name?: string;
        commit?: { sha?: string };
      }>(
        {
          id: 'rest.repos.listBranches',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/branches',
          pathParams: {
            owner: ctx.scope.sourceOrg,
            repo,
          },
        },
        ctx.signal,
      );
      for (const b of branchesRes.items) {
        const sha = b.commit?.sha;
        if (sha && !treeRefs.includes(sha) && treeRefs.length < 15) {
          treeRefs.push(sha);
        }
      }
    } catch {
      // Fall back to HEAD only
    }

    for (const ref of treeRefs) {
      try {
        const treeRes = await ctx.sourceClient.readSingle<{
          tree?: ReadonlyArray<{
            path?: string;
            type?: string;
            sha?: string;
            size?: number;
          }>;
        }>(
          {
            id: 'rest.git.getTree',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/git/trees/{tree_sha}',
            pathParams: {
              owner: ctx.scope.sourceOrg,
              repo,
              tree_sha: ref,
            },
            queryParams: {
              recursive: '1',
            },
          },
          ctx.signal,
        );

        const treeEntries = treeRes.data?.tree;
        if (!Array.isArray(treeEntries)) {
          break;
        }

        for (const entry of treeEntries) {
          if (entry.type !== 'blob' || !entry.path || !entry.sha) {
            continue;
          }
          const isMatchedByPattern = matchesLfsGlob(entry.path, lfsPatterns);
          const isPointerSized =
            entry.size !== undefined &&
            entry.size >= 115 &&
            entry.size <= 250 &&
            entry.path !== '.gitattributes';

          if (!isMatchedByPattern && !isPointerSized) {
            continue;
          }
          if (visitedBlobShas.has(entry.sha)) {
            continue;
          }
          visitedBlobShas.add(entry.sha);

          if (entry.size !== undefined && entry.size > 1024) {
            if (isMatchedByPattern && !trackedBlobsMap.has(entry.path)) {
              trackedBlobsMap.set(entry.path, {
                path: entry.path,
                sha: entry.sha,
                size: entry.size,
              });
            }
            continue;
          }

          try {
            const blobRes = await ctx.sourceClient.readSingle<{
              content?: string;
              encoding?: string;
            }>(
              {
                id: 'rest.git.getBlob',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/git/blobs/{file_sha}',
                pathParams: {
                  owner: ctx.scope.sourceOrg,
                  repo,
                  file_sha: entry.sha,
                },
              },
              ctx.signal,
            );

            if (
              blobRes.status === 200 &&
              blobRes.data?.content &&
              blobRes.data.encoding === 'base64'
            ) {
              const decodedBlob = Buffer.from(
                blobRes.data.content.replace(/\s+/g, ''),
                'base64',
              ).toString('utf8');
              const parsedPointer = parseGitLfsPointer(decodedBlob);
              if (parsedPointer) {
                if (!seenOids.has(parsedPointer.oid)) {
                  seenOids.set(parsedPointer.oid, {
                    oid: parsedPointer.oid,
                    size: parsedPointer.size,
                    path: entry.path,
                  });
                }
              } else if (
                isMatchedByPattern &&
                !trackedBlobsMap.has(entry.path)
              ) {
                trackedBlobsMap.set(entry.path, {
                  path: entry.path,
                  sha: entry.sha,
                  size: entry.size ?? Buffer.byteLength(decodedBlob, 'utf8'),
                });
              }
            }
          } catch {
            // Ignore unreadable individual blob
          }
        }
      } catch {
        // Ignore unreadable tree ref
      }
    }

    for (const obj of seenOids.values()) {
      objects.push(obj);
    }

    const trackedBlobs = Array.from(trackedBlobsMap.values());

    return {
      repo,
      hasLfs,
      objects,
      ...(trackedBlobs.length > 0 ? { trackedBlobs } : {}),
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
    const trackedBlobs = sourceData.trackedBlobs ?? [];

    if (
      !sourceData.hasLfs ||
      (sourceData.objects.length === 0 && trackedBlobs.length === 0)
    ) {
      return {
        moduleId: this.id,
        scopeLevel: this.scopeLevel,
        targetIdentifier,
        operations: [],
        warnings,
      };
    }

    if (sourceData.objects.length > 0) {
      const targetEndpoint =
        this.options.targetLfsUrl ??
        `https://github.com/${ctx.scope.targetOrg}/${targetRepo}.git`;
      const sourceEndpoint =
        this.options.sourceLfsUrl ??
        `https://github.com/${ctx.scope.sourceOrg}/${sourceData.repo}.git`;

      const sourceToken = this.resolveSourceToken();
      const targetToken = this.resolveTargetToken();

      let targetBatchRes;
      try {
        targetBatchRes = await this.streamer.requestBatch(
          targetEndpoint,
          'upload',
          sourceData.objects,
          ctx.signal,
          targetToken,
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
            sourceToken,
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
            reason: `LFS object "${srcObj.oid}" (${srcObj.size} bytes) already exists in target LFS store.`,
          });
        }
      }
    }

    if (trackedBlobs.length > 0) {
      const targetBlobShaByPath = new Map<string, string>();
      try {
        const targetTreeRes = await ctx.targetClient.readSingle<{
          tree?: ReadonlyArray<{
            path?: string;
            type?: string;
            sha?: string;
          }>;
        }>(
          {
            id: 'rest.git.getTree.target',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/git/trees/{tree_sha}',
            pathParams: {
              owner: ctx.scope.targetOrg,
              repo: targetRepo,
              tree_sha: 'HEAD',
            },
            queryParams: {
              recursive: '1',
            },
          },
          ctx.signal,
        );
        if (Array.isArray(targetTreeRes.data?.tree)) {
          for (const entry of targetTreeRes.data.tree) {
            if (entry.type === 'blob' && entry.path && entry.sha) {
              targetBlobShaByPath.set(entry.path, entry.sha);
            }
          }
        }
      } catch {
        // Target repo might not exist yet in dry-run or pre-migration planning
      }

      for (const blob of trackedBlobs) {
        const targetSha = targetBlobShaByPath.get(blob.path);
        const matchesTarget = targetSha === blob.sha;
        operations.push({
          id: `lfs:blob:${targetRepo}:${blob.path}`,
          resourceType: 'lfs-tracked-blob',
          resourceName: blob.path,
          operation: 'noop',
          sourceState: blob,
          destinationCurrentState: targetSha
            ? { path: blob.path, sha: targetSha, size: blob.size }
            : undefined,
          reason: matchesTarget
            ? `Tracked by .gitattributes (${blob.size} bytes; stored as direct Git blob with verified SHA ${blob.sha.slice(0, 12)} on target).`
            : `Tracked by .gitattributes (${blob.size} bytes; stored as direct Git blob in repository tree).`,
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
        status: results.length > 0 ? 'complete' : 'skipped',
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
    const expectedTrackedBlobs: LfsTrackedBlob[] = [];
    for (const op of plan.operations) {
      if (op.resourceType === 'lfs-object' && op.operation !== 'skip') {
        const payload = op.payload as LfsUploadPayload | undefined;
        const sourceState = op.sourceState as LfsObject | undefined;
        const oid = payload?.oid ?? sourceState?.oid ?? op.resourceName;
        const size = payload?.size ?? sourceState?.size ?? 0;
        expectedObjects.push({ oid, size });
      } else if (
        op.resourceType === 'lfs-tracked-blob' &&
        op.operation !== 'skip'
      ) {
        const sourceState = op.sourceState as LfsTrackedBlob | undefined;
        if (sourceState?.path && sourceState?.sha) {
          expectedTrackedBlobs.push(sourceState);
        }
      }
    }

    if (expectedObjects.length === 0 && expectedTrackedBlobs.length === 0) {
      return {
        moduleId: this.id,
        verified: true,
        discrepancies: [],
      };
    }

    if (expectedObjects.length > 0) {
      const targetEndpoint =
        this.options.targetLfsUrl ??
        `https://github.com/${ctx.scope.targetOrg}/${targetRepo}.git`;
      const targetToken = this.resolveTargetToken();

      try {
        const verifyBatchRes = await this.streamer.requestBatch(
          targetEndpoint,
          'download',
          expectedObjects,
          ctx.signal,
          targetToken,
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
    }

    if (expectedTrackedBlobs.length > 0) {
      try {
        const targetTreeRes = await ctx.targetClient.readSingle<{
          tree?: ReadonlyArray<{
            path?: string;
            type?: string;
            sha?: string;
          }>;
        }>(
          {
            id: 'rest.git.getTree.verify',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/git/trees/{tree_sha}',
            pathParams: {
              owner: ctx.scope.targetOrg,
              repo: targetRepo,
              tree_sha: 'HEAD',
            },
            queryParams: {
              recursive: '1',
            },
          },
          ctx.signal,
        );
        const targetTree = targetTreeRes.data?.tree;
        if (Array.isArray(targetTree)) {
          const targetShaByPath = new Map<string, string>();
          for (const entry of targetTree) {
            if (entry.type === 'blob' && entry.path && entry.sha) {
              targetShaByPath.set(entry.path, entry.sha);
            }
          }
          for (const expectedBlob of expectedTrackedBlobs) {
            const actualSha = targetShaByPath.get(expectedBlob.path);
            if (!actualSha) {
              discrepancies.push({
                resourceName: `${targetRepo}:${expectedBlob.path}`,
                expected: expectedBlob.sha,
                actual: 'missing',
                message: `Tracked .gitattributes file "${expectedBlob.path}" is missing on target repository ${targetIdentifier}.`,
              });
            } else if (actualSha !== expectedBlob.sha) {
              discrepancies.push({
                resourceName: `${targetRepo}:${expectedBlob.path}`,
                expected: expectedBlob.sha,
                actual: actualSha,
                message: `Tracked .gitattributes file "${expectedBlob.path}" blob SHA mismatch on target repository ${targetIdentifier}.`,
              });
            }
          }
        }
      } catch (err) {
        discrepancies.push({
          resourceName: targetRepo,
          expected: 'reachable',
          actual: 'unreachable',
          message: `Failed to verify tracked .gitattributes blobs on ${targetIdentifier}: ${(err as Error).message}`,
        });
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
