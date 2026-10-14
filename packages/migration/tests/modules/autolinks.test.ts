import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AutolinksMigrationModule,
  type AutolinkDefinition,
  type AutolinksMigrationData,
  type MigrationContext,
  type RawAutolinkResponse,
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
  constructor(private readonly autolinks: RawAutolinkResponse[]) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.autolinks as unknown as T,
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
    return { status: 201, data: { id: 100 } };
  }
}

function createContext(
  sourceAutolinks: RawAutolinkResponse[] = [],
  targetAutolinks: RawAutolinkResponse[] = [],
  writeClient?: TargetWriteClient,
  dryRun = false,
): { ctx: MigrationContext; writeClient: MockWriteClient } {
  const writer = (writeClient ?? new MockWriteClient()) as MockWriteClient;
  const ctx: MigrationContext = {
    scope: {
      sourceOrg: 'source-org',
      sourceRepo: 'source-repo',
      targetOrg: 'target-emu-org',
      targetRepo: 'target-repo',
    },
    sourceClient: new MockReadAdapter(sourceAutolinks),
    targetClient: new MockReadAdapter(targetAutolinks),
    targetWriteClient: writer,
    dryRun,
    continueOnError: false,
    signal: new AbortController().signal,
  };
  return { ctx, writeClient: writer };
}

test('AutolinksMigrationModule - discover correctly extracts autolinks', async () => {
  const module = new AutolinksMigrationModule();
  const raw: RawAutolinkResponse[] = [
    {
      id: 1,
      key_prefix: 'JIRA-',
      url_template: 'https://jira.corp.internal/browse/<num>',
      is_alphanumeric: false,
    },
    {
      id: 2,
      key_prefix: 'SEC-',
      url_template: 'https://security.corp.internal/ticket/<num>',
      is_alphanumeric: true,
    },
  ];

  const { ctx } = createContext(raw, []);
  const data = await module.discover(ctx);

  assert.equal(data.owner, 'source-org');
  assert.equal(data.repo, 'source-repo');
  assert.equal(data.autolinks.length, 2);
  assert.equal(data.autolinks[0]?.key_prefix, 'JIRA-');
  assert.equal(data.autolinks[0]?.is_alphanumeric, false);
  assert.equal(data.autolinks[1]?.key_prefix, 'SEC-');
  assert.equal(data.autolinks[1]?.is_alphanumeric, true);
});

test('AutolinksMigrationModule - plan generates create operation for missing autolink', async () => {
  const module = new AutolinksMigrationModule();
  const sourceLinks: AutolinkDefinition[] = [
    {
      key_prefix: 'JIRA-',
      url_template: 'https://jira.corp.internal/browse/<num>',
      is_alphanumeric: true,
    },
  ];

  const { ctx } = createContext(sourceLinks, []);
  const discovered: AutolinksMigrationData = {
    owner: 'source-org',
    repo: 'source-repo',
    autolinks: sourceLinks,
  };

  const plan = await module.plan(ctx, discovered);

  assert.equal(plan.operations.length, 1);
  const op = plan.operations[0];
  assert.ok(op);
  assert.equal(op.operation, 'create');
  assert.equal(op.resourceType, 'autolink');
  const payload = op.payload as Record<string, unknown>;
  assert.equal(payload.key_prefix, 'JIRA-');
  assert.equal(payload.url_template, 'https://jira.corp.internal/browse/<num>');
});

test('AutolinksMigrationModule - plan generates noop when autolink already matches target', async () => {
  const module = new AutolinksMigrationModule();
  const existing: RawAutolinkResponse[] = [
    {
      id: 1,
      key_prefix: 'JIRA-',
      url_template: 'https://jira.corp.internal/browse/<num>',
      is_alphanumeric: true,
    },
  ];

  const { ctx } = createContext(existing, existing);
  const discovered: AutolinksMigrationData = {
    owner: 'source-org',
    repo: 'source-repo',
    autolinks: [
      {
        key_prefix: 'JIRA-',
        url_template: 'https://jira.corp.internal/browse/<num>',
        is_alphanumeric: true,
      },
    ],
  };

  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]?.operation, 'noop');
});

