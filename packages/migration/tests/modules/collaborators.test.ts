import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  CollaboratorsMigrationModule,
  createDefaultModuleRegistry,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type { RawApiCollaborator } from '../../src/modules/collaborators/types.js';

class MockCollaboratorReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(private readonly collaborators: RawApiCollaborator[]) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.collaborators as unknown as T,
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
      items: this.collaborators as unknown as readonly T[],
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
      items: this.collaborators as unknown as readonly T[],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async queryGraphQL<T>(): Promise<{ data: T; observedAt: string }> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: this.collaborators as unknown as T, status: 200 };
  }
}

class MockCollaboratorWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  constructor(private readonly respondWithStatus: number = 204) {}

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return { status: this.respondWithStatus, data: {} as T };
  }
}

test('CollaboratorsMigrationModule registers in ModuleRegistry with id collaborators and gei-repo dependency', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('collaborators');
  assert.ok(mod);
  assert.equal(mod.id, 'collaborators');
  assert.equal(
    mod.displayName,
    'Outside Collaborators & Direct Permissions Rehydration',
  );
  assert.equal(mod.scopeLevel, 'repository');
  assert.deepEqual(mod.dependencies, ['gei-repo']);
});

test('CollaboratorsMigrationModule discover reads direct collaborators and maps permissions', async () => {
  const rawCollabs: RawApiCollaborator[] = [
    {
      id: 1,
      login: 'alice',
      role_name: 'admin',
    },
    {
      id: 2,
      login: 'bob',
      permissions: { push: true, pull: true },
    },
    {
      id: 3,
      login: 'carol',
      permissions: { triage: true, pull: true },
    },
  ];

  const mod = new CollaboratorsMigrationModule();
  const ctx: MigrationContext = {
    runId: 'run-disc',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockCollaboratorReadAdapter(rawCollabs),
    targetClient: new MockCollaboratorReadAdapter([]),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await mod.discover(ctx);
  assert.equal(discovered.repo, 'test-repo');
  assert.equal(discovered.collaborators.length, 3);
  assert.equal(discovered.collaborators[0]?.permission, 'admin');
  assert.equal(discovered.collaborators[1]?.permission, 'push');
  assert.equal(discovered.collaborators[2]?.permission, 'triage');
});

test('CollaboratorsMigrationModule plan maps usernames using EMU suffix and diffs operations', async () => {
  const mod = new CollaboratorsMigrationModule({
    identityMappingConfig: {
      strategy: 'emu-saml',
      suffix: '_emu',
    },
  });

  const sourceData = {
    repo: 'test-repo',
    collaborators: [
      { id: 1, login: 'alice', permission: 'admin' as const },
      { id: 2, login: 'bob', permission: 'push' as const },
      { id: 3, login: 'charlie', permission: 'pull' as const },
    ],
  };

  // Target already has alice_emu with admin (noop) and bob_emu with pull (update to push)
  // charlie_emu is missing (create)
  const targetCollabs: RawApiCollaborator[] = [
    { id: 101, login: 'alice_emu', role_name: 'admin' },
    { id: 102, login: 'bob_emu', role_name: 'pull' },
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
    sourceClient: new MockCollaboratorReadAdapter([]),
    targetClient: new MockCollaboratorReadAdapter(targetCollabs),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = await mod.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'collaborators');
  assert.equal(plan.operations.length, 3);

  const noopOp = plan.operations.find((op) => op.resourceName === 'alice_emu');
  assert.ok(noopOp);
  assert.equal(noopOp.operation, 'noop');

  const updateOp = plan.operations.find((op) => op.resourceName === 'bob_emu');
  assert.ok(updateOp);
  assert.equal(updateOp.operation, 'update');
  assert.deepEqual(updateOp.payload, { permission: 'push' });

  const createOp = plan.operations.find(
    (op) => op.resourceName === 'charlie_emu',
  );
  assert.ok(createOp);
  assert.equal(createOp.operation, 'create');
  assert.deepEqual(createOp.payload, { permission: 'pull' });
});

test('CollaboratorsMigrationModule apply simulates dry-run and executes live mutations', async () => {
  const mod = new CollaboratorsMigrationModule();
  const writeClient = new MockCollaboratorWriteClient(204);

  const dryCtx: MigrationContext = {
    runId: 'run-dry',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockCollaboratorReadAdapter([]),
    targetClient: new MockCollaboratorReadAdapter([]),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'collaborators',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'collaborator',
        resourceName: 'dev1',
        operation: 'create' as const,
        payload: { permission: 'push' as const },
      },
      {
        id: 'op-2',
        resourceType: 'collaborator',
        resourceName: 'dev2',
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
  assert.equal(
    writeClient.calls[0]?.path,
    '/repos/{owner}/{repo}/collaborators/{username}',
  );
  assert.equal(
    (writeClient.calls[0]?.pathParams as { username: string }).username,
    'dev1',
  );
});

test('CollaboratorsMigrationModule apply handles HTTP 404 and 422 gracefully', async () => {
  const mod = new CollaboratorsMigrationModule();
  const writeClient = new MockCollaboratorWriteClient(404);

  const ctx: MigrationContext = {
    runId: 'run-err',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      sourceRepo: 'test-repo',
      targetOrg: 'dst-org',
      targetRepo: 'test-repo',
    },
    sourceClient: new MockCollaboratorReadAdapter([]),
    targetClient: new MockCollaboratorReadAdapter([]),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: true,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'collaborators',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'collaborator',
        resourceName: 'ghost_user',
        operation: 'create' as const,
        payload: { permission: 'push' as const },
      },
    ],
    warnings: [],
  };

  const result = await mod.apply(ctx, plan);
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0]?.status, 'failed');
  assert.equal(result.results[0]?.httpStatus, 404);
  assert.match(result.results[0]?.error ?? '', /does not exist/);
});

test('CollaboratorsMigrationModule verify reports discrepancies for missing collaborators and permission mismatches', async () => {
  const mod = new CollaboratorsMigrationModule();
  const targetCollabs: RawApiCollaborator[] = [
    { id: 101, login: 'alice', role_name: 'pull' }, // target has pull, but plan expected push!
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
    sourceClient: new MockCollaboratorReadAdapter([]),
    targetClient: new MockCollaboratorReadAdapter(targetCollabs),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'collaborators',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/test-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'collaborator',
        resourceName: 'alice',
        operation: 'update' as const,
        payload: { permission: 'push' as const },
      },
      {
        id: 'op-2',
        resourceType: 'collaborator',
        resourceName: 'bob',
        operation: 'create' as const,
        payload: { permission: 'admin' as const },
      },
    ],
    warnings: [],
  };

  const verifyResult = await mod.verify(ctx, plan);
  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.discrepancies.length, 2);
  assert.match(
    verifyResult.discrepancies[0]?.message ?? '',
    /permission mismatch/,
  );
  assert.match(
    verifyResult.discrepancies[1]?.message ?? '',
    /missing on target repository/,
  );
});
