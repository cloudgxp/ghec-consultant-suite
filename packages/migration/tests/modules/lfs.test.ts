import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  LfsMigrationModule,
  createDefaultModuleRegistry,
  type MigrationContext,
  type LfsBatchResponse,
  type LfsObject,
  type LfsStreamerInterface,
} from '../../src/index.js';

class MockLfsReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(private readonly gitattributesContent?: string) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (this.gitattributesContent !== undefined) {
      return {
        data: {
          content: Buffer.from(this.gitattributesContent).toString('base64'),
          encoding: 'base64',
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    const err = new Error('Not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }

  async fetchAll<T>(): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    return { items: [], observedAt: new Date().toISOString(), complete: true };
  }

  async readPage<T>(): Promise<{
    items: readonly T[];
    nextCursor: string | null;
    status: number;
    observedAt: string;
  }> {
    return {
      items: [],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async queryGraphQL<T>(): Promise<{ data: T; observedAt: string }> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: {} as T, status: 200 };
  }
}

class MockLfsStreamer implements LfsStreamerInterface {
  readonly transferred: Array<{
    sourceUrl: string;
    targetUrl: string;
    oid: string;
    size: number;
  }> = [];

  constructor(
    private readonly targetExistingOids: Set<string> = new Set(),
    private readonly shouldVerifyFail: boolean = false,
  ) {}

  async requestBatch(
    repoEndpoint: string,
    operation: 'upload' | 'download',
    objects: readonly LfsObject[],
  ): Promise<LfsBatchResponse> {
    if (operation === 'upload') {
      return {
        transfer: 'basic',
        objects: objects.map((obj) => {
          if (this.targetExistingOids.has(obj.oid)) {
            // Already present on target
            return {
              oid: obj.oid,
              size: obj.size,
              actions: {},
            };
          }
          // Missing on target
          return {
            oid: obj.oid,
            size: obj.size,
            actions: {
              upload: {
                href: `https://lfs-storage.example.com/upload/${obj.oid}`,
                header: { Authorization: 'UploadToken' },
              },
              verify: {
                href: `https://lfs-storage.example.com/verify/${obj.oid}`,
              },
            },
          };
        }),
      };
    }

    // download operation
    return {
      transfer: 'basic',
      objects: objects.map((obj) => {
        if (this.shouldVerifyFail && !this.targetExistingOids.has(obj.oid)) {
          return {
            oid: obj.oid,
            size: obj.size,
            error: { code: 404, message: 'Object not found' },
          };
        }
        return {
          oid: obj.oid,
          size: obj.size,
          actions: {
            download: {
              href: `https://lfs-storage.example.com/download/${obj.oid}`,
              header: { Authorization: 'DownloadToken' },
            },
          },
        };
      }),
    };
  }

  async transferObject(
    sourceUrl: string,
    targetUrl: string,
    expectedOid: string,
    expectedSize: number,
  ): Promise<void> {
    this.transferred.push({
      sourceUrl,
      targetUrl,
      oid: expectedOid,
      size: expectedSize,
    });
  }
}

test('LfsMigrationModule registers in ModuleRegistry with id lfs and gei-repo dependency', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('lfs');
  assert.ok(mod);
  assert.equal(mod.id, 'lfs');
  assert.equal(mod.displayName, 'Git LFS Object Batch Streaming');
  assert.equal(mod.scopeLevel, 'repository');
  assert.deepEqual(mod.dependencies, ['gei-repo']);
});

test('LfsMigrationModule discover detects LFS from .gitattributes', async () => {
  const mod = new LfsMigrationModule({
    objects: [{ oid: 'a'.repeat(64), size: 1024 }],
  });

  const ctx: MigrationContext = {
    runId: 'run-disc',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'repo-with-lfs',
      targetOrg: 'dst-org',
      targetRepo: 'repo-with-lfs',
    },
    sourceClient: new MockLfsReadAdapter(
      '*.psd filter=lfs diff=lfs merge=lfs -text\n',
    ),
    targetClient: new MockLfsReadAdapter(),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await mod.discover(ctx);
  assert.equal(discovered.repo, 'repo-with-lfs');
  assert.equal(discovered.hasLfs, true);
  assert.equal(discovered.objects.length, 1);
  assert.equal(discovered.objects[0]?.oid, 'a'.repeat(64));
});

test('LfsMigrationModule plan diffs objects via Batch API handshake', async () => {
  const existingOid = '1'.repeat(64);
  const missingOid = '2'.repeat(64);

  const streamer = new MockLfsStreamer(new Set([existingOid]));
  const mod = new LfsMigrationModule({ streamer });

  const sourceData = {
    repo: 'test-repo',
    hasLfs: true,
    objects: [
      { oid: existingOid, size: 500 },
      { oid: missingOid, size: 1500 },
    ],
  };

  const ctx: MigrationContext = {
    runId: 'run-plan',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockLfsReadAdapter(),
    targetClient: new MockLfsReadAdapter(),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = await mod.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'lfs');
  assert.equal(plan.operations.length, 2);

  const noopOp = plan.operations.find((op) => op.resourceName === existingOid);
  assert.ok(noopOp);
  assert.equal(noopOp.operation, 'noop');

  const createOp = plan.operations.find((op) => op.resourceName === missingOid);
  assert.ok(createOp);
  assert.equal(createOp.operation, 'create');
  assert.equal((createOp.payload as { size: number }).size, 1500);
});

test('LfsMigrationModule apply executes dryRun without mutations and live streaming transfers', async () => {
  const streamer = new MockLfsStreamer();
  const mod = new LfsMigrationModule({ streamer });

  const dryCtx: MigrationContext = {
    runId: 'run-dry',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockLfsReadAdapter(),
    targetClient: new MockLfsReadAdapter(),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'lfs',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'lfs-object',
        resourceName: 'a'.repeat(64),
        operation: 'create' as const,
        payload: {
          oid: 'a'.repeat(64),
          size: 2048,
          uploadAction: { href: 'https://upload.example.com/a' },
          sourceDownloadUrl: 'https://download.example.com/a',
        },
      },
    ],
    warnings: [],
  };