test('AutolinksMigrationModule - apply dry-run produces zero write mutations', async () => {
  const module = new AutolinksMigrationModule();
  const { ctx, writeClient } = createContext([], [], undefined, true);

  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org/target-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'autolink',
        resourceName: 'target-emu-org/target-repo:JIRA-',
        operation: 'create' as const,
        payload: {
          key_prefix: 'JIRA-',
          url_template: 'https://jira.corp.internal/browse/<num>',
          is_alphanumeric: true,
        },
      },
    ],
    warnings: [],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.mutations.length, 0);
  assert.equal(result.results[0]?.httpStatus, 201);
});

test('AutolinksMigrationModule - apply live executes POST /repos/{owner}/{repo}/autolinks', async () => {
  const module = new AutolinksMigrationModule();
  const { ctx, writeClient } = createContext([], [], undefined, false);

  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org/target-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'autolink',
        resourceName: 'target-emu-org/target-repo:JIRA-',
        operation: 'create' as const,
        payload: {
          key_prefix: 'JIRA-',
          url_template: 'https://jira.corp.internal/browse/<num>',
          is_alphanumeric: true,
        },
      },
    ],
    warnings: [],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.mutations.length, 1);
  const mut = writeClient.mutations[0];
  assert.ok(mut);
  assert.equal(mut.method, 'POST');
  assert.equal(mut.path, '/repos/{owner}/{repo}/autolinks');
  assert.deepEqual(mut.pathParams, {
    owner: 'target-emu-org',
    repo: 'target-repo',
  });
  assert.deepEqual(mut.body, {
    key_prefix: 'JIRA-',
    url_template: 'https://jira.corp.internal/browse/<num>',
    is_alphanumeric: true,
  });
});

test('AutolinksMigrationModule - verify succeeds when destination autolinks match expected', async () => {
  const module = new AutolinksMigrationModule();
  const targetAutolinks: RawAutolinkResponse[] = [
    {
      id: 1,
      key_prefix: 'JIRA-',
      url_template: 'https://jira.corp.internal/browse/<num>',
      is_alphanumeric: true,
    },
  ];

  const { ctx } = createContext([], targetAutolinks);
  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org/target-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'autolink',
        resourceName: 'target-emu-org/target-repo:JIRA-',
        operation: 'create' as const,
        payload: {
          key_prefix: 'JIRA-',
          url_template: 'https://jira.corp.internal/browse/<num>',
          is_alphanumeric: true,
        },
      },
    ],
    warnings: [],
  };

  const verification = await module.verify(ctx, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});

test('AutolinksMigrationModule - verify detects discrepancy when autolink is missing or mismatched', async () => {
  const module = new AutolinksMigrationModule();
  const targetAutolinks: RawAutolinkResponse[] = [
    {
      id: 1,
      key_prefix: 'JIRA-',
      url_template: 'https://wrong-jira.example.com/<num>',
      is_alphanumeric: true,
    },
  ];

  const { ctx } = createContext([], targetAutolinks);
  const plan = {
    moduleId: module.id,
    scopeLevel: module.scopeLevel,
    targetIdentifier: 'target-emu-org/target-repo',
    operations: [
      {
        id: 'op-1',
        resourceType: 'autolink',
        resourceName: 'target-emu-org/target-repo:JIRA-',
        operation: 'create' as const,
        payload: {
          key_prefix: 'JIRA-',
          url_template: 'https://jira.corp.internal/browse/<num>',
          is_alphanumeric: true,
        },
      },
      {
        id: 'op-2',
        resourceType: 'autolink',
        resourceName: 'target-emu-org/target-repo:GH-',
        operation: 'create' as const,
        payload: {
          key_prefix: 'GH-',
          url_template: 'https://github.corp.internal/issues/<num>',
          is_alphanumeric: false,
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
      d.message.includes('url_template mismatch'),
    ),
  );
  assert.ok(
    verification.discrepancies.some((d) =>
      d.message.includes("Missing autolink reference for prefix 'GH-'"),
    ),
  );
});
