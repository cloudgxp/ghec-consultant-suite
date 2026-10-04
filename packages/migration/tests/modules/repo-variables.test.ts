import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ModulePlanSchema,
  ModuleExecutionResultSchema,
  ModuleVerificationResultSchema,
} from '@ghec/contracts';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  ModuleRegistry,
  RepoVariablesMigrationModule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';

function createMockReadAdapter(
  variables: Record<string, string> = {},
): GitHubReadAdapter {
  return {
    async queryGraphQL() {
      return { data: {} as never, observedAt: new Date().toISOString() };
    },
    async readPage() {
      return {
        items: [],
        nextCursor: null,
        observedAt: new Date().toISOString(),
        remainingRequests: 5000,
        resetAt: null,
        status: 200,
      };
    },
    async readSingle(operation: ReadOperation) {
      if (operation.id === 'rest.actions.listRepoVariables') {
        const varList = Object.entries(variables).map(([name, value]) => ({
          name,
          value,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        }));
        return {
          data: { total_count: varList.length, variables: varList },
          observedAt: new Date().toISOString(),
          status: 200,
        };
      }
      return { data: null, observedAt: new Date().toISOString(), status: 404 };
    },
    async fetchAll() {
      return {
        items: [],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
  };
}

function createMockWriteClient(
  trackMutations: TargetWriteOperation[],
): TargetWriteClient {
  return {
    async mutate<T>(op: TargetWriteOperation) {
      trackMutations.push(op);
      return { status: 201, data: {} as T };
    },
  };
}

function createMockContext(
  options: {
    sourceVars?: Record<string, string>;
    targetVars?: Record<string, string>;
    dryRun?: boolean;
    continueOnError?: boolean;
    trackMutations?: TargetWriteOperation[];
  } = {},
): MigrationContext {
  const mutations = options.trackMutations ?? [];
  return {
    runId: 'run-123',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dest-org',
      sourceRepo: 'sample-repo',
      targetRepo: 'sample-repo',
    },
    sourceClient: createMockReadAdapter(options.sourceVars ?? {}),
    targetClient: createMockReadAdapter(options.targetVars ?? {}),
    targetWriteClient: createMockWriteClient(mutations),
    signal: new AbortController().signal,
    dryRun: options.dryRun ?? false,
    continueOnError: options.continueOnError ?? false,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

describe('RepoVariablesMigrationModule', () => {
  const module = new RepoVariablesMigrationModule();

  it('registers cleanly in ModuleRegistry', () => {
    const registry = new ModuleRegistry();
    registry.register(module);
    assert.equal(registry.has('repo-variables'), true);
    assert.equal(
      registry.get('repo-variables')?.displayName,
      'Repository Actions Variables',
    );
  });

  describe('discover', () => {
    it('discovers variables from source repository in live mode', async () => {
      const ctx = createMockContext({
        sourceVars: {
          DEPLOY_ENV: 'production',
          FEATURE_FLAG: 'enabled',
        },
      });

      const data = await module.discover(ctx);
      assert.equal(data.repo, 'sample-repo');
      assert.equal(data.variables.length, 2);
      assert.equal(data.variables[0]?.name, 'DEPLOY_ENV');
      assert.equal(data.variables[0]?.value, 'production');
    });

    it('throws error when sourceRepo is missing in context', async () => {
      const ctx = createMockContext();
      const invalidCtx: MigrationContext = {
        ...ctx,
        scope: { ...ctx.scope, sourceRepo: undefined },
      };

      await assert.rejects(
        () => module.discover(invalidCtx),
        /requires sourceRepo in migration context/,
      );
    });
  });

  describe('plan', () => {
    it('diffs source against target and generates create, update, and noop operations', async () => {
      const ctx = createMockContext({
        targetVars: {
          EXISTING_UNCHANGED: 'unchanged-val',
          EXISTING_DIFF: 'old-val',
        },
      });

      const sourceData = {
        repo: 'sample-repo',
        variables: [
          { name: 'NEW_VAR', value: 'brand-new' },
          { name: 'EXISTING_DIFF', value: 'new-val' },
          { name: 'EXISTING_UNCHANGED', value: 'unchanged-val' },
        ],
      };

      const plan = await module.plan(ctx, sourceData);

      // Verify contract schema
      const validation = ModulePlanSchema.safeParse(plan);
      assert.equal(validation.success, true);

      assert.equal(plan.moduleId, 'repo-variables');
      assert.equal(plan.targetIdentifier, 'dest-org/sample-repo');
      assert.equal(plan.operations.length, 3);

      const createOp = plan.operations.find(
        (op) => op.resourceName === 'NEW_VAR',
      );
      assert.ok(createOp);
      assert.equal(createOp.operation, 'create');
      assert.deepEqual(createOp.payload, {
        name: 'NEW_VAR',
        value: 'brand-new',
      });

      const updateOp = plan.operations.find(
        (op) => op.resourceName === 'EXISTING_DIFF',
      );
      assert.ok(updateOp);
      assert.equal(updateOp.operation, 'update');
      assert.deepEqual(updateOp.payload, { value: 'new-val' });

      const noopOp = plan.operations.find(
        (op) => op.resourceName === 'EXISTING_UNCHANGED',
      );
      assert.ok(noopOp);
      assert.equal(noopOp.operation, 'noop');
    });
  });

  describe('apply', () => {
    it('executes POST for create and PATCH for update, skipping write requests on noop', async () => {
      const mutations: TargetWriteOperation[] = [];
      const ctx = createMockContext({ trackMutations: mutations });

      const plan = {
        moduleId: 'repo-variables',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'dest-org/sample-repo',
        operations: [
          {
            id: 'op-create',
            resourceType: 'variable',
            resourceName: 'NEW_VAR',
            operation: 'create' as const,
            payload: { name: 'NEW_VAR', value: 'brand-new' },
          },
          {
            id: 'op-update',
            resourceType: 'variable',
            resourceName: 'EXISTING_DIFF',
            operation: 'update' as const,
            payload: { value: 'new-val' },
          },
          {
            id: 'op-noop',
            resourceType: 'variable',
            resourceName: 'EXISTING_UNCHANGED',
            operation: 'noop' as const,
          },
        ],
        warnings: [],
      };

      const result = await module.apply(ctx, plan);

      // Verify contract schema
      const validation = ModuleExecutionResultSchema.safeParse(result);
      assert.equal(validation.success, true);

      assert.equal(result.status, 'complete');
      assert.equal(result.results.length, 3);
      assert.equal(mutations.length, 2); // 1 POST, 1 PATCH, 0 for noop

      assert.equal(mutations[0]?.method, 'POST');
      assert.equal(
        mutations[0]?.path,
        '/repos/{owner}/{repo}/actions/variables',
      );
      assert.deepEqual(mutations[0]?.body, {
        name: 'NEW_VAR',
        value: 'brand-new',
      });

      assert.equal(mutations[1]?.method, 'PATCH');
      assert.equal(
        mutations[1]?.path,
        '/repos/{owner}/{repo}/actions/variables/{name}',
      );
      assert.deepEqual(mutations[1]?.body, { value: 'new-val' });
    });

    it('simulates operations without mutation requests when dryRun is true', async () => {
      const mutations: TargetWriteOperation[] = [];
      const ctx = createMockContext({
        dryRun: true,
        trackMutations: mutations,
      });

      const plan = {
        moduleId: 'repo-variables',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'dest-org/sample-repo',
        operations: [
          {
            id: 'op-create',
            resourceType: 'variable',
            resourceName: 'DRY_VAR',
            operation: 'create' as const,
            payload: { name: 'DRY_VAR', value: 'simulated' },
          },
        ],
        warnings: [],
      };

      const result = await module.apply(ctx, plan);
      assert.equal(result.status, 'complete');
      assert.equal(mutations.length, 0); // 0 write calls in dryRun
    });
  });

  describe('verify', () => {
    it('verifies target variables when actual matches planned expected values', async () => {
      const ctx = createMockContext({
        targetVars: {
          VAR_1: 'val-1',
          VAR_2: 'val-2',
        },
      });

      const plan = {
        moduleId: 'repo-variables',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'dest-org/sample-repo',
        operations: [
          {
            id: 'op-1',
            resourceType: 'variable',
            resourceName: 'VAR_1',
            operation: 'create' as const,
            payload: { name: 'VAR_1', value: 'val-1' },
          },
          {
            id: 'op-2',
            resourceType: 'variable',
            resourceName: 'VAR_2',
            operation: 'noop' as const,
            sourceState: { name: 'VAR_2', value: 'val-2' },
          },
        ],
        warnings: [],
      };

      const vResult = await module.verify(ctx, plan);

      // Verify contract schema
      const validation = ModuleVerificationResultSchema.safeParse(vResult);
      assert.equal(validation.success, true);

      assert.equal(vResult.verified, true);
      assert.equal(vResult.discrepancies.length, 0);
    });

    it('reports discrepancies when target variable is missing or value differs', async () => {
      const ctx = createMockContext({
        targetVars: {
          VAR_MISMATCH: 'wrong-val',
          // VAR_MISSING is absent
        },
      });

      const plan = {
        moduleId: 'repo-variables',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'dest-org/sample-repo',
        operations: [
          {
            id: 'op-1',
            resourceType: 'variable',
            resourceName: 'VAR_MISMATCH',
            operation: 'update' as const,
            payload: { value: 'expected-val' },
          },
          {
            id: 'op-2',
            resourceType: 'variable',
            resourceName: 'VAR_MISSING',
            operation: 'create' as const,
            payload: { name: 'VAR_MISSING', value: 'should-exist' },
          },
        ],
        warnings: [],
      };

      const vResult = await module.verify(ctx, plan);
      const validation = ModuleVerificationResultSchema.safeParse(vResult);
      assert.equal(validation.success, true);

      assert.equal(vResult.verified, false);
      assert.equal(vResult.discrepancies.length, 2);

      const mismatch = vResult.discrepancies.find(
        (d) => d.resourceName === 'VAR_MISMATCH',
      );
      assert.ok(mismatch);
      assert.equal(mismatch.expected, 'expected-val');
      assert.equal(mismatch.actual, 'wrong-val');

      const missing = vResult.discrepancies.find(
        (d) => d.resourceName === 'VAR_MISSING',
      );
      assert.ok(missing);
      assert.equal(missing.actual, 'missing');
    });
  });
});
