import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationPlan,
  type MigrationScope,
  validateVerificationReport,
} from '@ghec/contracts';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';
import {
  createDefaultModuleRegistry,
  HttpTargetWriteClient,
  MigrationOrchestrator,
  type TargetWriteClient,
  type TargetWriteOperation,
  VerificationOrchestrator,
  writeVerificationReportFile,
} from '../src/index.js';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly targetVariables: Array<{ name: string; value: string }>;

  constructor(targetVariables: Array<{ name: string; value: string }> = []) {
    this.targetVariables = targetVariables;
  }

  async readSingle<T>(
    operation: ReadOperation,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    if (operation.path.includes('/actions/variables')) {
      return {
        data: {
          total_count: this.targetVariables.length,
          variables: this.targetVariables.map((v) => ({
            name: v.name,
            value: v.value,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            visibility: 'all',
          })),
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    return { data: {} as T, status: 200, observedAt: new Date().toISOString() };
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

  async readEndpoint<T>(
    endpoint: string,
  ): Promise<{ data: T; status: number }> {
    if (endpoint.includes('/actions/variables')) {
      return {
        data: {
          total_count: this.targetVariables.length,
          variables: this.targetVariables.map((v) => ({
            name: v.name,
            value: v.value,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            visibility: 'all',
          })),
        } as unknown as T,
        status: 200,
      };
    }
    return { data: {} as T, status: 200 };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return { status: op.method === 'POST' ? 201 : 204, data: undefined };
  }
}

const mockScope: MigrationScope = {
  version: MIGRATION_SCHEMA_VERSION,
  name: 'test-scope',
  organizations: [{ source: 'src-org', target: 'dst-org' }],
  repositories: [
    {
      sourceOrg: 'src-org',
      sourceRepo: 'repo-a',
      targetOrg: 'dst-org',
      targetRepo: 'repo-a',
      useGei: true,
      modules: ['repo-variables'],
    },
  ],
};

const mockPlan: MigrationPlan = {
  schemaVersion: MIGRATION_SCHEMA_VERSION,
  planId: 'plan-12345',
  createdAt: '2026-10-04T00:00:00.000Z',
  scopeName: 'test-scope',
  summary: {
    create: 1,
    update: 0,
    noop: 0,
    skip: 0,
    warn: 0,
  },
  modules: [
    {
      moduleId: 'repo-variables',
      scopeLevel: 'repository',
      targetIdentifier: 'dst-org/repo-a',
      warnings: [],
      operations: [
        {
          id: 'var-create-API_KEY',
          operation: 'create',
          resourceType: 'variable',
          resourceName: 'API_KEY',
          sourceState: { name: 'API_KEY', value: 'secret-val' },
          payload: { name: 'API_KEY', value: 'secret-val' },
        },
      ],
    },
  ],
};

test('MigrationOrchestrator executes pre-approved plan in dry-run mode', async () => {
  const registry = createDefaultModuleRegistry();
  const sourceClient = new MockReadAdapter();
  const targetClient = new MockReadAdapter();

  const orchestrator = new MigrationOrchestrator({
    registry,
    sourceClient,
    targetClient,
    plan: mockPlan,
    scope: mockScope,
    dryRun: true,
  });

  const report = await orchestrator.run();
  assert.equal(report.status, 'complete');
  assert.equal(report.exitCode, 0);
  assert.equal(report.dryRun, true);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0]!.status, 'complete');
  assert.equal(report.results[0]!.results.length, 1);
  assert.equal(report.results[0]!.results[0]!.status, 'succeeded');
});

test('MigrationOrchestrator executes live mutations via TargetWriteClient', async () => {
  const registry = createDefaultModuleRegistry();
  const sourceClient = new MockReadAdapter();
  const targetClient = new MockReadAdapter();
  const writeClient = new MockWriteClient();

  const orchestrator = new MigrationOrchestrator({
    registry,
    sourceClient,
    targetClient,
    targetWriteClient: writeClient,
    plan: mockPlan,
    scope: mockScope,
    dryRun: false,
  });

  const report = await orchestrator.run();
  assert.equal(report.status, 'complete');
  assert.equal(report.exitCode, 0);
  assert.equal(writeClient.calls.length, 1);
  assert.equal(writeClient.calls[0]!.method, 'POST');
  assert.equal(
    writeClient.calls[0]!.path,
    '/repos/{owner}/{repo}/actions/variables',
  );
});

test('MigrationOrchestrator throws if live migration lacks TargetWriteClient', async () => {
  const registry = createDefaultModuleRegistry();
  const sourceClient = new MockReadAdapter();
  const targetClient = new MockReadAdapter();

  const orchestrator = new MigrationOrchestrator({
    registry,
    sourceClient,
    targetClient,
    plan: mockPlan,
    dryRun: false,
  });

  await assert.rejects(
    () => orchestrator.run(),
    /TargetWriteClient must be configured to execute live migration mutations/,
  );
});

test('MigrationOrchestrator generates plan from scope on-the-fly and applies', async () => {
  const registry = createDefaultModuleRegistry();
  const sourceClient = new MockReadAdapter([
    { name: 'EXISTING_VAR', value: 'val1' },
  ]);
  const targetClient = new MockReadAdapter();

  const orchestrator = new MigrationOrchestrator({
    registry,
    sourceClient,
    targetClient,
    scope: mockScope,
    dryRun: true,
  });

  const report = await orchestrator.run();
  assert.equal(report.status, 'complete');
  assert.equal(report.exitCode, 0);
  assert.equal(report.results.length, 8);
});

test('VerificationOrchestrator verifies target state and generates report', async () => {
  const registry = createDefaultModuleRegistry();
  const targetClient = new MockReadAdapter([
    { name: 'API_KEY', value: 'secret-val' },
  ]);

  const orchestrator = new VerificationOrchestrator({
    registry,
    targetClient,
    plan: mockPlan,
    scope: mockScope,
  });

  const result = await orchestrator.run();
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.summary.verifiedModuleCount, 1);
  assert.equal(result.report.summary.unverifiedModuleCount, 0);
  assert.equal(result.report.summary.discrepancyCount, 0);

  const validation = validateVerificationReport(result.report);
  assert.ok(validation.success, 'Verification report must be valid');

  const dir = mkdtempSync(join(tmpdir(), 'ghec-verify-'));
  try {
    const reportFile = join(dir, 'verification-report.json');
    writeVerificationReportFile(reportFile, result.report);
    const content = JSON.parse(readFileSync(reportFile, 'utf8'));
    assert.equal(content.reportId, result.report.reportId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('VerificationOrchestrator reports discrepancies and non-zero exit code when state differs', async () => {
  const registry = createDefaultModuleRegistry();
  // Target does not have API_KEY
  const targetClient = new MockReadAdapter([]);

  const orchestrator = new VerificationOrchestrator({
    registry,
    targetClient,
    plan: mockPlan,
    scope: mockScope,
  });

  const result = await orchestrator.run();
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.summary.verifiedModuleCount, 0);
  assert.equal(result.report.summary.unverifiedModuleCount, 1);
  assert.equal(result.report.summary.discrepancyCount, 1);
  assert.match(
    result.report.modules[0]!.discrepancies[0]!.message,
    /is missing on target repository/,
  );
});

test('HttpTargetWriteClient performs HTTP mutations', async () => {
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedHeaders: Record<string, string> = {};
  let capturedBody = '';

  const customFetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    capturedUrl = String(url);
    capturedMethod = init?.method ?? 'GET';
    capturedHeaders = (init?.headers as Record<string, string>) ?? {};
    capturedBody = (init?.body as string) ?? '';
    return new Response(JSON.stringify({ created: true }), {
      status: 201,
      headers: { 'x-ratelimit-remaining': '4999' },
    });
  }) as typeof globalThis.fetch;

  const client = new HttpTargetWriteClient({
    token: 'mock-target-token',
    baseUrl: 'https://mock.api.github.com',
    fetchImpl: customFetch,
  });

  const res = await client.mutate<{ created: boolean }>(
    {
      id: 'create-var',
      method: 'POST',
      path: '/repos/{owner}/{repo}/actions/variables',
      pathParams: { owner: 'dst-org', repo: 'test-repo' },
      body: { name: 'MY_VAR', value: 'abc' },
    },
    new AbortController().signal,
  );

  assert.equal(res.status, 201);
  assert.equal(res.data?.created, true);
  assert.equal(
    capturedUrl,
    'https://mock.api.github.com/repos/dst-org/test-repo/actions/variables',
  );
  assert.equal(capturedMethod, 'POST');
  assert.equal(capturedHeaders.Authorization, 'Bearer mock-target-token');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
  assert.equal(JSON.parse(capturedBody).name, 'MY_VAR');
});

test('HttpTargetWriteClient normalizes trailing slashes on baseUrl', async () => {
  let capturedUrl = '';
  const customFetch = (async (url: string | URL | Request) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof globalThis.fetch;

  const client = new HttpTargetWriteClient({
    token: 'mock-token',
    baseUrl: 'https://mock.api.github.com///',
    fetchImpl: customFetch,
  });

  await client.mutate(
    {
      id: 'test-slash',
      method: 'GET',
      path: '/orgs/{owner}',
      pathParams: { owner: 'my-org' },
    },
    new AbortController().signal,
  );

  assert.equal(capturedUrl, 'https://mock.api.github.com/orgs/my-org');
});
