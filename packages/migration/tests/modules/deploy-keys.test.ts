import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  DeployKeysMigrationModule,
  normalizeSshKey,
  areSshKeysEqual,
  createDefaultModuleRegistry,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type { RawApiDeployKey } from '../../src/modules/deploy-keys/types.js';

class MockDeployKeyReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(private readonly keys: RawApiDeployKey[]) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.keys as unknown as T,
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
      items: this.keys as unknown as readonly T[],
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
      items: this.keys as unknown as readonly T[],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async queryGraphQL<T>(): Promise<{ data: T; observedAt: string }> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: this.keys as unknown as T, status: 200 };
  }
}

class MockDeployKeyWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  constructor(private readonly respondWithStatus: number = 201) {}

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return {
      status: this.respondWithStatus,
      data: { id: 999 } as unknown as T,
    };
  }
}

const SAMPLE_KEY_1 =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5+kF3zP1V4M4bH3v1R8K9L7m3O9q2P1m4N8r3X4y5Z ci-deploy-key';
const SAMPLE_KEY_1_DIFF_COMMENT =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5+kF3zP1V4M4bH3v1R8K9L7m3O9q2P1m4N8r3X4y5Z diff-comment@server';
const SAMPLE_KEY_2 =
  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC8Z2e7V2x2 backup-key';

test('DeployKeysMigrationModule registers in ModuleRegistry with id deploy-keys and gei-repo dependency', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('deploy-keys');
  assert.ok(mod);
  assert.equal(mod.id, 'deploy-keys');
  assert.equal(mod.displayName, 'Repository Deploy Keys Rehydration');
  assert.equal(mod.scopeLevel, 'repository');
  assert.deepEqual(mod.dependencies, ['gei-repo']);
});

test('SSH Key normalization and comparison handles whitespace, comments, and fingerprints', () => {
  const norm1 = normalizeSshKey(SAMPLE_KEY_1);
  const norm2 = normalizeSshKey(SAMPLE_KEY_1_DIFF_COMMENT);
  assert.equal(norm1.type, 'ssh-ed25519');
  assert.equal(norm1.base64, norm2.base64);
  assert.equal(norm1.fingerprint, norm2.fingerprint);
  assert.ok(areSshKeysEqual(SAMPLE_KEY_1, SAMPLE_KEY_1_DIFF_COMMENT));

  assert.ok(!areSshKeysEqual(SAMPLE_KEY_1, SAMPLE_KEY_2));
});

test('DeployKeysMigrationModule discover reads deploy keys via sourceClient', async () => {
  const rawKeys: RawApiDeployKey[] = [
    {
      id: 1,
      key: SAMPLE_KEY_1,
      title: 'CI Deploy Key',
      read_only: false,
      verified: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const mod = new DeployKeysMigrationModule();
  const ctx: MigrationContext = {
    runId: 'run-disc',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockDeployKeyReadAdapter(rawKeys),
    targetClient: new MockDeployKeyReadAdapter([]),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await mod.discover(ctx);
  assert.equal(discovered.repo, 'test-repo');
  assert.equal(discovered.keys.length, 1);
  assert.equal(discovered.keys[0]?.title, 'CI Deploy Key');
  assert.equal(discovered.keys[0]?.readOnly, false);
});

test('DeployKeysMigrationModule plan detects missing keys, matching keys, and title collisions', async () => {
  const mod = new DeployKeysMigrationModule();

  const sourceData = {
    repo: 'test-repo',
    keys: [
      {
        id: 1,
        title: 'Key 1 (Matches Target)',
        key: SAMPLE_KEY_1,
        readOnly: true,
      },
      {
        id: 2,
        title: 'Key 2 (Missing on Target)',
        key: SAMPLE_KEY_2,
        readOnly: false,
      },
    ],
  };

  // Target already has Key 1 (with different comment)
  const targetKeys: RawApiDeployKey[] = [
    {
      id: 10,
      title: 'Existing Key 1',
      key: SAMPLE_KEY_1_DIFF_COMMENT,
      read_only: true,
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
    sourceClient: new MockDeployKeyReadAdapter([]),
    targetClient: new MockDeployKeyReadAdapter(targetKeys),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = await mod.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'deploy-keys');
  assert.equal(plan.operations.length, 2);

  const createOps = plan.operations.filter((op) => op.operation === 'create');
  const noopOps = plan.operations.filter((op) => op.operation === 'noop');
  assert.equal(createOps.length, 1);
  assert.equal(createOps[0]?.resourceName, 'Key 2 (Missing on Target)');
  assert.equal(noopOps.length, 1);
  assert.equal(noopOps[0]?.resourceName, 'Key 1 (Matches Target)');
});

test('DeployKeysMigrationModule apply executes dryRun without mutations and live mutations', async () => {
  const mod = new DeployKeysMigrationModule();
  const writeClient = new MockDeployKeyWriteClient(201);

  const dryCtx: MigrationContext = {
    runId: 'run-dry',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockDeployKeyReadAdapter([]),
    targetClient: new MockDeployKeyReadAdapter([]),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'deploy-keys',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'deploy-key',
        resourceName: 'CI Key',
        operation: 'create' as const,
        payload: { title: 'CI Key', key: SAMPLE_KEY_1, read_only: true },
      },
      {
        id: 'op-2',
        resourceType: 'deploy-key',
        resourceName: 'Existing Key',
        operation: 'noop' as const,
      },
    ],
    warnings: [],
  };

  const dryResult = await mod.apply(dryCtx, plan);
  assert.equal(dryResult.status, 'complete');
  assert.equal(writeClient.calls.length, 0); // No mutations in dry-run

  // Live run
  const liveCtx: MigrationContext = {
    ...dryCtx,
    dryRun: false,
  };

  const liveResult = await mod.apply(liveCtx, plan);
  assert.equal(liveResult.status, 'complete');
  assert.equal(writeClient.calls.length, 1);
  assert.equal(writeClient.calls[0]?.path, '/repos/{owner}/{repo}/keys');
});

test('DeployKeysMigrationModule verify detects missing keys and read-only mismatches', async () => {
  const mod = new DeployKeysMigrationModule();
  const targetKeys: RawApiDeployKey[] = [
    {
      id: 10,
      title: 'CI Key',
      key: SAMPLE_KEY_1,
      read_only: true, // target is read_only: true
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
    sourceClient: new MockDeployKeyReadAdapter([]),
    targetClient: new MockDeployKeyReadAdapter(targetKeys),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'deploy-keys',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'deploy-key',
        resourceName: 'CI Key',
        operation: 'create' as const,
        payload: { key: SAMPLE_KEY_1, read_only: false }, // expects read_only: false -> mismatch!
      },
      {
        id: 'op-2',
        resourceType: 'deploy-key',
        resourceName: 'Missing Key',
        operation: 'create' as const,
        payload: { key: SAMPLE_KEY_2, read_only: true }, // missing on target
      },
    ],
    warnings: [],
  };

  const verifyResult = await mod.verify(ctx, plan);
  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.discrepancies.length, 2);
  assert.match(
    verifyResult.discrepancies[0]?.message ?? '',
    /read_only permission mismatch/,
  );
  assert.match(
    verifyResult.discrepancies[1]?.message ?? '',
    /missing on target repository/,
  );
});
