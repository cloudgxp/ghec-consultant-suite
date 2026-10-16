import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ModuleRegistry,
  OrgRulesetsMigrationModule,
  RulesetsMigrationModule,
  type GitHubRuleset,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly rulesets: GitHubRuleset[];

  constructor(rulesets: GitHubRuleset[] = []) {
    this.rulesets = rulesets;
  }

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return {
      data: this.rulesets as unknown as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    return {
      items: [],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    return { items: [], observedAt: new Date().toISOString(), complete: true };
  }

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return { status: op.method === 'POST' ? 201 : 200, data: undefined };
  }
}

const sampleRuleset: GitHubRuleset = {
  id: 101,
  name: 'main-protection',
  target: 'branch',
  enforcement: 'active',
  source_type: 'Repository',
  conditions: {
    ref_name: {
      include: ['refs/heads/main'],
      exclude: [],
    },
  },
  rules: [
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 2,
        dismiss_stale_reviews_on_push: true,
      },
    },
    {
      type: 'required_linear_history',
    },
  ],
  bypass_actors: [
    {
      actor_type: 'Role',
      actor_id: 1,
      bypass_mode: 'exempt',
    },
  ],
};

test('RulesetsMigrationModule registers cleanly in ModuleRegistry', () => {
  const registry = new ModuleRegistry();
  const module = new RulesetsMigrationModule();
  registry.register(module);

  assert.equal(registry.get('rulesets'), module);
  assert.equal(module.id, 'rulesets');
  assert.equal(module.scopeLevel, 'repository');
});

test('RulesetsMigrationModule discovers rulesets in live mode', async () => {
  const module = new RulesetsMigrationModule();
  const mockAdapter = new MockReadAdapter([sampleRuleset]);

  const ctx: MigrationContext = {
    runId: 'test-run',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      sourceRepo: 'repo-a',
      targetRepo: 'repo-a',
    },
    sourceClient: mockAdapter,
    targetClient: mockAdapter,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const data = await module.discover(ctx);
  assert.equal(data.rulesets.length, 1);
  assert.equal(data.rulesets[0]!.name, 'main-protection');
});

test('RulesetsMigrationModule plans create, update, noop, and skip operations', async () => {
  const module = new RulesetsMigrationModule();

  const sourceRulesets: GitHubRuleset[] = [
    sampleRuleset,
    {
      name: 'updated-ruleset',
      target: 'branch',
      enforcement: 'active',
      source_type: 'Repository',
      rules: [{ type: 'required_signatures' }],
    },
    {
      name: 'inherited-ruleset',
      target: 'branch',
      enforcement: 'active',
      source_type: 'Organization',
      rules: [],
    },
  ];

  const targetRulesets: GitHubRuleset[] = [
    // Identical -> noop
    { ...sampleRuleset, id: 201 },
    // Different parameters -> update
    {
      id: 202,
      name: 'updated-ruleset',
      target: 'branch',
      enforcement: 'evaluate',
      source_type: 'Repository',
      rules: [],
    },
  ];

  const ctx: MigrationContext = {
    runId: 'test-run',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      sourceRepo: 'repo-a',
      targetRepo: 'repo-a',
    },
    sourceClient: new MockReadAdapter(sourceRulesets),
    targetClient: new MockReadAdapter(targetRulesets),
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = await module.plan(ctx, { rulesets: sourceRulesets });
  assert.equal(plan.moduleId, 'rulesets');
  assert.equal(plan.operations.length, 2);

  const noopOp = plan.operations.find((o) => o.operation === 'noop');
  assert.ok(noopOp);
  assert.equal(noopOp.resourceName, 'main-protection');

  const updateOp = plan.operations.find((o) => o.operation === 'update');
  assert.ok(updateOp);
  assert.equal(updateOp.resourceName, 'updated-ruleset');

  // Inherited ruleset was skipped with warning
  assert.ok(
    plan.warnings.some((w) => w.includes('inherited from Organization')),
  );
});

