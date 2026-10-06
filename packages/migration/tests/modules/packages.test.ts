import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  PackagesMigrationModule,
  createDefaultModuleRegistry,
  type MigrationContext,
  type RegistryClientInterface,
  type MigrationPackageVersion,
  type PackageType,
} from '../../src/index.js';
import type {
  RawApiPackage,
  RawApiPackageVersion,
} from '../../src/modules/packages/types.js';

class MockPackageReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(
    private readonly packages: RawApiPackage[] = [],
    private readonly versions: RawApiPackageVersion[] = [],
  ) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.packages as unknown as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(
    operation: ReadOperation,
  ): Promise<{ items: readonly T[]; observedAt: string; complete: boolean }> {
    if (operation.path.includes('/versions')) {
      return {
        items: this.versions as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }
    // Filter packages matching package_type query param if present
    const pt = (operation.queryParams as { package_type?: string } | undefined)
      ?.package_type;
    const filtered = pt
      ? this.packages.filter((p) => p.package_type === pt)
      : this.packages;
    return {
      items: filtered as unknown as readonly T[],
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

class MockRegistryClient implements RegistryClientInterface {
  readonly containerCalls: Array<{
    sourceOrg: string;
    targetOrg: string;
    imageName: string;
    version: MigrationPackageVersion;
  }> = [];

  readonly languageCalls: Array<{
    sourceOrg: string;
    targetOrg: string;
    packageName: string;
    packageType: PackageType;
    version: MigrationPackageVersion;
  }> = [];

  async replicateContainerVersion(
    sourceOrg: string,
    targetOrg: string,
    imageName: string,
    version: MigrationPackageVersion,
  ): Promise<{
    status: number;
    layersReplicated: number;
    manifestDigest: string;
  }> {
    this.containerCalls.push({ sourceOrg, targetOrg, imageName, version });
    return {
      status: 201,
      layersReplicated: 2,
      manifestDigest: 'sha256:manifest123',
    };
  }

  async replicateLanguagePackage(
    sourceOrg: string,
    targetOrg: string,
    packageName: string,
    packageType: PackageType,
    version: MigrationPackageVersion,
  ): Promise<{ status: number }> {
    this.languageCalls.push({
      sourceOrg,
      targetOrg,
      packageName,
      packageType,
      version,
    });
    return { status: 201 };
  }
}

test('PackagesMigrationModule registers in ModuleRegistry with id packages and dependencies', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('packages');
  assert.ok(mod);
  assert.equal(mod.id, 'packages');
  assert.equal(mod.displayName, 'Packages & GHCR Container Image Migration');
  assert.equal(mod.scopeLevel, 'organization');
  assert.deepEqual(mod.dependencies, ['org-variables', 'org-secrets']);
});

test('PackagesMigrationModule discover queries packages and version metadata', async () => {
  const rawPackages: RawApiPackage[] = [
    {
      id: 1,
      name: 'base-image',
      package_type: 'container',
      visibility: 'private',
      version_count: 1,
      repository: { name: 'core-infra' },
    },
  ];
  const rawVersions: RawApiPackageVersion[] = [
    {
      id: 10,
      name: 'sha256:11112222',
      metadata: {
        container: { tags: ['latest', 'v1.0.0'] },
      },
    },
  ];

  const mod = new PackagesMigrationModule();
  const ctx: MigrationContext = {
    runId: 'run-disc',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockPackageReadAdapter(rawPackages, rawVersions),
    targetClient: new MockPackageReadAdapter(),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await mod.discover(ctx);
  assert.equal(discovered.org, 'src-org');
  assert.equal(discovered.packages.length, 1);
  assert.equal(discovered.packages[0]?.name, 'base-image');
  assert.equal(discovered.packages[0]?.packageType, 'container');
  assert.equal(discovered.packages[0]?.versions.length, 1);
  assert.deepEqual(discovered.packages[0]?.versions[0]?.tags, [
    'latest',
    'v1.0.0',
  ]);
});

test('PackagesMigrationModule plan diffs versions and tags', async () => {
  const mod = new PackagesMigrationModule();

  const sourceData = {
    org: 'src-org',
    packages: [
      {
        id: 1,
        name: 'app-service',
        packageType: 'container' as const,
        visibility: 'internal' as const,
        repositoryName: 'app-repo',
        versions: [
          { id: 10, name: 'v1.0.0', tags: ['v1.0.0'] },
          { id: 11, name: 'v2.0.0', tags: ['v2.0.0'] },
        ],
      },
    ],
  };

  // Target already has app-service with v1.0.0, missing v2.0.0
  const targetPackages: RawApiPackage[] = [
    { id: 100, name: 'app-service', package_type: 'container' },
  ];
  const targetVersions: RawApiPackageVersion[] = [
    { id: 101, name: 'v1.0.0', metadata: { container: { tags: ['v1.0.0'] } } },
  ];

  const ctx: MigrationContext = {
    runId: 'run-plan',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockPackageReadAdapter(),
    targetClient: new MockPackageReadAdapter(targetPackages, targetVersions),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = await mod.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'packages');
  assert.equal(plan.operations.length, 2);

  const noopOp = plan.operations.find(
    (op) => op.resourceName === 'app-service@v1.0.0',
  );
  assert.ok(noopOp);
  assert.equal(noopOp.operation, 'noop');

  const createOp = plan.operations.find(
    (op) => op.resourceName === 'app-service@v2.0.0',
  );
  assert.ok(createOp);
  assert.equal(createOp.operation, 'create');
});

test('PackagesMigrationModule apply executes dryRun without mutations and live replications', async () => {
  const registryClient = new MockRegistryClient();
  const mod = new PackagesMigrationModule({ registryClient });

  const dryCtx: MigrationContext = {
    runId: 'run-dry',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockPackageReadAdapter(),
    targetClient: new MockPackageReadAdapter(),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'packages',
    scopeLevel: 'organization' as const,
    targetIdentifier: 'dst-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'package-version',
        resourceName: 'my-lib@1.0.0',
        operation: 'create' as const,
        payload: {
          packageName: 'my-lib',
          packageType: 'npm' as const,
          versionName: '1.0.0',
          tags: ['1.0.0'],
        },
      },
      {
        id: 'op-2',
        resourceType: 'package-version',
        resourceName: 'my-app@latest',
        operation: 'create' as const,
        payload: {
          packageName: 'my-app',
          packageType: 'container' as const,
          versionName: 'latest',
          tags: ['latest'],
        },
      },
    ],
    warnings: [],
  };

  const dryResult = await mod.apply(dryCtx, plan);
  assert.equal(dryResult.status, 'complete');
  assert.equal(registryClient.containerCalls.length, 0);
  assert.equal(registryClient.languageCalls.length, 0);

  // Live run
  const liveCtx: MigrationContext = {
    ...dryCtx,
    dryRun: false,
  };

  const liveResult = await mod.apply(liveCtx, plan);
  assert.equal(liveResult.status, 'complete');
  assert.equal(registryClient.languageCalls.length, 1);
  assert.equal(registryClient.containerCalls.length, 1);
  assert.equal(registryClient.containerCalls[0]?.imageName, 'my-app');
  assert.equal(registryClient.languageCalls[0]?.packageName, 'my-lib');
});

test('PackagesMigrationModule verify detects missing package versions', async () => {
  const mod = new PackagesMigrationModule();

  // Target has my-app with v1.0.0, but missing v2.0.0
  const targetPackages: RawApiPackage[] = [
    { id: 1, name: 'my-app', package_type: 'container' },
  ];
  const targetVersions: RawApiPackageVersion[] = [
    { id: 10, name: 'v1.0.0', metadata: { container: { tags: ['v1.0.0'] } } },
  ];

  const ctx: MigrationContext = {
    runId: 'run-verify',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockPackageReadAdapter(),
    targetClient: new MockPackageReadAdapter(targetPackages, targetVersions),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'packages',
    scopeLevel: 'organization' as const,
    targetIdentifier: 'dst-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'package-version',
        resourceName: 'my-app@v2.0.0',
        operation: 'create' as const,
        payload: {
          packageName: 'my-app',
          packageType: 'container' as const,
          versionName: 'v2.0.0',
          tags: ['v2.0.0'],
        },
      },
    ],
    warnings: [],
  };

  const verifyResult = await mod.verify(ctx, plan);
  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.discrepancies.length, 1);
  assert.match(
    verifyResult.discrepancies[0]?.message ?? '',
    /missing on target organization/,
  );
});
