import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  type MigrationScope,
  type DiscoveryBundle,
  validateMigrationPlan,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  ModuleRegistry,
  MigrationPlanner,
  calculateEntityDiff,
  writeMigrationPlanFile,
  type MigrationModule,
  type ModulePlan,
  type ModuleExecutionResult,
  type ModuleVerificationResult,
} from '../src/index.js';

function createMockAdapter(trackCalls: { calls: string[] }): GitHubReadAdapter {
  return {
    async queryGraphQL() {
      trackCalls.calls.push('queryGraphQL');
      return { data: {} as never, observedAt: new Date().toISOString() };
    },
    async readPage() {
      trackCalls.calls.push('readPage');
      return {
        items: [],
        nextCursor: null,
        observedAt: new Date().toISOString(),
        remainingRequests: 5000,
        resetAt: null,
        status: 200,
      };
    },
    async readSingle() {
      trackCalls.calls.push('readSingle');
      return {
        data: {} as never,
        observedAt: new Date().toISOString(),
        status: 200,
      };
    },
    async fetchAll() {
      trackCalls.calls.push('fetchAll');
      return {
        items: [],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
  };
}

describe('calculateEntityDiff', () => {
  it('creates planned operation for new resource (source exists, target absent)', () => {
    const op = calculateEntityDiff({
      id: 'op-1',
      resourceType: 'variable',
      resourceName: 'CI_ENV',
      source: { name: 'CI_ENV', value: 'production' },
      target: undefined,
      buildPayload: (src) => ({ value: src.value }),
    });

    assert.equal(op.operation, 'create');
    assert.equal(op.id, 'op-1');
    assert.deepEqual(op.payload, { value: 'production' });
  });

  it('creates noop planned operation when target matches source', () => {
    const op = calculateEntityDiff({
      id: 'op-2',
      resourceType: 'variable',
      resourceName: 'CI_ENV',
      source: { name: 'CI_ENV', value: 'production' },
      target: { name: 'CI_ENV', value: 'production' },
    });

    assert.equal(op.operation, 'noop');
    assert.equal(op.payload, undefined);
  });

  it('creates update planned operation when target differs from source and overwrite allowed', () => {
    const op = calculateEntityDiff({
      id: 'op-3',
      resourceType: 'variable',
      resourceName: 'CI_ENV',
      source: { name: 'CI_ENV', value: 'staging' },
      target: { name: 'CI_ENV', value: 'production' },
      canOverwrite: true,
      buildPayload: (src) => ({ value: src.value }),
    });

    assert.equal(op.operation, 'update');
    assert.deepEqual(op.payload, { value: 'staging' });
  });

  it('creates skip planned operation when target differs from source and canOverwrite is false', () => {
    const op = calculateEntityDiff({
      id: 'op-4',
      resourceType: 'variable',
      resourceName: 'CI_ENV',
      source: { name: 'CI_ENV', value: 'staging' },
      target: { name: 'CI_ENV', value: 'production' },
      canOverwrite: false,
    });

    assert.equal(op.operation, 'skip');
  });
});

describe('MigrationPlanner', () => {
  const scope: MigrationScope = {
    version: '1.0.0',
    name: 'test-scope',
    organizations: [
      {
        source: 'source-org',
        target: 'target-org',
        modules: ['org-vars'],
      },
    ],
    repositories: [
      {
        sourceOrg: 'source-org',
        sourceRepo: 'repo-1',
        targetOrg: 'target-org',
        targetRepo: 'repo-1',
        useGei: true,
        modules: ['repo-vars'],
      },
    ],
  };

  function createTestModule(
    id: string,
    scopeLevel: 'organization' | 'repository',
    operations: ModulePlan['operations'],
  ): MigrationModule {
    return {
      id,
      displayName: `Module ${id}`,
      scopeLevel,
      dependencies: [],
      async discover(_ctx, cached) {
        return { cachedUsed: Boolean(cached) };
      },
      async plan(ctx) {
        return {
          moduleId: id,
          scopeLevel,
          targetIdentifier:
            scopeLevel === 'organization'
              ? ctx.scope.targetOrg
              : `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
          operations,
          warnings: [],
        };
      },
      async apply(): Promise<ModuleExecutionResult> {
        return {
          schemaVersion: '1.0.0',
          moduleId: id,
          status: 'complete',
          results: [],
          durationMs: 0,
        };
      },
      async verify(): Promise<ModuleVerificationResult> {
        return {
          moduleId: id,
          verified: true,
          discrepancies: [],
        };
      },
    };
  }

  it('generates a strictly validated MigrationPlan in live mode', async () => {
    const sourceCalls = { calls: [] as string[] };
    const targetCalls = { calls: [] as string[] };
    const sourceClient = createMockAdapter(sourceCalls);
    const targetClient = createMockAdapter(targetCalls);

    const registry = new ModuleRegistry();
    registry.register(
      createTestModule('org-vars', 'organization', [
        {
          id: 'op-org-1',
          resourceType: 'variable',
          resourceName: 'ORG_VAR_A',
          operation: 'create',
          payload: { value: 'val-a' },
        },
      ]),
    );
    registry.register(
      createTestModule('repo-vars', 'repository', [
        {
          id: 'op-repo-1',
          resourceType: 'variable',
          resourceName: 'REPO_VAR_1',
          operation: 'update',
          payload: { value: 'val-updated' },
        },
        {
          id: 'op-repo-2',
          resourceType: 'variable',
          resourceName: 'REPO_VAR_2',
          operation: 'noop',
        },
      ]),
    );

    const planner = new MigrationPlanner({
      scope,
      registry,
      sourceClient,
      targetClient,
    });

    const plan = await planner.generatePlan();

    assert.equal(plan.schemaVersion, '1.0.0');
    assert.equal(plan.scopeName, 'test-scope');
    assert.equal(plan.modules.length, 2);
    assert.deepEqual(plan.summary, {
      create: 1,
      update: 1,
      noop: 1,
      skip: 0,
      warn: 0,
    });

    const validation = validateMigrationPlan(plan);
    assert.equal(validation.success, true);
  });

  it('uses cached discovery bundle without source network calls', async () => {
    const sourceCalls = { calls: [] as string[] };
    const targetCalls = { calls: [] as string[] };
    const sourceClient = createMockAdapter(sourceCalls);
    const targetClient = createMockAdapter(targetCalls);

    // Load actual synthetic fixture
    const bundleFixture = JSON.parse(
      readFileSync(
        new URL(
          '../../../fixtures/synthetic/organization-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as DiscoveryBundle;

    const registry = new ModuleRegistry();
    let discoveredFromCache = false;

    registry.register({
      id: 'org-vars',
      displayName: 'Org Vars',
      scopeLevel: 'organization',
      dependencies: [],
      async discover(_ctx, cached) {
        if (cached) {
          discoveredFromCache = true;
        }
        return {};
      },
      async plan() {
        return {
          moduleId: 'org-vars',
          scopeLevel: 'organization',
          targetIdentifier: 'target-org',
          operations: [],
          warnings: [],
        };
      },
      async apply(): Promise<ModuleExecutionResult> {
        return {
          schemaVersion: '1.0.0',
          moduleId: 'org-vars',
          status: 'complete',
          results: [],
          durationMs: 0,
        };
      },
      async verify(): Promise<ModuleVerificationResult> {
        return {
          moduleId: 'org-vars',
          verified: true,
          discrepancies: [],
        };
      },
    });

    const planner = new MigrationPlanner({
      scope: {
        ...scope,
        repositories: [], // only org scope for this test
      },
      registry,
      sourceClient,
      targetClient,
      cachedDiscoveryBundle: bundleFixture,
    });

    const plan = await planner.generatePlan();

    assert.equal(discoveredFromCache, true);
    assert.equal(sourceCalls.calls.length, 0); // ZERO calls to source
    assert.equal(plan.modules.length, 1);
  });

  it('writes migration plan atomically to disk with non-clobber protection', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'test-plan-'));
    const testFile = join(tempDir, 'test-plan.json');
    const plan = {
      schemaVersion: '1.0.0' as const,
      planId: 'test-write',
      createdAt: new Date().toISOString(),
      scopeName: 'test-scope',
      summary: { create: 0, update: 0, noop: 0, skip: 0, warn: 0 },
      modules: [],
    };

    try {
      writeMigrationPlanFile(testFile, plan);
      assert.ok(existsSync(testFile));

      // Attempt non-clobber write
      assert.throws(
        () => writeMigrationPlanFile(testFile, plan, { overwrite: false }),
        /already exists/,
      );

      // Overwrite allowed
      writeMigrationPlanFile(testFile, plan, { overwrite: true });
    } finally {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });
});
