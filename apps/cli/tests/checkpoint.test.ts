import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateBundle, type Entity } from '@ghec/contracts';
import { AdaptiveRateLimiter } from '../src/github/http.js';
import { CheckpointManager } from '../src/engine/checkpoint.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';
import { parseDiscoveryOptions } from '../src/commands/discover.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '../src/github/adapter.js';

test('AdaptiveRateLimiter enforces serial pacing when remaining points < 500', async () => {
  const limiter = new AdaptiveRateLimiter();
  limiter.updateGraphQL(400, '2026-03-10T12:00:00Z', 1);

  const release1 = await limiter.acquire('graphql');
  release1();

  const start = Date.now();
  const release2 = await limiter.acquire('graphql');
  release2();
  const elapsed = Date.now() - start;

  assert.ok(elapsed >= 450, `Expected delay >= 450ms, got ${elapsed}ms`);
});

test('AdaptiveRateLimiter pauses execution until resetAt when remaining points < 100', async () => {
  const limiter = new AdaptiveRateLimiter();
  const resetEpochMs = Date.now() + 250;
  limiter.updateREST(50, resetEpochMs);

  const start = Date.now();
  const release = await limiter.acquire('rest');
  release();
  const elapsed = Date.now() - start;

  assert.ok(elapsed >= 200, `Expected pause >= 200ms, got ${elapsed}ms`);
  assert.equal(limiter.getStatus('rest').remaining, 5000);
});