test('RulesetsMigrationModule apply executes POST and PUT mutations and skips noop', async () => {
  const module = new RulesetsMigrationModule();
  const writeClient = new MockWriteClient();

  const ctx: MigrationContext = {
    runId: 'test-run',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      sourceRepo: 'repo-a',
      targetRepo: 'repo-a',
    },
    sourceClient: new MockReadAdapter(),
    targetClient: new MockReadAdapter(),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'rulesets' as const,
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/repo-a',
    warnings: [],
    operations: [
      {
        id: 'create-rs',
        operation: 'create' as const,
        resourceType: 'ruleset',
        resourceName: 'new-rs',
        payload: { name: 'new-rs', target: 'branch', enforcement: 'active' },
      },
      {
        id: 'update-rs',
        operation: 'update' as const,
        resourceType: 'ruleset',
        resourceName: 'existing-rs',
        payload: {
          rulesetId: 301,
          name: 'existing-rs',
          target: 'branch',
          enforcement: 'active',
        },
      },
      {
        id: 'noop-rs',
        operation: 'noop' as const,
        resourceType: 'ruleset',
        resourceName: 'identical-rs',
      },
    ],
  };

  const result = await module.apply(ctx, plan);
  assert.equal(result.status, 'complete');
  assert.equal(result.results.length, 3);
  assert.equal(writeClient.calls.length, 2);
  assert.equal(writeClient.calls[0]!.method, 'POST');
  assert.equal(writeClient.calls[1]!.method, 'PUT');
});

test('RulesetsMigrationModule verify detects matching configuration and discrepancies', async () => {
  const module = new RulesetsMigrationModule();

  const ctxMatch: MigrationContext = {
    runId: 'test-run',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      sourceRepo: 'repo-a',
      targetRepo: 'repo-a',
    },
    sourceClient: new MockReadAdapter(),
    targetClient: new MockReadAdapter([sampleRuleset]),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: true,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const plan = {
    moduleId: 'rulesets' as const,
    scopeLevel: 'repository' as const,
    targetIdentifier: 'dst-org/repo-a',
    warnings: [],
    operations: [
      {
        id: 'verify-rs',
        operation: 'create' as const,
        resourceType: 'ruleset',
        resourceName: sampleRuleset.name,
        sourceState: sampleRuleset,
      },
    ],
  };

  const matchRes = await module.verify(ctxMatch, plan);
  assert.equal(matchRes.verified, true);
  assert.equal(matchRes.discrepancies.length, 0);

  // Verification failure when missing on target
  const ctxMismatch: MigrationContext = {
    ...ctxMatch,
    targetClient: new MockReadAdapter([]),
  };

  const mismatchRes = await module.verify(ctxMismatch, plan);
  assert.equal(mismatchRes.verified, false);
  assert.equal(mismatchRes.discrepancies.length, 1);
  assert.match(mismatchRes.discrepancies[0]!.message, /missing on destination/);
});

