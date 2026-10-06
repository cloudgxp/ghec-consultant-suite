import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  ReleasesMigrationModule,
  createDefaultModuleRegistry,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type { RawApiRelease } from '../../src/modules/releases/types.js';

class MockReleaseReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(private readonly releases: RawApiRelease[]) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.releases as unknown as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    return {
      items: this.releases as unknown as readonly T[],
      observedAt: new Date().toISOString(),
      complete: true,
    };
  }

  async readPage<T>(): Promise<{
    items: readonly T[];
    nextCursor: string | null;
    status: number;
    observedAt: string;
  }> {
    return {
      items: this.releases as unknown as readonly T[],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async queryGraphQL<T>(): Promise<{ data: T; observedAt: string }> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: this.releases as unknown as T, status: 200 };
  }
}

class MockReleaseWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return { status: 201, data: { id: 101 } as unknown as T };
  }
}

test('ReleasesMigrationModule registers in ModuleRegistry with id releases and gei-repo dependency', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('releases');
  assert.ok(mod);
  assert.equal(mod.id, 'releases');
  assert.equal(mod.displayName, 'Releases & Release Assets Migration');
  assert.equal(mod.scopeLevel, 'repository');
  assert.deepEqual(mod.dependencies, ['gei-repo']);
});

test('ReleasesMigrationModule discover reads releases and assets', async () => {
  const sampleReleases: RawApiRelease[] = [
    {
      id: 1,
      tag_name: 'v1.0.0',
      target_commitish: 'main',
      name: 'Release 1.0.0',
      body: 'First release',
      draft: false,
      prerelease: false,
      created_at: '2026-01-01T00:00:00Z',
      published_at: '2026-01-01T01:00:00Z',
      assets: [
        {
          id: 11,
          name: 'binary.tar.gz',
          size: 1024,
          content_type: 'application/gzip',
          browser_download_url:
            'https://github.com/src/repo/releases/download/v1.0.0/binary.tar.gz',
        },
      ],
    },
  ];

  const mod = new ReleasesMigrationModule();
  const ctx: MigrationContext = {
    runId: 'run-1',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockReleaseReadAdapter(sampleReleases),
    targetClient: new MockReleaseReadAdapter([]),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await mod.discover(ctx);
  assert.equal(discovered.repo, 'test-repo');
  assert.equal(discovered.releases.length, 1);
  assert.equal(discovered.releases[0]?.tagName, 'v1.0.0');
  assert.equal(discovered.releases[0]?.assets.length, 1);
  assert.equal(discovered.releases[0]?.assets[0]?.name, 'binary.tar.gz');
});

test('ReleasesMigrationModule plan detects missing releases and assets', async () => {
  const mod = new ReleasesMigrationModule();
  const sourceReleases: RawApiRelease[] = [
    {
      id: 1,
      tag_name: 'v1.0.0',
      target_commitish: 'main',
      name: 'Release 1.0.0',
      assets: [
        {
          id: 11,
          name: 'app.zip',
          size: 500,
          browser_download_url: 'https://example.com/app.zip',
        },
      ],
    },
    {
      id: 2,
      tag_name: 'v2.0.0',
      target_commitish: 'main',
      assets: [
        {
          id: 12,
          name: 'app-v2.zip',
          size: 1000,
          browser_download_url: 'https://example.com/v2.zip',
        },
      ],
    },
  ];

  // Target already has v1.0.0 with app.zip, but missing v2.0.0
  const targetReleases: RawApiRelease[] = [
    {
      id: 10,
      tag_name: 'v1.0.0',
      target_commitish: 'main',
      name: 'Release 1.0.0',
      assets: [{ id: 110, name: 'app.zip', size: 500 }],
    },
  ];

  const ctx: MigrationContext = {
    runId: 'run-plan',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockReleaseReadAdapter(sourceReleases),
    targetClient: new MockReleaseReadAdapter(targetReleases),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await mod.discover(ctx);
  const plan = await mod.plan(ctx, discovered);

  assert.equal(plan.moduleId, 'releases');
  // v1.0.0 release is noop, v1.0.0 app.zip is noop
  // v2.0.0 release is create, v2.0.0 app-v2.zip is create
  const createOps = plan.operations.filter((op) => op.operation === 'create');
  const noopOps = plan.operations.filter((op) => op.operation === 'noop');

  assert.equal(createOps.length, 2); // v2.0.0 release and its asset
  assert.equal(noopOps.length, 2); // v1.0.0 release and its asset
});

test('ReleasesMigrationModule apply with dryRun: true executes without mutations', async () => {
  const mod = new ReleasesMigrationModule();
  const writeClient = new MockReleaseWriteClient();

  const ctx: MigrationContext = {
    runId: 'run-dry',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockReleaseReadAdapter([]),
    targetClient: new MockReleaseReadAdapter([]),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'releases',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'release:test-repo:v1.0.0',
        resourceType: 'release',
        resourceName: 'v1.0.0',
        operation: 'create' as const,
        payload: { tag_name: 'v1.0.0' },
      },
    ],
    warnings: [],
  };

  const result = await mod.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.status, 'succeeded');
  assert.equal(writeClient.calls.length, 0); // Zero mutations!
});

test('ReleasesMigrationModule verify detects missing releases and asset mismatches', async () => {
  const mod = new ReleasesMigrationModule();
  // Target only has v1.0.0, missing v2.0.0
  const targetReleases: RawApiRelease[] = [
    {
      id: 10,
      tag_name: 'v1.0.0',
      assets: [{ id: 101, name: 'asset.tar.gz', size: 100 }],
    },
  ];

  const ctx: MigrationContext = {
    runId: 'run-verify',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockReleaseReadAdapter([]),
    targetClient: new MockReleaseReadAdapter(targetReleases),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'releases',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'release',
        resourceName: 'v2.0.0',
        operation: 'create' as const,
      },
      {
        id: 'op-2',
        resourceType: 'release-asset',
        resourceName: 'v1.0.0/asset.tar.gz',
        operation: 'create' as const,
        payload: {
          asset: {
            id: 1,
            name: 'asset.tar.gz',
            size: 200,
            contentType: '',
            downloadUrl: '',
          },
        },
      },
    ],
    warnings: [],
  };

  const verifyResult = await mod.verify(ctx, plan);
  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.discrepancies.length, 2);
  assert.match(
    verifyResult.discrepancies[0]?.message ?? '',
    /missing on target repository/,
  );
  assert.match(
    verifyResult.discrepancies[1]?.message ?? '',
    /byte size mismatch/,
  );
});