test('CheckpointManager creates directory with 0700 permissions and writes atomically', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-checkpoint-test-'));
  try {
    const cpDir = join(tmpDir, '.checkpoint-test-run-1');
    const mgr = new CheckpointManager(cpDir, {
      runId: 'test-run-1',
      targetScope: { kind: 'organization', name: 'test-org' },
      modules: ['orgs', 'repos'],
    });

    assert.ok(existsSync(cpDir));
    const stat = statSync(cpDir);
    // On POSIX systems, check directory mode is 0700
    if (process.platform !== 'win32') {
      assert.equal(stat.mode & 0o777, 0o700);
    }

    const testEntity: Entity = {
      id: 'repo:test-org:test-repo',
      kind: 'repository',
      organizationId: 'test-org',
      name: 'test-repo',
      fullName: 'test-org/test-repo',
      isPrivate: false,
      isFork: false,
      isArchived: false,
      visibility: 'public',
      defaultBranch: 'main',
      primaryLanguage: 'TypeScript',
      size: { availability: 'observed', value: 1024, reason: null },
      collectorExecutionId: 'exec:test-org:repos:test-run-1',
      discoveredAt: new Date().toISOString(),
      provenance: [
        {
          source: 'rest',
          operation: 'rest.repos.list-for-org',
          observedAt: new Date().toISOString(),
          apiVersion: '2026-03-10',
        },
      ],
    };

    mgr.saveModuleResults(
      'test-org',
      'repos',
      [testEntity],
      {
        id: 'exec:test-org:repos:test-run-1',
        module: 'repos',
        organizationId: 'test-org',
        status: 'complete',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        provenance: [],
        warnings: [],
        errors: [],
        coverage: { state: 'complete', observed: 1, expected: 1, reason: null },
      },
      { id: 'test-org', login: 'test-org', displayName: 'Test Org' },
    );

    assert.equal(mgr.isModuleCompleted('test-org', 'repos'), true);
    assert.equal(mgr.isModuleCompleted('test-org', 'orgs'), false);

    const loadedEntities = mgr.loadEntities('test-org', 'repos');
    assert.equal(loadedEntities.length, 1);
    assert.equal(loadedEntities[0]?.id, testEntity.id);

    const loadedExec = mgr.loadExecution('test-org', 'repos');
    assert.ok(loadedExec);
    assert.equal(loadedExec.status, 'complete');

    const orgRecord = mgr.loadOrganization('test-org');
    assert.ok(orgRecord);
    assert.equal(orgRecord.login, 'test-org');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('DiscoveryOrchestrator resumes an interrupted scan, skips completed modules, and cleans up checkpoint', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-resume-test-'));
  const runId = 'resume-test-run';
  const checkpointDir = join(tmpDir, `.checkpoint-${runId}`);

  try {
    const t0 = new Date(Date.now() - 5000).toISOString();
    const t1 = new Date(Date.now() - 4000).toISOString();
    const t2 = new Date(Date.now() - 3000).toISOString();

    // 1. Prepare checkpoint with 'orgs' already completed
    const mgr = new CheckpointManager(checkpointDir, {
      runId,
      startedAt: t0,
      targetScope: { kind: 'organization', name: 'test-org' },
      modules: ['orgs', 'repos'],
    });

    mgr.saveModuleResults(
      'test-org',
      'orgs',
      [],
      {
        id: `exec:test-org:orgs:${runId}`,
        module: 'orgs',
        organizationId: 'test-org',
        status: 'complete',
        startedAt: t1,
        completedAt: t2,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.orgs.get',
            observedAt: t1,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: [],
        errors: [],
        coverage: { state: 'complete', observed: 1, expected: 1, reason: null },
      },
      { id: 'test-org', login: 'test-org', displayName: 'Test Org' },
    );

    // 2. Mock adapter tracking invocations
    let orgsApiCalled = false;
    let reposApiCalled = false;

    const mockAdapter: GitHubReadAdapter = {
      async queryGraphQL<T>(query: string): Promise<GraphQLResponse<T>> {
        if (query.includes('OrgRepositories')) {
          reposApiCalled = true;
          return {
            data: {
              organization: {
                repositories: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  totalCount: 1,
                  nodes: [
                    {
                      id: 'repo-1',
                      name: 'hello-world',
                      isPrivate: false,
                      isArchived: false,
                      isFork: false,
                      diskUsage: 1024,
                      visibility: 'PUBLIC',
                      defaultBranchRef: { name: 'main' },
                      primaryLanguage: { name: 'TypeScript' },
                    },
                  ],
                },
              },
            },
            observedAt: new Date().toISOString(),
          } as GraphQLResponse<T>;
        }
        return { data: {} as T, observedAt: new Date().toISOString() };
      },

      async readPage<T>(operation: ReadOperation): Promise<ReadPage<T>> {
        if (operation.id.includes('orgs.get')) {
          orgsApiCalled = true;
          return {
            items: [
              { id: 'test-org', login: 'test-org', name: 'Test Org' },
            ] as unknown as T[],
            nextCursor: null,
            observedAt: new Date().toISOString(),
            remainingRequests: 5000,
            resetAt: null,
            status: 200,
          };
        }
        if (operation.id.includes('repos.list-for-org')) {
          reposApiCalled = true;
          return {
            items: [
              {
                id: 1,
                node_id: 'repo-1',
                name: 'hello-world',
                full_name: 'test-org/hello-world',
                private: false,
                archived: false,
                fork: false,
                size: 1024,
                visibility: 'public',
                default_branch: 'main',
              },
            ] as unknown as T[],
            nextCursor: null,
            observedAt: new Date().toISOString(),
            remainingRequests: 5000,
            resetAt: null,
            status: 200,
          };
        }
        return {
          items: [],
          nextCursor: null,
          observedAt: new Date().toISOString(),
          remainingRequests: 5000,
          resetAt: null,
          status: 200,
        };
      },

      async readSingle<T>(
        operation: ReadOperation,
        signal: AbortSignal,
      ): Promise<{ data: T; observedAt: string; status: number }> {
        const page = await this.readPage<T>(operation, null, signal);
        return {
          data: page.items[0] as T,
          observedAt: page.observedAt,
          status: page.status,
        };
      },

      async fetchAll<T>(
        operation: ReadOperation,
        signal: AbortSignal,
      ): Promise<{
        items: readonly T[];
        observedAt: string;
        complete: boolean;
      }> {
        const page = await this.readPage<T>(operation, null, signal);
        return {
          items: page.items,
          observedAt: page.observedAt,
          complete: true,
        };
      },
    };
    (mockAdapter as unknown as { isMock: boolean }).isMock = true;

    // 3. Resume discovery
    const plan = parseDiscoveryOptions([
      '--organization',
      'test-org',
      '--modules',
      'orgs,repos',
      '--output',
      tmpDir,
      '--resume',
      runId,
    ]);

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { token: 'mock-token' },
      mockAdapter,
    );

    const result = await orchestrator.run(new AbortController().signal);

    // Verify orgs was skipped from API call while repos was called
    assert.equal(
      orgsApiCalled,
      false,
      'Expected orgs API not to be called on resume',
    );
    assert.equal(
      reposApiCalled,
      true,
      'Expected repos API to be called on resume',
    );

    // Verify final bundle contains repository entity and organizations
    assert.equal(result.bundle.entities.length, 1);
    assert.equal(result.bundle.organizations.length, 1);
    assert.equal(result.bundle.collectors.length, 2);
    const validation = validateBundle(result.bundle);
    assert.equal(validation.success, true);

    // Verify checkpoint was removed after bundle was published
    assert.equal(
      existsSync(checkpointDir),
      false,
      'Expected checkpoint directory to be cleaned up',
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('DiscoveryOrchestrator rejects resume when target scope mismatches', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-scope-mismatch-'));
  const runId = 'mismatch-test';
  const checkpointDir = join(tmpDir, `.checkpoint-${runId}`);

  try {
    new CheckpointManager(checkpointDir, {
      runId,
      targetScope: { kind: 'organization', name: 'org-original' },
      modules: ['orgs'],
    });

    const plan = parseDiscoveryOptions([
      '--organization',
      'org-different',
      '--modules',
      'orgs',
      '--output',
      tmpDir,
      '--resume',
      runId,
    ]);

    assert.throws(
      () =>
        new DiscoveryOrchestrator(
          plan,
          { token: 'mock-token' },
          {} as GitHubReadAdapter,
        ),
      /Scope mismatch/,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseDiscoveryOptions correctly parses various --resume forms', () => {
  // 1. Bare --resume
  const plan1 = parseDiscoveryOptions([
    '--organization',
    'acme',
    '--modules',
    'orgs',
    '--resume',
  ]);
  assert.equal(plan1.resume, 'latest');

  // 2. --resume <id> without scope or modules
  const plan2 = parseDiscoveryOptions(['--resume', 'scan-123']);
  assert.equal(plan2.resume, 'scan-123');
  assert.equal(plan2.scope.name, '__RESUME__');
  assert.equal(plan2.modules.length, 0);

  // 3. --resume with explicit scope and modules
  const plan3 = parseDiscoveryOptions([
    '--organization',
    'my-org',
    '--modules',
    'repos',
    '--resume',
    'scan-456',
  ]);
  assert.equal(plan3.resume, 'scan-456');
  assert.equal(plan3.scope.name, 'my-org');
  assert.ok(plan3.modules.includes('repos'));
});

test('DiscoveryOrchestrator abort preserves checkpoint directory for resumption', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ghec-abort-test-'));
  try {
    const plan = parseDiscoveryOptions([
      '--organization',
      'test-org',
      '--modules',
      'orgs,repos',
      '--output',
      tmpDir,
    ]);

    const controller = new AbortController();
    const mockAdapter: GitHubReadAdapter = {
      async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
        return { data: {} as T, observedAt: new Date().toISOString() };
      },
      async readPage<T>(): Promise<ReadPage<T>> {
        // Abort right when first request is made
        controller.abort();
        throw new Error('Aborted');
      },
      async readSingle<T>(
        op,
        signal,
      ): Promise<{ data: T; observedAt: string; status: number }> {
        const page = await this.readPage<T>(op, null, signal);
        return {
          data: page.items[0] as T,
          observedAt: page.observedAt,
          status: page.status,
        };
      },
      async fetchAll<T>(
        op,
        signal,
      ): Promise<{
        items: readonly T[];
        observedAt: string;
        complete: boolean;
      }> {
        const page = await this.readPage<T>(op, null, signal);
        return {
          items: page.items,
          observedAt: page.observedAt,
          complete: true,
        };
      },
    };
    (mockAdapter as unknown as { isMock: boolean }).isMock = true;

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { token: 'mock-token' },
      mockAdapter,
    );

    const checkpointDir = orchestrator
      .getCheckpointManager()
      .getCheckpointDir();

    try {
      await assert.rejects(async () => {
        await orchestrator.run(controller.signal);
      }, /Aborted/i);

      // After abort, checkpoint directory must still exist!
      assert.ok(
        existsSync(checkpointDir),
        'Checkpoint directory must be preserved after abort',
      );
    } finally {
      if (existsSync(checkpointDir)) {
        rmSync(checkpointDir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
