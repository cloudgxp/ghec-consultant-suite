import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IpAllowListsMigrationModule,
  type IpAllowListsData,
  type RawGraphQLIpAllowListResponse,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type { MigrationContext } from '../../src/core/types.js';
import type {
  EndpointProbeResult,
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockGraphQLReadAdapter implements GitHubReadAdapter {
  constructor(private readonly graphQLData: unknown) {}

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    if (this.graphQLData instanceof Error) {
      throw this.graphQLData;
    }
    return {
      data: this.graphQLData as T,
      observedAt: new Date().toISOString(),
    };
  }

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented in mock');
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

  async probeEndpoint(): Promise<EndpointProbeResult> {
    return { status: 200 };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly mutations: TargetWriteOperation[] = [];
  shouldFail = false;

  async mutate(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: unknown }> {
    if (this.shouldFail) {
      throw new Error(`Simulated mutation failure for ${op.id}`);
    }
    this.mutations.push(op);
    return { status: 200, data: { id: 'entry-123' } };
  }
}

function createContext(
  sourceGraphQL: unknown,
  targetGraphQL: unknown,
  writeClient?: TargetWriteClient,
  dryRun = false,
  continueOnError = false,
): { ctx: MigrationContext; writeClient: MockWriteClient } {
  const writer = (writeClient ?? new MockWriteClient()) as MockWriteClient;
  const ctx: MigrationContext = {
    runId: 'test-run-123',
    scope: {
      level: 'organization',
      sourceOrg: 'source-corp',
      targetOrg: 'target-emu-corp',
    },
    sourceClient: new MockGraphQLReadAdapter(sourceGraphQL),
    targetClient: new MockGraphQLReadAdapter(targetGraphQL),
    targetWriteClient: writer,
    dryRun,
    continueOnError,
    signal: new AbortController().signal,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  return { ctx, writeClient: writer };
}

describe('IpAllowListsMigrationModule', () => {
  it('instantiates and provides valid metadata', () => {
    const mod = new IpAllowListsMigrationModule();
    assert.equal(mod.id, 'ip-allow-lists');
    assert.equal(mod.displayName, 'IP Allow Lists');
    assert.equal(mod.scopeLevel, 'organization');
    assert.deepEqual(mod.dependencies, ['org-settings']);
  });

  it('discover queries GraphQL and parses IP allow list entries', async () => {
    const rawGraphQL: RawGraphQLIpAllowListResponse = {
      organization: {
        id: 'MDEyOk9yZ2FuaXphdGlvbjEyMw==',
        ipAllowListEntries: {
          nodes: [
            {
              id: 'IP_1',
              name: 'Corporate VPN',
              cidr: '192.168.1.0/24',
              isActive: true,
            },
            {
              id: 'IP_2',
              name: 'Secondary Office',
              cidr: '10.0.0.0/16',
              isActive: false,
            },
          ],
        },
      },
    };

    const mod = new IpAllowListsMigrationModule();
    const { ctx } = createContext(rawGraphQL, null);
    const discovered = await mod.discover(ctx);

    assert.equal(discovered.organization, 'source-corp');
    assert.equal(discovered.ownerId, 'MDEyOk9yZ2FuaXphdGlvbjEyMw==');
    assert.equal(discovered.entries.length, 2);
    assert.equal(discovered.entries[0].name, 'Corporate VPN');
    assert.equal(discovered.entries[0].cidr, '192.168.1.0/24');
    assert.equal(discovered.entries[0].isActive, true);
    assert.equal(discovered.entries[1].isActive, false);
  });

  it('discover handles error properly with descriptive cause', async () => {
    const mod = new IpAllowListsMigrationModule();
    const { ctx } = createContext(
      new Error('GraphQL connection refused'),
      null,
    );
    await assert.rejects(
      () => mod.discover(ctx),
      /Failed to discover IP allow list entries for source-corp: GraphQL connection refused/,
    );
  });

  it('plan generates create, update, and noop operations with warning', async () => {
    const mod = new IpAllowListsMigrationModule();
    const sourceData: IpAllowListsData = {
      organization: 'source-corp',
      ownerId: 'src-org-id',
      entries: [
        {
          name: 'HQ Office',
          cidr: '192.168.1.0/24',
          isActive: true,
        },
        {
          name: 'Branch Office',
          cidr: '10.0.0.0/16',
          isActive: true, // target has isActive: false, so should update
        },
        {
          name: 'Datacenter',
          cidr: '172.16.0.0/12',
          isActive: true, // target does not have this, so should create
        },
      ],
    };

    const targetGraphQL: RawGraphQLIpAllowListResponse = {
      organization: {
        id: 'tgt-org-id',
        ipAllowListEntries: {
          nodes: [
            {
              id: 'IP_TGT_1',
              name: 'HQ Office',
              cidr: '192.168.1.0/24',
              isActive: true, // matches
            },
            {
              id: 'IP_TGT_2',
              name: 'Branch Office',
              cidr: '10.0.0.0/16',
              isActive: false, // differs
            },
          ],
        },
      },
    };

    const { ctx } = createContext(null, targetGraphQL);
    const plan = await mod.plan(ctx, sourceData);

    assert.equal(plan.moduleId, 'ip-allow-lists');
    assert.equal(plan.operations.length, 3);
    assert.ok(plan.warnings.some((w) => w.includes('migration and webhook')));

    const noopOp = plan.operations.find(
      (o) => o.resourceName === '192.168.1.0/24',
    );
    assert.ok(noopOp);
    assert.equal(noopOp.operation, 'noop');

    const updateOp = plan.operations.find(
      (o) => o.resourceName === '10.0.0.0/16',
    );
    assert.ok(updateOp);
    assert.equal(updateOp.operation, 'update');

    const createOp = plan.operations.find(
      (o) => o.resourceName === '172.16.0.0/12',
    );
    assert.ok(createOp);
    assert.equal(createOp.operation, 'create');
  });

  it('apply executes GraphQL mutations and honors dryRun', async () => {
    const mod = new IpAllowListsMigrationModule();
    const sourceData: IpAllowListsData = {
      organization: 'source-corp',
      entries: [
        {
          name: 'New CIDR',
          cidr: '192.168.100.0/24',
          isActive: true,
        },
      ],
    };

    // Dry Run
    const { ctx: dryCtx, writeClient: dryWriter } = createContext(
      null,
      { organization: { id: 'tgt-id', ipAllowListEntries: { nodes: [] } } },
      undefined,
      true,
    );
    const plan = await mod.plan(dryCtx, sourceData);
    const dryResult = await mod.apply(dryCtx, plan);

    assert.equal(dryResult.status, 'complete');
    assert.equal(dryWriter.mutations.length, 0);

    // Live Run
    const { ctx: liveCtx, writeClient: liveWriter } = createContext(
      null,
      { organization: { id: 'tgt-id', ipAllowListEntries: { nodes: [] } } },
      undefined,
      false,
    );
    const liveResult = await mod.apply(liveCtx, plan);

    assert.equal(liveResult.status, 'complete');
    assert.equal(liveWriter.mutations.length, 1);
    assert.equal(liveWriter.mutations[0].method, 'POST');
    assert.equal(liveWriter.mutations[0].path, '/graphql');
  });

  it('verify reports verified=true when all CIDR entries match', async () => {
    const mod = new IpAllowListsMigrationModule();
    const sourceData: IpAllowListsData = {
      organization: 'source-corp',
      entries: [
        {
          name: 'Allowed VPN',
          cidr: '192.168.1.0/24',
          isActive: true,
        },
      ],
    };

    const targetGraphQL: RawGraphQLIpAllowListResponse = {
      organization: {
        id: 'tgt-org-id',
        ipAllowListEntries: {
          nodes: [
            {
              id: 'IP_1',
              name: 'Allowed VPN',
              cidr: '192.168.1.0/24',
              isActive: true,
            },
          ],
        },
      },
    };

    const { ctx } = createContext(null, targetGraphQL);
    const plan = await mod.plan(ctx, sourceData);
    const result = await mod.verify(ctx, plan);

    assert.equal(result.verified, true);
    assert.equal(result.discrepancies.length, 0);
  });

  it('verify reports discrepancies on missing entries or isActive mismatch', async () => {
    const mod = new IpAllowListsMigrationModule();
    const sourceData: IpAllowListsData = {
      organization: 'source-corp',
      entries: [
        {
          name: 'Entry 1',
          cidr: '192.168.1.0/24',
          isActive: true,
        },
        {
          name: 'Missing Entry',
          cidr: '10.0.0.0/8',
          isActive: true,
        },
      ],
    };

    const targetGraphQL: RawGraphQLIpAllowListResponse = {
      organization: {
        id: 'tgt-org-id',
        ipAllowListEntries: {
          nodes: [
            {
              id: 'IP_1',
              name: 'Entry 1',
              cidr: '192.168.1.0/24',
              isActive: false, // mismatch
            },
          ],
        },
      },
    };

    const { ctx } = createContext(null, targetGraphQL);
    const plan = await mod.plan(ctx, sourceData);
    const result = await mod.verify(ctx, plan);

    assert.equal(result.verified, false);
    assert.equal(result.discrepancies.length, 2);
  });
});
