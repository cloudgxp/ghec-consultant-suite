import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DiscussionsMigrationModule,
  type DiscussionsData,
  type RawGraphQLRepoDiscussionsResponse,
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
    return { status: 200, data: { id: 'disc-123' } };
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
    runId: 'test-run-disc',
    scope: {
      level: 'repository',
      sourceOrg: 'source-org',
      sourceRepo: 'source-repo',
      targetOrg: 'target-emu-org',
      targetRepo: 'target-repo',
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

describe('DiscussionsMigrationModule', () => {
  it('instantiates and provides valid metadata', () => {
    const mod = new DiscussionsMigrationModule();
    assert.equal(mod.id, 'discussions');
    assert.equal(mod.displayName, 'Repository Discussions');
    assert.equal(mod.scopeLevel, 'repository');
    assert.deepEqual(mod.dependencies, ['repo-settings']);
  });

  it('discover queries GraphQL and parses categories and discussions', async () => {
    const rawGraphQL: RawGraphQLRepoDiscussionsResponse = {
      repository: {
        id: 'REPO_123',
        hasDiscussionsEnabled: true,
        discussionCategories: {
          nodes: [
            {
              id: 'CAT_1',
              name: 'General',
              slug: 'general',
              description: 'General discussions',
              isAnswerable: false,
            },
            {
              id: 'CAT_2',
              name: 'Q&A',
              slug: 'q-a',
              description: 'Questions and answers',
              isAnswerable: true,
            },
          ],
        },
        discussions: {
          nodes: [
            {
              id: 'DISC_1',
              number: 1,
              title: 'Welcome to the project',
              body: 'Hello everyone!',
              category: { id: 'CAT_1', name: 'General', slug: 'general' },
              author: { login: 'octocat' },
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      },
    };

    const mod = new DiscussionsMigrationModule();
    const { ctx } = createContext(rawGraphQL, null);
    const discovered = await mod.discover(ctx);

    assert.equal(discovered.owner, 'source-org');
    assert.equal(discovered.repo, 'source-repo');
    assert.equal(discovered.repositoryId, 'REPO_123');
    assert.equal(discovered.hasDiscussionsEnabled, true);
    assert.equal(discovered.categories.length, 2);
    assert.equal(discovered.discussions.length, 1);
    assert.equal(discovered.discussions[0].title, 'Welcome to the project');
    assert.equal(discovered.discussions[0].author, 'octocat');
  });

  it('discover handles GraphQL failure with descriptive error', async () => {
    const mod = new DiscussionsMigrationModule();
    const { ctx } = createContext(new Error('GraphQL access forbidden'), null);
    await assert.rejects(
      () => mod.discover(ctx),
      /Failed to discover discussions for source-org\/source-repo: GraphQL access forbidden/,
    );
  });

  it('plan generates create and noop operations with author attribution header', async () => {
    const mod = new DiscussionsMigrationModule();
    const sourceData: DiscussionsData = {
      owner: 'source-org',
      repo: 'source-repo',
      hasDiscussionsEnabled: true,
      categories: [{ id: 'CAT_1', name: 'General', slug: 'general' }],
      discussions: [
        {
          id: 'D1',
          title: 'Existing Discussion',
          body: 'Already there',
          categoryName: 'General',
        },
        {
          id: 'D2',
          title: 'Migrated Discussion',
          body: 'Detailed topic content',
          categoryName: 'General',
          author: 'original-dev',
          createdAt: '2026-02-15T12:00:00Z',
        },
      ],
    };

    const targetGraphQL: RawGraphQLRepoDiscussionsResponse = {
      repository: {
        id: 'TGT_REPO_1',
        hasDiscussionsEnabled: true,
        discussionCategories: {
          nodes: [{ id: 'TGT_CAT_1', name: 'General', slug: 'general' }],
        },
        discussions: {
          nodes: [
            {
              id: 'TD1',
              title: 'Existing Discussion',
              body: 'Already there',
              category: { id: 'TGT_CAT_1', name: 'General', slug: 'general' },
            },
          ],
        },
      },
    };

    const { ctx } = createContext(null, targetGraphQL);
    const plan = await mod.plan(ctx, sourceData);

    assert.equal(plan.moduleId, 'discussions');
    assert.equal(plan.operations.length, 2);

    const noopOp = plan.operations.find(
      (o) => o.resourceName === 'Existing Discussion',
    );
    assert.ok(noopOp);
    assert.equal(noopOp.operation, 'noop');

    const createOp = plan.operations.find(
      (o) => o.resourceName === 'Migrated Discussion',
    );
    assert.ok(createOp);
    assert.equal(createOp.operation, 'create');

    const payload = createOp.payload as {
      title: string;
      body: string;
      categoryId: string;
    };
    assert.ok(payload.body.includes('Originally posted by @original-dev'));
    assert.ok(payload.body.includes('2026-02-15T12:00:00Z'));
  });

  it('apply executes GraphQL mutation and honors dryRun', async () => {
    const mod = new DiscussionsMigrationModule();
    const sourceData: DiscussionsData = {
      owner: 'source-org',
      repo: 'source-repo',
      hasDiscussionsEnabled: true,
      categories: [{ id: 'C1', name: 'General', slug: 'general' }],
      discussions: [
        {
          title: 'New Announcement',
          body: 'Announcement details',
          categoryName: 'General',
        },
      ],
    };

    const targetGraphQL: RawGraphQLRepoDiscussionsResponse = {
      repository: {
        id: 'TGT_REPO_1',
        hasDiscussionsEnabled: true,
        discussionCategories: {
          nodes: [{ id: 'TGT_CAT_1', name: 'General', slug: 'general' }],
        },
        discussions: { nodes: [] },
      },
    };

    // Dry Run
    const { ctx: dryCtx, writeClient: dryWriter } = createContext(
      null,
      targetGraphQL,
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
      targetGraphQL,
      undefined,
      false,
    );
    const liveResult = await mod.apply(liveCtx, plan);

    assert.equal(liveResult.status, 'complete');
    assert.equal(liveWriter.mutations.length, 1);
    assert.equal(liveWriter.mutations[0].method, 'POST');
    assert.equal(liveWriter.mutations[0].path, '/graphql');
  });

  it('verify reports verified=true when all discussions match', async () => {
    const mod = new DiscussionsMigrationModule();
    const sourceData: DiscussionsData = {
      owner: 'source-org',
      repo: 'source-repo',
      hasDiscussionsEnabled: true,
      categories: [{ id: 'C1', name: 'General', slug: 'general' }],
      discussions: [
        {
          title: 'All Good',
          body: 'Content',
          categoryName: 'General',
        },
      ],
    };

    const targetGraphQL: RawGraphQLRepoDiscussionsResponse = {
      repository: {
        id: 'TGT_1',
        hasDiscussionsEnabled: true,
        discussionCategories: { nodes: [] },
        discussions: {
          nodes: [
            {
              id: 'TD1',
              title: 'All Good',
              body: 'Content',
              category: { id: 'C1', name: 'General', slug: 'general' },
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

  it('verify reports discrepancies when expected discussions are missing', async () => {
    const mod = new DiscussionsMigrationModule();
    const sourceData: DiscussionsData = {
      owner: 'source-org',
      repo: 'source-repo',
      hasDiscussionsEnabled: true,
      categories: [{ id: 'C1', name: 'General', slug: 'general' }],
      discussions: [
        {
          title: 'Missing Discussion',
          body: 'Not here',
          categoryName: 'General',
        },
      ],
    };

    const targetGraphQL: RawGraphQLRepoDiscussionsResponse = {
      repository: {
        id: 'TGT_1',
        hasDiscussionsEnabled: true,
        discussionCategories: { nodes: [] },
        discussions: { nodes: [] },
      },
    };

    const { ctx } = createContext(null, targetGraphQL);
    const plan = await mod.plan(ctx, sourceData);
    const result = await mod.verify(ctx, plan);

    assert.equal(result.verified, false);
    assert.equal(result.discrepancies.length, 1);
    assert.ok(
      result.discrepancies[0].resourceName.includes('Missing Discussion'),
    );
  });
});
