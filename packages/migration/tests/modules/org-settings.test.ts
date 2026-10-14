import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OrgSettingsMigrationModule,
  type MigrationContext,
  type OrgSettingsData,
  type RawOrgSettingsResponse,
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
  constructor(private readonly settings: RawOrgSettingsResponse) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.settings as unknown as T,
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
  sourceSettings: RawOrgSettingsResponse,
  targetSettings: RawOrgSettingsResponse,
  writeClient?: TargetWriteClient,
  dryRun = false,
): { ctx: MigrationContext; writeClient: MockWriteClient } {
  const writer = (writeClient ?? new MockWriteClient()) as MockWriteClient;
  const ctx: MigrationContext = {
    scope: {
      sourceOrg: 'source-org',
      targetOrg: 'target-emu-org',
    },
    sourceClient: new MockReadAdapter(sourceSettings),
    targetClient: new MockReadAdapter(targetSettings),
    targetWriteClient: writer,
    dryRun,
    continueOnError: false,
    signal: new AbortController().signal,
  };
  return { ctx, writeClient: writer };
}

test('OrgSettingsMigrationModule - discover correctly extracts and parses source org settings', async () => {
  const module = new OrgSettingsMigrationModule();
  const rawSource: RawOrgSettingsResponse = {
    name: 'Acme Corp',
    description: 'Enterprise consulting',
    default_repository_permission: 'read',
    members_can_create_repositories: true,
    members_can_create_public_repositories: false,
    members_can_create_private_repositories: true,
    members_can_fork_private_repositories: true,
    web_commit_signoff_required: true,
  };

  const { ctx } = createContext(rawSource, {});
  const data = await module.discover(ctx);

  assert.equal(data.organization, 'source-org');
  assert.equal(data.settings.name, 'Acme Corp');
  assert.equal(data.settings.default_repository_permission, 'read');
  assert.equal(data.settings.members_can_create_repositories, true);
  assert.equal(data.settings.web_commit_signoff_required, true);
});

test('OrgSettingsMigrationModule - plan generates update operation for modified settings', async () => {
  const module = new OrgSettingsMigrationModule();
  const rawSource: RawOrgSettingsResponse = {
    default_repository_permission: 'none',
    members_can_create_repositories: false,
    web_commit_signoff_required: true,
  };
  const rawTarget: RawOrgSettingsResponse = {
    default_repository_permission: 'read',
    members_can_create_repositories: true,
    web_commit_signoff_required: false,
  };

  const { ctx } = createContext(rawSource, rawTarget);
  const discovered: OrgSettingsData = {
    organization: 'source-org',
    settings: {
      default_repository_permission: 'none',
      members_can_create_repositories: false,
      web_commit_signoff_required: true,
    },
  };

  const plan = await module.plan(ctx, discovered);

  assert.equal(plan.operations.length, 1);
  const op = plan.operations[0];
  assert.ok(op);
  assert.equal(op.operation, 'update');
  assert.equal(op.resourceType, 'org-setting');

  const payload = op.payload as Record<string, unknown>;
  assert.equal(payload.default_repository_permission, 'none');
  assert.equal(payload.members_can_create_repositories, false);
  assert.equal(payload.web_commit_signoff_required, true);
});

test('OrgSettingsMigrationModule - plan enforces EMU public repo constraint with warning and clamp', async () => {
  const module = new OrgSettingsMigrationModule();
  const rawSource: RawOrgSettingsResponse = {
    members_can_create_public_repositories: true,
  };
  const rawTarget: RawOrgSettingsResponse = {
    members_can_create_public_repositories: false,
  };

  const { ctx } = createContext(rawSource, rawTarget);
  const discovered: OrgSettingsData = {
    organization: 'source-org',
    settings: {
      members_can_create_public_repositories: true,
    },
  };

  const plan = await module.plan(ctx, discovered);

  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0] ?? '', /EMU organizations disallow/);
  const op = plan.operations[0];
  assert.ok(op);
  const payload = op.payload as Record<string, unknown>;
  assert.equal(payload.members_can_create_public_repositories, false);
});

test('OrgSettingsMigrationModule - plan generates noop when settings match', async () => {
  const module = new OrgSettingsMigrationModule();
  const settings: RawOrgSettingsResponse = {
    default_repository_permission: 'read',
    web_commit_signoff_required: true,
  };

  const { ctx } = createContext(settings, settings);
  const discovered: OrgSettingsData = {
    organization: 'source-org',
    settings: {
      default_repository_permission: 'read',
      web_commit_signoff_required: true,
    },
  };

  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]?.operation, 'noop');
});

test('OrgSettingsMigrationModule - apply dry-run produces zero write mutations', async () => {
  const module = new OrgSettingsMigrationModule();
  const { ctx, writeClient } = createContext({}, {}, undefined, true);

  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'org-setting',
        resourceName: 'target-emu-org',
        operation: 'update' as const,
        payload: { default_repository_permission: 'none' },
      },
    ],
    warnings: [],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.mutations.length, 0);
  assert.equal(result.results[0]?.httpStatus, 200);
});

test('OrgSettingsMigrationModule - apply live sends PATCH /orgs/{org}', async () => {
  const module = new OrgSettingsMigrationModule();
  const { ctx, writeClient } = createContext({}, {}, undefined, false);

  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'org-setting',
        resourceName: 'target-emu-org',
        operation: 'update' as const,
        payload: {
          default_repository_permission: 'none',
          web_commit_signoff_required: true,
        },
      },
    ],
    warnings: [],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.mutations.length, 1);
  const mutation = writeClient.mutations[0];
  assert.ok(mutation);
  assert.equal(mutation.method, 'PATCH');
  assert.equal(mutation.path, '/orgs/{org}');
  assert.deepEqual(mutation.pathParams, { org: 'target-emu-org' });
  assert.deepEqual(mutation.body, {
    default_repository_permission: 'none',
    web_commit_signoff_required: true,
  });
});

test('OrgSettingsMigrationModule - verify succeeds when destination matches expected settings', async () => {
  const module = new OrgSettingsMigrationModule();
  const targetSettings: RawOrgSettingsResponse = {
    default_repository_permission: 'none',
    web_commit_signoff_required: true,
  };

  const { ctx } = createContext({}, targetSettings);
  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'org-setting',
        resourceName: 'target-emu-org',
        operation: 'update' as const,
        payload: {
          default_repository_permission: 'none',
          web_commit_signoff_required: true,
        },
      },
    ],
    warnings: [],
  };

  const verification = await module.verify(ctx, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});

test('OrgSettingsMigrationModule - verify detects discrepancy when destination setting differs', async () => {
  const module = new OrgSettingsMigrationModule();
  const targetSettings: RawOrgSettingsResponse = {
    default_repository_permission: 'read',
    web_commit_signoff_required: false,
  };

  const { ctx } = createContext({}, targetSettings);
  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'org-setting',
        resourceName: 'target-emu-org',
        operation: 'update' as const,
        payload: {
          default_repository_permission: 'none',
          web_commit_signoff_required: true,
        },
      },
    ],
    warnings: [],
  };

  const verification = await module.verify(ctx, plan);
  assert.equal(verification.verified, false);
  assert.equal(verification.discrepancies.length, 2);
  assert.ok(
    verification.discrepancies.some((d) =>
      d.message.includes('default_repository_permission'),
    ),
  );
  assert.ok(
    verification.discrepancies.some((d) =>
      d.message.includes('web_commit_signoff_required'),
    ),
  );
});