  const dryResult = await mod.apply(dryCtx, plan);
  assert.equal(dryResult.status, 'complete');
  assert.equal(streamer.transferred.length, 0); // No transfers in dryRun

  // Live run
  const liveCtx: MigrationContext = {
    ...dryCtx,
    dryRun: false,
  };

  const liveResult = await mod.apply(liveCtx, plan);
  assert.equal(liveResult.status, 'complete');
  assert.equal(streamer.transferred.length, 1);
  assert.equal(streamer.transferred[0]?.oid, 'a'.repeat(64));
  assert.equal(streamer.transferred[0]?.size, 2048);
});

test('LfsMigrationModule verify audits target LFS availability and reports discrepancies', async () => {
  const existingOid = '1'.repeat(64);
  const missingOid = '2'.repeat(64);

  // Set up streamer where missingOid returns 404 error on verify download
  const streamer = new MockLfsStreamer(new Set([existingOid]), true);
  const mod = new LfsMigrationModule({ streamer });

  const ctx: MigrationContext = {
    runId: 'run-verify',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockLfsReadAdapter(),
    targetClient: new MockLfsReadAdapter(),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'lfs',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'lfs-object',
        resourceName: existingOid,
        operation: 'noop' as const,
        sourceState: { oid: existingOid, size: 500 },
      },
      {
        id: 'op-2',
        resourceType: 'lfs-object',
        resourceName: missingOid,
        operation: 'create' as const,
        sourceState: { oid: missingOid, size: 1000 },
      },
    ],
    warnings: [],
  };

  const verifyResult = await mod.verify(ctx, plan);
  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.discrepancies.length, 1);
  assert.equal(verifyResult.discrepancies[0]?.resourceName, missingOid);
  assert.match(
    verifyResult.discrepancies[0]?.message ?? '',
    /missing or unverified/,
  );
});