test('RulesetsMigrationModule hydrates ruleset details via GET .../rulesets/{id} when list returns summary items', async () => {
  const module = new RulesetsMigrationModule();
  const readPaths: string[] = [];

  const summaryOnlyItem: GitHubRuleset = {
    id: 501,
    name: 'branch-gov',
    target: 'branch',
    enforcement: 'active',
    source_type: 'Repository',
  };

  const fullDetailItem: GitHubRuleset = {
    ...summaryOnlyItem,
    conditions: {
      ref_name: {
        include: ['~DEFAULT_BRANCH'],
        exclude: [],
      },
    },
    rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
    bypass_actors: [
      {
        actor_id: 5,
        actor_type: 'RepositoryRole',
        bypass_mode: 'always',
      },
    ],
  };

  const detailAdapter: GitHubReadAdapter = {
    async readSingle<T>(op: ReadOperation) {
      readPaths.push(op.path ?? op.id);
      if (op.path?.endsWith('/rulesets/501')) {
        return {
          data: fullDetailItem as unknown as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      return {
        data: [summaryOnlyItem] as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    },
    async readPage<T>(): Promise<ReadPage<T>> {
      return {
        items: [],
        nextCursor: null,
        status: 200,
        observedAt: new Date().toISOString(),
        remainingRequests: null,
        resetAt: null,
      };
    },
    async fetchAll<T>() {
      return {
        items: [] as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
    async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
      return { data: {} as T, observedAt: new Date().toISOString() };
    },
  };

  const ctx: MigrationContext = {
    runId: 'test-detail-hydration',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      sourceRepo: 'repo-a',
      targetRepo: 'repo-a',
    },
    sourceClient: detailAdapter,
    targetClient: new MockReadAdapter([]),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await module.discover(ctx);
  assert.equal(discovered.rulesets.length, 1);
  assert.ok(readPaths.includes('/repos/src-org/repo-a/rulesets/501'));
  assert.equal(discovered.rulesets[0]!.rules?.length, 2);
  assert.deepEqual(discovered.rulesets[0]!.conditions?.ref_name?.include, [
    '~DEFAULT_BRANCH',
  ]);
  assert.equal(discovered.rulesets[0]!.bypass_actors?.length, 1);
});

test('OrgRulesetsMigrationModule executes full 4-stage lifecycle at organization scope', async () => {
  const orgModule = new OrgRulesetsMigrationModule();
  assert.equal(orgModule.id, 'org-rulesets');
  assert.equal(orgModule.scopeLevel, 'organization');
  assert.deepEqual(orgModule.dependencies, ['teams', 'custom-roles']);

  const orgRuleset: GitHubRuleset = {
    id: 701,
    name: 'org-wide-main-protection',
    target: 'branch',
    enforcement: 'active',
    source_type: 'Organization',
    conditions: {
      ref_name: {
        include: ['~DEFAULT_BRANCH'],
        exclude: [],
      },
      repository_name: {
        include: ['~ALL'],
        exclude: ['sandbox-*'],
        protected: true,
      },
    },
    rules: [{ type: 'deletion' }, { type: 'required_linear_history' }],
    bypass_actors: [
      {
        actor_id: 1,
        actor_type: 'OrganizationAdmin',
        bypass_mode: 'always',
      },
    ],
  };

  const writeClient = new MockWriteClient();
  const ctx: MigrationContext = {
    runId: 'test-org-rulesets',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockReadAdapter([orgRuleset]),
    targetClient: new MockReadAdapter([]),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const discovered = await orgModule.discover(ctx);
  assert.equal(discovered.rulesets.length, 1);

  const plan = await orgModule.plan(ctx, discovered);
  assert.equal(plan.moduleId, 'org-rulesets');
  assert.equal(plan.scopeLevel, 'organization');
  assert.equal(plan.targetIdentifier, 'dst-org');
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]!.operation, 'create');

  const execRes = await orgModule.apply(ctx, plan);
  assert.equal(execRes.status, 'complete');
  assert.equal(writeClient.calls.length, 1);
  assert.equal(writeClient.calls[0]!.path, '/orgs/dst-org/rulesets');

  // Verify detects discrepancy if repository_name condition differs on target
  const driftedTarget: GitHubRuleset = {
    ...orgRuleset,
    conditions: {
      ...orgRuleset.conditions,
      repository_name: {
        include: ['~ALL'],
        exclude: [],
        protected: false,
      },
    },
  };
  const verifyDrift = await orgModule.verify(
    { ...ctx, targetClient: new MockReadAdapter([driftedTarget]) },
    plan,
  );
  assert.equal(verifyDrift.verified, false);
  assert.equal(verifyDrift.discrepancies.length, 1);

  const verifyMatch = await orgModule.verify(
    { ...ctx, targetClient: new MockReadAdapter([orgRuleset]) },
    plan,
  );
  assert.equal(verifyMatch.verified, true);
  assert.equal(verifyMatch.discrepancies.length, 0);
});
