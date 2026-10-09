import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  IssuesMigrationModule,
  createDefaultModuleRegistry,
  executeIssueImport,
  type IssueImportPayload,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  RawApiIssue,
  RawApiIssueComment,
  RawApiLabel,
  RawApiMilestone,
} from '../../src/modules/issues/types.js';

class MockIssueReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(
    private readonly milestones: RawApiMilestone[] = [],
    private readonly labels: RawApiLabel[] = [],
    private readonly issues: RawApiIssue[] = [],
    private readonly comments: RawApiIssueComment[] = [],
  ) {}

  async readSingle<T>(op: { path: string }): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (op.path.includes('/milestones')) {
      return {
        data: this.milestones as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    if (op.path.includes('/labels')) {
      return {
        data: this.labels as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    if (op.path.includes('/comments')) {
      return {
        data: this.comments as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    return {
      data: this.issues as unknown as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(op: { path: string }): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    if (op.path.includes('/milestones')) {
      return {
        items: this.milestones as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }
    if (op.path.includes('/labels')) {
      return {
        items: this.labels as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }
    if (op.path.includes('/comments')) {
      return {
        items: this.comments as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }
    return {
      items: this.issues as unknown as readonly T[],
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

class MockIssueWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];
  mockStatus = 200;
  failPreview = false;

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);

    if (op.headers?.Accept?.includes('golden-comet') && this.failPreview) {
      const err = new Error('Preview API not supported');
      (err as unknown as { status: number }).status = 415;
      throw err;
    }

    if (op.id === 'rest.issues.createMilestone') {
      return { status: 201, data: { number: 42 } as unknown as T };
    }
    if (op.id === 'rest.issues.createIssue') {
      return { status: 201, data: { number: 99 } as unknown as T };
    }
    if (op.id === 'rest.issues.importIssue') {
      return {
        status: 202,
        data: { id: 101, status: 'pending' } as unknown as T,
      };
    }

    return { status: this.mockStatus, data: {} as T };
  }
}

function createTestContext(options?: {
  sourceReadAdapter?: GitHubReadAdapter;
  targetReadAdapter?: GitHubReadAdapter;
  targetWriteClient?: TargetWriteClient;
  dryRun?: boolean;
}): MigrationContext {
  return {
    runId: 'test-run-issues',
    scope: {
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
      sourceRepo: 'test-repo',
      targetRepo: 'test-repo',
    },
    sourceClient: options?.sourceReadAdapter ?? new MockIssueReadAdapter(),
    targetClient: options?.targetReadAdapter ?? new MockIssueReadAdapter(),
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

test('IssuesMigrationModule registers in ModuleRegistry with id issues and gei-repo dependency', () => {
  const registry = createDefaultModuleRegistry();
  const mod = registry.get('issues');
  assert.ok(mod);
  assert.equal(mod.id, 'issues');
  assert.deepEqual(mod.dependencies, ['gei-repo']);
});

test('IssuesMigrationModule discover collects milestones, labels, and issues (filtering PRs)', async () => {
  const sourceMilestones: RawApiMilestone[] = [
    { number: 1, title: 'v1.0 Release', state: 'open' },
  ];
  const sourceLabels: RawApiLabel[] = [
    { name: 'bug', color: 'd73a4a' },
    { name: 'feature', color: 'a2eeef' },
  ];
  const sourceIssues: RawApiIssue[] = [
    {
      number: 10,
      title: 'Fix performance bug',
      body: 'Details here',
      state: 'open',
      created_at: '2025-01-01T00:00:00Z',
      labels: [{ name: 'bug', color: 'd73a4a' }],
      comments: 1,
    },
    {
      number: 11,
      title: 'Pull Request that should be ignored',
      body: 'PR body',
      state: 'open',
      created_at: '2025-01-01T00:00:00Z',
      pull_request: {
        url: 'https://api.github.com/repos/source-org/test-repo/pulls/11',
      },
    },
  ];
  const sourceComments: RawApiIssueComment[] = [
    {
      id: 501,
      body: 'Investigating now',
      created_at: '2025-01-01T01:00:00Z',
      user: { login: 'alice' },
    },
  ];

  const sourceAdapter = new MockIssueReadAdapter(
    sourceMilestones,
    sourceLabels,
    sourceIssues,
    sourceComments,
  );
  const ctx = createTestContext({ sourceReadAdapter: sourceAdapter });
  const mod = new IssuesMigrationModule();

  const data = await mod.discover(ctx);
  assert.equal(data.repo, 'test-repo');
  assert.equal(data.milestones.length, 1);
  assert.equal(data.labels.length, 2);
  assert.equal(data.issues.length, 1); // PR was filtered out!
  assert.equal(data.issues[0]?.title, 'Fix performance bug');
  assert.equal(data.issues[0]?.comments.length, 1);
  assert.equal(data.issues[0]?.comments[0]?.body, 'Investigating now');
});

test('IssuesMigrationModule plan diffs target state and plans creations vs noops', async () => {
  const mod = new IssuesMigrationModule();

  // Target already has 'bug' label, but missing 'feature' label, 'v1.0' milestone, and issue #10
  const targetLabels: RawApiLabel[] = [{ name: 'bug', color: 'd73a4a' }];
  const targetAdapter = new MockIssueReadAdapter([], targetLabels, [], []);
  const ctx = createTestContext({ targetReadAdapter: targetAdapter });

  const sourceData = {
    repo: 'test-repo',
    milestones: [{ number: 1, title: 'v1.0', state: 'open' as const }],
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'feature', color: 'a2eeef' },
    ],
    issues: [
      {
        number: 10,
        title: 'Fix performance bug',
        state: 'open' as const,
        createdAt: '2025-01-01T00:00:00Z',
        labels: [{ name: 'bug', color: 'd73a4a' }],
        comments: [],
      },
    ],
  };

  const plan = await mod.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'issues');
  assert.equal(plan.operations.length, 4);

  const bugLabelOp = plan.operations.find(
    (a) => a.id === 'label:test-repo:bug',
  );
  assert.equal(bugLabelOp?.operation, 'noop');

  const featureLabelOp = plan.operations.find(
    (a) => a.id === 'label:test-repo:feature',
  );
  assert.equal(featureLabelOp?.operation, 'create');

  const milestoneOp = plan.operations.find(
    (a) => a.id === 'milestone:test-repo:v1.0',
  );
  assert.equal(milestoneOp?.operation, 'create');

  const issueOp = plan.operations.find((a) => a.id === 'issue:test-repo:10');
  assert.equal(issueOp?.operation, 'create');
  assert.equal(
    (issueOp?.payload as IssueImportPayload).issue.title,
    'Fix performance bug',
  );
});

test('IssuesMigrationModule apply executes dryRun without mutations', async () => {
  const mod = new IssuesMigrationModule();
  const writeClient = new MockIssueWriteClient();
  const ctx = createTestContext({
    targetWriteClient: writeClient,
    dryRun: true,
  });

  const plan = {
    moduleId: 'issues',
    scopeLevel: 'repository' as const,
    targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
    operations: [
      {
        id: 'label:feature',
        resourceType: 'issue-label',
        resourceName: 'feature',
        operation: 'create' as const,
        reason: 'Create label',
        payload: { name: 'feature', color: 'blue' },
      },
      {
        id: 'issue:1',
        resourceType: 'issue',
        resourceName: '#1 Issue',
        operation: 'create' as const,
        reason: 'Import issue',
        payload: { issue: { title: 'Issue 1', body: 'Test' } },
      },
    ],
  };

  const result = await mod.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.calls.length, 0); // Zero mutations in dry-run!
  assert.equal(result.results.length, 2);
});

test('IssuesMigrationModule apply live mode creates labels, milestones, and imports issues', async () => {
  const mod = new IssuesMigrationModule();
  const writeClient = new MockIssueWriteClient();
  const ctx = createTestContext({
    targetWriteClient: writeClient,
    dryRun: false,
  });

  const plan = {
    moduleId: 'issues',
    scopeLevel: 'repository' as const,
    targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
    operations: [
      {
        id: 'label:feature',
        resourceType: 'issue-label',
        resourceName: 'feature',
        operation: 'create' as const,
        reason: 'Create label',
        payload: { name: 'feature', color: 'blue' },
      },
      {
        id: 'milestone:v1',
        resourceType: 'issue-milestone',
        resourceName: 'v1',
        operation: 'create' as const,
        reason: 'Create milestone',
        payload: { sourceNumber: 1, title: 'v1' },
      },
      {
        id: 'issue:10',
        resourceType: 'issue',
        resourceName: '#10 Fix bug',
        operation: 'create' as const,
        reason: 'Import issue',
        payload: {
          issue: {
            title: 'Fix bug',
            body: 'Bug desc',
            milestone: 1,
            labels: ['feature'],
          },
          comments: [],
        },
      },
    ],
  };

  const result = await mod.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(writeClient.calls.length, 3);

  // Label call
  assert.equal(writeClient.calls[0]?.id, 'rest.issues.createLabel');
  // Milestone call
  assert.equal(writeClient.calls[1]?.id, 'rest.issues.createMilestone');
  // Issue import call using golden-comet preview and remapped milestone (42)
  assert.equal(writeClient.calls[2]?.id, 'rest.issues.importIssue');
  assert.ok(writeClient.calls[2]?.headers?.Accept?.includes('golden-comet'));
  const payload = writeClient.calls[2]?.body as IssueImportPayload;
  assert.equal(payload.issue.milestone, 42);
});

test('executeIssueImport falls back to standard REST API when preview API is unsupported (HTTP 415)', async () => {
  const writeClient = new MockIssueWriteClient();
  writeClient.failPreview = true;

  const payload: IssueImportPayload = {
    issue: {
      title: 'Import fallback test',
      body: 'Fallback body',
      created_at: '2025-01-01T00:00:00Z',
      closed: true,
      labels: ['bug'],
    },
    comments: [
      {
        created_at: '2025-01-01T01:00:00Z',
        body: 'Fallback comment',
      },
    ],
  };

  const res = await executeIssueImport(
    writeClient,
    'target-org',
    'test-repo',
    payload,
    new AbortController().signal,
    false,
  );

  assert.equal(res.success, true);
  assert.equal(res.mode, 'rest-fallback');
  assert.equal(res.createdNumber, 99);

  // Check calls: 1 preview attempt + 1 createIssue + 1 updateState (closed) + 1 createComment
  assert.equal(writeClient.calls.length, 4);
  assert.equal(writeClient.calls[0]?.id, 'rest.issues.importIssue');
  assert.equal(writeClient.calls[1]?.id, 'rest.issues.createIssue');
  assert.equal(writeClient.calls[2]?.id, 'rest.issues.updateIssueState');
  assert.equal(writeClient.calls[3]?.id, 'rest.issues.createComment');
});

test('IssuesMigrationModule verify detects missing resources and reports discrepancies', async () => {
  const mod = new IssuesMigrationModule();

  // Target has no labels, milestones, or issues
  const targetAdapter = new MockIssueReadAdapter([], [], [], []);
  const ctx = createTestContext({ targetReadAdapter: targetAdapter });

  const plan = {
    moduleId: 'issues',
    scopeLevel: 'repository' as const,
    targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
    operations: [
      {
        id: 'label:feature',
        resourceType: 'issue-label',
        resourceName: 'feature',
        operation: 'create' as const,
        reason: 'Create label',
        payload: { name: 'feature', color: 'blue' },
      },
      {
        id: 'milestone:v1',
        resourceType: 'issue-milestone',
        resourceName: 'v1',
        operation: 'create' as const,
        reason: 'Create milestone',
        payload: { sourceNumber: 1, title: 'v1' },
      },
      {
        id: 'issue:10',
        resourceType: 'issue',
        resourceName: '#10 Fix bug',
        operation: 'create' as const,
        reason: 'Import issue',
        payload: {
          issue: { title: 'Fix bug', body: 'Bug desc' },
        },
      },
    ],
  };

  const report = await mod.verify(ctx, plan);
  assert.equal(report.verified, false);
  assert.equal(report.discrepancies.length, 3);
  assert.ok(report.discrepancies.some((d) => d.resourceName === 'feature'));
  assert.ok(report.discrepancies.some((d) => d.resourceName === 'v1'));
  assert.ok(report.discrepancies.some((d) => d.resourceName === '#10 Fix bug'));
});
