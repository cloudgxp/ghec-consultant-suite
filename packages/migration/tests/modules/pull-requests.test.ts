import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  PullRequestsMigrationModule,
  createDefaultModuleRegistry,
  generateHistoricalPrMarkdown,
  type ArchivePullRequestsPayload,
  type CreatePullRequestPayload,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  MigrationPullRequest,
  RawApiPullComment,
  RawApiPullRequest,
} from '../../src/modules/pull-requests/types.js';

class MockPullReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(
    private readonly pulls: RawApiPullRequest[] = [],
    private readonly comments: RawApiPullComment[] = [],
    private readonly issues: { title: string }[] = [],
  ) {}

  async readSingle<T>(op: { path: string }): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (op.path.includes('/comments')) {
      return {
        data: this.comments as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    if (op.path.includes('/issues')) {
      return {
        data: this.issues as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    return {
      data: this.pulls as unknown as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(op: { path: string }): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    if (op.path.includes('/comments')) {
      return {
        items: this.comments as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }
    if (op.path.includes('/issues')) {
      return {
        items: this.issues as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }
    return {
      items: this.pulls as unknown as readonly T[],
      observedAt: new Date().toISOString(),
      complete: true,
    };
  }

  async readPage<T>(op: { path: string }): Promise<{
    items: readonly T[];
    nextCursor: string | null;
    status: number;
    observedAt: string;
  }> {
    const res = await this.fetchAll<T>(op);
    return {
      items: res.items,
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async queryGraphQL<T>(): Promise<{ data: T; observedAt: string }> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(op: {
    path: string;
  }): Promise<{ data: T; status: number }> {
    const res = await this.fetchAll<T>(op);
    return { data: res.items as unknown as T, status: 200 };
  }
}

class MockPullWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);

    if (op.id === 'rest.pulls.createPull') {
      return { status: 201, data: { number: 404 } as unknown as T };
    }
    if (op.id === 'rest.issues.createArchiveIssue') {
      return { status: 201, data: { number: 888 } as unknown as T };
    }

    return { status: 200, data: {} as T };
  }
}

function createTestContext(options?: {
  sourceReadAdapter?: GitHubReadAdapter;
  targetReadAdapter?: GitHubReadAdapter;
  targetWriteClient?: TargetWriteClient;
  dryRun?: boolean;
}): MigrationContext {
  return {
    runId: 'test-run-pull-requests',
    scope: {
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
      sourceRepo: 'test-repo',
      targetRepo: 'test-repo',
    },
    sourceClient: options?.sourceReadAdapter ?? new MockPullReadAdapter(),
    targetClient: options?.targetReadAdapter ?? new MockPullReadAdapter(),
    targetWriteClient: options?.targetWriteClient,
    signal: new AbortController().signal,
    dryRun: options?.dryRun ?? false,
    continueOnError: true,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

test('PullRequestsMigrationModule registers in ModuleRegistry with id pull-requests and gei-repo dependency', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('pull-requests');
  assert.ok(mod);
  assert.equal(mod.id, 'pull-requests');
  assert.deepEqual(mod.dependencies, ['gei-repo']);
});

test('generateHistoricalPrMarkdown produces compliant markdown table', () => {
  const closedPrs: MigrationPullRequest[] = [
    {
      number: 101,
      title: 'Fix edge case with | pipes',
      body: 'Body',
      state: 'closed',
      merged: true,
      headRef: 'fix-pipes',
      baseRef: 'main',
      author: 'octocat',
      labels: ['bug'],
      commentsCount: 2,
      reviewCommentsCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      mergedAt: '2024-01-02T00:00:00Z',
    },
  ];

  const md = generateHistoricalPrMarkdown(closedPrs);
  assert.ok(md.includes('# Historical Pull Requests Archive'));
  assert.ok(
    md.includes(
      '| #101 | Fix edge case with \\| pipes | Merged | @octocat | `main` <- `fix-pipes` | 2024-01-02T00:00:00Z |',
    ),
  );
});

test('PullRequestsMigrationModule discover classifies open vs closed PRs and attaches comments', async () => {
  const rawPulls: RawApiPullRequest[] = [
    {
      number: 1,
      title: 'Active open PR',
      body: 'Open PR details',
      state: 'open',
      created_at: '2025-02-01T00:00:00Z',
      head: { ref: 'feat/new-ui' },
      base: { ref: 'main' },
      user: { login: 'alice' },
      labels: [{ name: 'frontend' }],
      comments: 1,
    },
    {
      number: 2,
      title: 'Merged older PR',
      body: 'Closed PR details',
      state: 'closed',
      merged_at: '2024-12-01T00:00:00Z',
      created_at: '2024-11-01T00:00:00Z',
      head: { ref: 'feat/v1' },
      base: { ref: 'main' },
      user: { login: 'bob' },
    },
  ];

  const rawComments: RawApiPullComment[] = [
    {
      id: 201,
      body: 'Looks great!',
      created_at: '2025-02-02T00:00:00Z',
      user: { login: 'charlie' },
    },
  ];

  const sourceAdapter = new MockPullReadAdapter(rawPulls, rawComments);
  const ctx = createTestContext({ sourceReadAdapter: sourceAdapter });
  const mod = new PullRequestsMigrationModule();

  const data = await mod.discover(ctx);
  assert.equal(data.repo, 'test-repo');
  assert.equal(data.openPullRequests.length, 1);
  assert.equal(data.closedPullRequests.length, 1);
  assert.equal(data.openPullRequests[0]?.title, 'Active open PR');
  assert.equal(data.commentsByPrNumber[1]?.length, 1);
  assert.equal(data.commentsByPrNumber[1]?.[0]?.body, 'Looks great!');
});

test('PullRequestsMigrationModule plan schedules open PR recreation and closed PR archival', async () => {
  const mod = new PullRequestsMigrationModule();
  const ctx = createTestContext();

  const sourceData = {
    repo: 'test-repo',
    openPullRequests: [
      {
        number: 1,
        title: 'Active open PR',
        body: 'Details',
        state: 'open' as const,
        merged: false,
        headRef: 'feat/a',
        baseRef: 'main',
        author: 'alice',
        labels: ['enhancement'],
        commentsCount: 0,
        reviewCommentsCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
    closedPullRequests: [
      {
        number: 2,
        title: 'Merged feature',
        body: 'Details',
        state: 'closed' as const,
        merged: true,
        headRef: 'feat/b',
        baseRef: 'main',
        author: 'bob',
        labels: [],
        commentsCount: 0,
        reviewCommentsCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
        mergedAt: '2024-01-02T00:00:00Z',
      },
    ],
    commentsByPrNumber: {},
  };

  const plan = await mod.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'pull-requests');
  assert.equal(plan.operations.length, 2);

  const openPrOp = plan.operations.find(
    (o) => o.id === 'pull-request:test-repo:1',
  );
  assert.equal(openPrOp?.operation, 'create');
  assert.equal((openPrOp?.payload as CreatePullRequestPayload).head, 'feat/a');

  const archiveOp = plan.operations.find(
    (o) => o.id === 'pull-requests-archive:test-repo',
  );
  assert.equal(archiveOp?.operation, 'create');
  assert.equal(
    (archiveOp?.payload as ArchivePullRequestsPayload).closedPrs.length,
    1,
  );
});

test('PullRequestsMigrationModule apply executes dryRun without calling write client', async () => {
  const mod = new PullRequestsMigrationModule();
  const writeClient = new MockPullWriteClient();
  const ctx = createTestContext({
    targetWriteClient: writeClient,
    dryRun: true,
  });

  const plan = {
    moduleId: 'pull-requests',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'target-org/test-repo',
    operations: [
      {
        id: 'pull-request:1',
        resourceType: 'pull-request',
        resourceName: '#1 PR',
        operation: 'create' as const,
        reason: 'Recreate PR',
        payload: {
          sourceNumber: 1,
          title: 'PR 1',
          body: 'Desc',
          head: 'feat/a',
          base: 'main',
        },
      },
    ],
    warnings: [],
  };

  const result = await mod.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.calls.length, 0); // No mutations in dry-run
});

test('PullRequestsMigrationModule apply live recreates open PR and creates archive issue', async () => {
  const mod = new PullRequestsMigrationModule();
  const writeClient = new MockPullWriteClient();
  const ctx = createTestContext({
    targetWriteClient: writeClient,
    dryRun: false,
  });

  const plan = {
    moduleId: 'pull-requests',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'target-org/test-repo',
    operations: [
      {
        id: 'pull-request:1',
        resourceType: 'pull-request',
        resourceName: '#1 PR',
        operation: 'create' as const,
        reason: 'Recreate PR',
        payload: {
          sourceNumber: 1,
          title: 'PR 1',
          body: 'Desc',
          head: 'feat/a',
          base: 'main',
          labels: ['feature'],
          comments: [
            {
              id: 1,
              body: 'Note',
              createdAt: '2025-01-01T00:00:00Z',
              author: 'alice',
            },
          ],
        },
      },
      {
        id: 'pull-requests-archive',
        resourceType: 'pull-requests-archive',
        resourceName: 'Historical Pull Requests Archive',
        operation: 'create' as const,
        reason: 'Archive closed PRs',
        payload: {
          archiveTitle: 'Historical Pull Requests Archive',
          closedPrs: [
            {
              number: 2,
              title: 'Old PR',
              body: 'Old body',
              state: 'closed',
              merged: true,
              headRef: 'feat/old',
              baseRef: 'main',
              author: 'bob',
              labels: [],
              commentsCount: 0,
              reviewCommentsCount: 0,
              createdAt: '2024-01-01T00:00:00Z',
            },
          ],
        },
      },
    ],
    warnings: [],
  };

  const result = await mod.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(result.results.length, 2);

  // Calls:
  // 1. rest.pulls.createPull
  // 2. rest.issues.addLabels
  // 3. rest.issues.createComment
  // 4. rest.issues.createArchiveIssue
  // 5. rest.issues.closeArchiveIssue
  assert.equal(writeClient.calls[0]?.id, 'rest.pulls.createPull');
  assert.equal(writeClient.calls[1]?.id, 'rest.issues.addLabels');
  assert.equal(writeClient.calls[2]?.id, 'rest.issues.createComment');
  assert.equal(writeClient.calls[3]?.id, 'rest.issues.createArchiveIssue');
  assert.equal(writeClient.calls[4]?.id, 'rest.issues.closeArchiveIssue');
});

test('PullRequestsMigrationModule verify emits discrepancies for missing PRs and archive', async () => {
  const mod = new PullRequestsMigrationModule();
  const targetAdapter = new MockPullReadAdapter([], [], []);
  const ctx = createTestContext({ targetReadAdapter: targetAdapter });

  const plan = {
    moduleId: 'pull-requests',
    scopeLevel: 'repository' as const,
    targetIdentifier: 'target-org/test-repo',
    operations: [
      {
        id: 'pull-request:1',
        resourceType: 'pull-request',
        resourceName: '#1 PR',
        operation: 'create' as const,
        reason: 'Recreate PR',
        payload: {
          sourceNumber: 1,
          title: 'PR 1',
          body: 'Desc',
          head: 'feat/a',
          base: 'main',
        },
      },
      {
        id: 'pull-requests-archive',
        resourceType: 'pull-requests-archive',
        resourceName: 'Historical Pull Requests Archive',
        operation: 'create' as const,
        reason: 'Archive closed PRs',
        payload: {
          archiveTitle: 'Historical Pull Requests Archive',
          closedPrs: [],
        },
      },
    ],
    warnings: [],
  };

  const report = await mod.verify(ctx, plan);
  assert.equal(report.verified, false);
  assert.equal(report.discrepancies.length, 2);
  assert.ok(report.discrepancies.some((d) => d.resourceName === '#1 PR'));
  assert.ok(
    report.discrepancies.some(
      (d) => d.resourceName === 'Historical Pull Requests Archive',
    ),
  );
});
