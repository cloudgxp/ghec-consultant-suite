import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ActionsPoliciesMigrationModule,
  type ActionsPoliciesData,
  type MigrationContext,
  type RawActionsPermissionsResponse,
  type RawSelectedActionsResponse,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  constructor(
    private readonly permissions: RawActionsPermissionsResponse,
    private readonly selectedActions?: RawSelectedActionsResponse,
  ) {}

  async readSingle<T>(op: {
    path: string;
  }): Promise<{ data: T; status: number; observedAt: string }> {
    if (op.path.includes('/selected-actions')) {
      return {
        data: (this.selectedActions ?? {}) as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    return {
      data: this.permissions as unknown as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    throw new Error('Not implemented in mock');
  }

  async fetchAll<T>(): Promise<{
    items: T[];
    totalCount?: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented in mock');
  }

  async graphql<T>(): Promise<GraphQLResponse<T>> {
    throw new Error('Not implemented in mock');
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly mutations: TargetWriteOperation[] = [];

  async mutate(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: unknown }> {
    this.mutations.push(op);
    return { status: 200, data: { ok: true } };
  }
}

function createContext(
  sourcePerms: RawActionsPermissionsResponse,
  sourceSelected?: RawSelectedActionsResponse,
  targetPerms: RawActionsPermissionsResponse = {},
  targetSelected?: RawSelectedActionsResponse,
  writeClient?: TargetWriteClient,
  dryRun = false,
): { ctx: MigrationContext; writeClient: MockWriteClient } {
  const writer = (writeClient ?? new MockWriteClient()) as MockWriteClient;
  const ctx: MigrationContext = {
    scope: {
      sourceOrg: 'source-org',
      targetOrg: 'target-emu-org',
    },
    sourceClient: new MockReadAdapter(sourcePerms, sourceSelected),
    targetClient: new MockReadAdapter(targetPerms, targetSelected),
    targetWriteClient: writer,
    dryRun,
    continueOnError: false,
    signal: new AbortController().signal,
  };
  return { ctx, writeClient: writer };
}

test('ActionsPoliciesMigrationModule - discover extracts permissions and selected-actions allowlist', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const rawPerms: RawActionsPermissionsResponse = {
    enabled_repositories: 'selected',
    allowed_actions: 'selected',
  };
  const rawSelected: RawSelectedActionsResponse = {
    github_owned_allowed: true,
    verified_allowed: true,
    patterns_allowed: ['actions/*', 'github/*'],
  };

  const { ctx } = createContext(rawPerms, rawSelected);
  const data = await module.discover(ctx);

  assert.equal(data.organization, 'source-org');
  assert.equal(data.permissions.enabled_repositories, 'selected');
  assert.equal(data.permissions.allowed_actions, 'selected');
  assert.equal(data.permissions.selected_actions?.github_owned_allowed, true);
  assert.equal(data.permissions.selected_actions?.verified_allowed, true);
  assert.deepEqual(data.permissions.selected_actions?.patterns_allowed, [
    'actions/*',
    'github/*',
  ]);
});

test('ActionsPoliciesMigrationModule - plan generates operations when permissions differ', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const sourcePerms: RawActionsPermissionsResponse = {
    enabled_repositories: 'all',
    allowed_actions: 'local_only',
  };
  const targetPerms: RawActionsPermissionsResponse = {
    enabled_repositories: 'none',
    allowed_actions: 'all',
  };

  const { ctx } = createContext(sourcePerms, undefined, targetPerms);
  const discovered: ActionsPoliciesData = {
    organization: 'source-org',
    permissions: {
      enabled_repositories: 'all',
      allowed_actions: 'local_only',
    },
  };

  const plan = await module.plan(ctx, discovered);

  assert.equal(plan.operations.length, 2);
  assert.ok(plan.operations.some((op) => op.id.includes('enabled-repos')));
  assert.ok(plan.operations.some((op) => op.id.includes('allowed-actions')));
});

test('ActionsPoliciesMigrationModule - plan generates noop when permissions match', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const perms: RawActionsPermissionsResponse = {
    enabled_repositories: 'all',
    allowed_actions: 'all',
  };

  const { ctx } = createContext(perms, undefined, perms);
  const discovered: ActionsPoliciesData = {
    organization: 'source-org',
    permissions: {
      enabled_repositories: 'all',
      allowed_actions: 'all',
    },
  };

  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]?.operation, 'noop');
});

test('ActionsPoliciesMigrationModule - apply dry-run produces zero write mutations', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const { ctx, writeClient } = createContext(
    {},
    undefined,
    {},
    undefined,
    undefined,
    true,
  );

  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'actions-policy',
        resourceName: 'target-emu-org:enabled-repositories',
        operation: 'update' as const,
        payload: {
          enabled_repositories: 'all',
          allowed_actions: 'all',
        },
      },
    ],
    warnings: [],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.mutations.length, 0);
  assert.equal(result.results[0]?.httpStatus, 200);
});

test('ActionsPoliciesMigrationModule - apply live executes PUT mutations for general and selected actions', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const { ctx, writeClient } = createContext(
    {},
    undefined,
    {},
    undefined,
    undefined,
    false,
  );

  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'actions-policy',
        resourceName: 'target-emu-org:allowed-actions',
        operation: 'update' as const,
        payload: {
          enabled_repositories: 'all',
          allowed_actions: 'selected',
          selected_actions: {
            github_owned_allowed: true,
            patterns_allowed: ['actions/*'],
          },
        },
      },
    ],
    warnings: [],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.mutations.length, 2);

  const generalMut = writeClient.mutations[0];
  assert.ok(generalMut);
  assert.equal(generalMut.method, 'PUT');
  assert.equal(generalMut.path, '/orgs/{org}/actions/permissions');
  assert.deepEqual(generalMut.body, {
    enabled_repositories: 'all',
    allowed_actions: 'selected',
  });

  const selMut = writeClient.mutations[1];
  assert.ok(selMut);
  assert.equal(selMut.method, 'PUT');
  assert.equal(selMut.path, '/orgs/{org}/actions/permissions/selected-actions');
  assert.deepEqual(selMut.body, {
    github_owned_allowed: true,
    patterns_allowed: ['actions/*'],
  });
});

test('ActionsPoliciesMigrationModule - verify succeeds when destination matches planned configuration', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const targetPerms: RawActionsPermissionsResponse = {
    enabled_repositories: 'all',
    allowed_actions: 'local_only',
  };

  const { ctx } = createContext({}, undefined, targetPerms);
  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'actions-policy',
        resourceName: 'target-emu-org:allowed-actions',
        operation: 'update' as const,
        payload: {
          enabled_repositories: 'all',
          allowed_actions: 'local_only',
        },
      },
    ],
    warnings: [],
  };

  const verification = await module.verify(ctx, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});

test('ActionsPoliciesMigrationModule - verify detects discrepancy when destination differs', async () => {
  const module = new ActionsPoliciesMigrationModule();
  const targetPerms: RawActionsPermissionsResponse = {
    enabled_repositories: 'all',
    allowed_actions: 'all',
  };

  const { ctx } = createContext({}, undefined, targetPerms);
  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'actions-policy',
        resourceName: 'target-emu-org:allowed-actions',
        operation: 'update' as const,
        payload: {
          enabled_repositories: 'all',
          allowed_actions: 'local_only',
        },
      },
    ],
    warnings: [],
  };

  const verification = await module.verify(ctx, plan);
  assert.equal(verification.verified, false);
  assert.equal(verification.discrepancies.length, 1);
  assert.match(
    verification.discrepancies[0]?.message ?? '',
    /allowed_actions mismatch/,
  );
});
