import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_IDS, validateBundle } from '@ghec/contracts';
import { parseDiscoveryOptions } from '../src/commands/discover.js';
import { collectors } from '../src/collectors/index.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';
import type {
  GitHubReadAdapter,
  ReadOperation,
  ReadPage,
} from '../src/github/adapter.js';

const org = ['--organization', 'fictional-north'];

test('all and selected modules resolve deterministic dependencies', () => {
  assert.deepEqual(
    parseDiscoveryOptions([...org, '--modules', 'all']).modules,
    [...MODULE_IDS],
  );
  assert.deepEqual(
    parseDiscoveryOptions([...org, '--modules', 'teams, lfs,teams']).modules,
    ['orgs', 'repos', 'lfs', 'teams'],
  );
  assert.equal(
    parseDiscoveryOptions([
      '--enterprise',
      'fictional-enterprise',
      '--modules',
      'repos',
    ]).scope.kind,
    'enterprise',
  );
});

test('unsafe or ambiguous grammar fails', () => {
  for (const args of [
    [],
    [...org],
    [...org, '--enterprise', 'x', '--modules', 'all'],
    [...org, '--modules', 'all,repos'],
    [...org, '--modules', 'repos,'],
    [...org, '--modules', 'repos', '--format', 'csv'],
    [...org, '--modules', 'repos', '--redaction-profile', 'none'],
    [...org, '--module', 'repos'],
  ])
    assert.throws(() => parseDiscoveryOptions(args));
});

test('all catalog modules are implemented', () => {
  assert.equal(collectors.length, 11);
  assert.deepEqual(
    collectors.map((c) => c.id),
    [...MODULE_IDS],
  );
  assert.ok(collectors.every((c) => c.implementation === 'implemented'));
});

test('CLI dry-run prints preflight plan and writes no bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-cli-dry-'));
  try {
    const cli = new URL('../bin/ghec-consultant-cli.mjs', import.meta.url);
    const r = spawnSync(
      process.execPath,
      [
        cli.pathname,
        'discover',
        ...org,
        '--modules',
        'all',
        '--dry-run',
        '--output',
        dir,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, GHEC_TOKEN: 'SENSITIVE_TEST_SENTINEL' },
      },
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /PREFLIGHT DISCOVERY PLAN/);
    assert.match(r.stdout, /Target Scope:\s+ORGANIZATION "fictional-north"/);
    assert.match(r.stdout, /Execution DAG Order:/);
    assert.doesNotMatch(r.stderr + r.stdout, /SENSITIVE_TEST_SENTINEL/);
    assert.deepEqual(readdirSync(dir), []);

    const bad = spawnSync(
      process.execPath,
      [cli.pathname, 'discover', '--SENSITIVE_TEST_SENTINEL'],
      { encoding: 'utf8' },
    );
    assert.equal(bad.status, 2);
    assert.doesNotMatch(bad.stderr, /SENSITIVE_TEST_SENTINEL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI live run requires GHEC_TOKEN', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-cli-notoken-'));
  try {
    const cli = new URL('../bin/ghec-consultant-cli.mjs', import.meta.url);
    const env = { ...process.env };
    delete env.GHEC_TOKEN;

    const r = spawnSync(
      process.execPath,
      [cli.pathname, 'discover', ...org, '--modules', 'all', '--output', dir],
      { encoding: 'utf8', env },
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /GHEC_TOKEN environment variable is required/);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

class MockGitHubReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly failModule?: string;

  constructor(options?: { failModule?: string }) {
    this.failModule = options?.failModule;
  }

  private checkFailure(operationId: string): void {
    if (
      this.failModule &&
      (operationId.includes(this.failModule) ||
        (this.failModule === 'actions-secrets' &&
          operationId === 'rest.actions.list-org-secrets'))
    ) {
      throw new Error(`Synthetic error for ${operationId}`);
    }
  }

  async readSingle<T>(
    operation: ReadOperation,
    signal: AbortSignal,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    if (signal.aborted) throw new Error('Aborted');
    this.checkFailure(operation.id);
    const now = new Date().toISOString();
    if (operation.id === 'rest.orgs.get') {
      return {
        data: {
          id: 101,
          login: 'fictional-north',
          name: 'Fictional North Corp',
        } as unknown as T,
        status: 200,
        observedAt: now,
      };
    }
    return { data: {} as T, status: 200, observedAt: now };
  }

  async readPage<T>(
    operation: ReadOperation,
    _cursor: string | null,
    signal: AbortSignal,
  ): Promise<ReadPage<T>> {
    const res = await this.fetchAll<T>(operation, signal);
    return {
      items: res.items,
      nextCursor: null,
      status: 200,
      observedAt: res.observedAt,
    };
  }

  async fetchAll<T>(
    operation: ReadOperation,
    signal: AbortSignal,
  ): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
    reason?: string;
  }> {
    if (signal.aborted) throw new Error('Aborted');
    this.checkFailure(operation.id);
    const now = new Date().toISOString();

    if (operation.id === 'rest.repos.list-for-org') {
      return {
        items: [
          {
            id: 201,
            name: 'core-repo',
            visibility: 'private',
            default_branch: 'main',
            archived: false,
            disabled: false,
            size: 1024,
            fork: false,
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }
    if (operation.id === 'rest.teams.list') {
      return {
        items: [
          {
            id: 301,
            slug: 'platform-team',
            name: 'Platform Team',
            members_count: 5,
            parent: null,
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }
    if (operation.id === 'rest.actions.list-org-secrets') {
      return {
        items: [
          {
            name: 'DEPLOY_SECRET',
            updated_at: '2026-01-02T00:00:00Z',
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }
    if (operation.id === 'rest.repos.get-org-rulesets') {
      return {
        items: [
          {
            id: 401,
            name: 'main-ruleset',
            enforcement: 'active',
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }
    if (operation.id === 'rest.orgs.list-app-installations') {
      return {
        items: [
          {
            id: 601,
            app_slug: 'ci-bot',
            suspended_at: null,
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }
    if (operation.id === 'rest.orgs.list-members') {
      return {
        items: [
          {
            id: 801,
            login: 'alice',
            role: 'admin',
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }
    if (operation.id === 'rest.packages.list-packages-for-organization') {
      return {
        items: [
          {
            id: 901,
            name: 'core-package',
            package_type: 'npm',
          } as unknown as T,
        ],
        observedAt: now,
        complete: true,
      };
    }

    return { items: [], observedAt: now, complete: true };
  }
}

test('DiscoveryOrchestrator runs full discovery with mock adapter and produces valid bundle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-full-'));
  try {
    const plan = parseDiscoveryOptions([
      ...org,
      '--modules',
      'all',
      '--output',
      dir,
    ]);
    const mockAdapter = new MockGitHubReadAdapter();
    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { baseUrl: 'https://api.github.com', apiVersion: '2026-03-10' },
      mockAdapter,
    );

    const controller = new AbortController();
    const result = await orchestrator.run(controller.signal);

    assert.equal(result.exitCode, 0);
    assert.equal(result.bundle.scan.status, 'complete');
    assert.equal(result.bundle.summary.completeCollectorCount, 11);
    assert.equal(result.bundle.summary.incompleteCollectorCount, 0);
    assert.equal(result.bundle.errors.length, 0);
    assert.equal(result.bundle.organizations.length, 1);
    assert.equal(result.bundle.organizations[0]?.login, 'fictional-north');

    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);

    const diskContent = JSON.parse(readFileSync(result.filePath, 'utf8'));
    assert.equal(diskContent.scan.id, result.bundle.scan.id);
    assert.equal(diskContent.entities.length, result.bundle.entities.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DiscoveryOrchestrator handles error with continueOnError = true (exit 4 and partial bundle)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-partial-'));
  try {
    const plan = parseDiscoveryOptions([
      ...org,
      '--modules',
      'all',
      '--continue-on-error',
      '--output',
      dir,
    ]);
    const mockAdapter = new MockGitHubReadAdapter({
      failModule: 'actions-secrets',
    });
    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { baseUrl: 'https://api.github.com', apiVersion: '2026-03-10' },
      mockAdapter,
    );

    const controller = new AbortController();
    const result = await orchestrator.run(controller.signal);

    assert.equal(result.exitCode, 4);
    assert.equal(result.bundle.scan.status, 'partial');
    assert.equal(result.bundle.summary.incompleteCollectorCount, 1);
    assert.equal(result.bundle.summary.completeCollectorCount, 10);
    assert.ok(result.bundle.errors.length > 0);

    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DiscoveryOrchestrator fails immediately when continueOnError is false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-fail-'));
  try {
    const plan = parseDiscoveryOptions([
      ...org,
      '--modules',
      'all',
      '--output',
      dir,
    ]);
    const mockAdapter = new MockGitHubReadAdapter({
      failModule: 'actions-secrets',
    });
    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { baseUrl: 'https://api.github.com', apiVersion: '2026-03-10' },
      mockAdapter,
    );

    const controller = new AbortController();
    await assert.rejects(
      () => orchestrator.run(controller.signal),
      /Synthetic error for rest\.actions\.list-org-secrets/,
    );
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DiscoveryOrchestrator aborts when AbortSignal triggers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-abort-'));
  try {
    const plan = parseDiscoveryOptions([
      ...org,
      '--modules',
      'all',
      '--output',
      dir,
    ]);
    const mockAdapter = new MockGitHubReadAdapter();
    const orchestrator = new DiscoveryOrchestrator(
      plan,
      { baseUrl: 'https://api.github.com', apiVersion: '2026-03-10' },
      mockAdapter,
    );

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => orchestrator.run(controller.signal));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI end-to-end execution against mock HTTP server', async () => {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/orgs/fictional-north') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 101,
          login: 'fictional-north',
          name: 'Fictional North Corp',
        }),
      );
      return;
    }
    if (url.startsWith('/orgs/fictional-north/repos')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 201,
            name: 'core-repo',
            visibility: 'private',
            default_branch: 'main',
            archived: false,
            disabled: false,
            is_template: false,
            size: 1024,
          },
        ]),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const dir = mkdtempSync(join(tmpdir(), 'ghec-cli-e2e-'));
  try {
    const cli = new URL('../bin/ghec-consultant-cli.mjs', import.meta.url);
    const childResult = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          cli.pathname,
          'discover',
          ...org,
          '--modules',
          'orgs,repos',
          '--output',
          dir,
        ],
        {
          env: {
            ...process.env,
            GHEC_BASE_URL: `http://127.0.0.1:${port}`,
            GHEC_TOKEN: 'mock-token',
          },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    assert.equal(childResult.code, 0);
    assert.match(childResult.stdout, /Discovery finished with exit code 0/);
    assert.match(childResult.stdout, /Status: complete/);

    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    const bundleContent = JSON.parse(
      readFileSync(join(dir, files[0]!), 'utf8'),
    );
    const validation = validateBundle(bundleContent);
    assert.ok(validation.success, validation.message);
    assert.equal(bundleContent.organizations[0]?.login, 'fictional-north');
    assert.equal(bundleContent.entities.length, 1);
    assert.equal(bundleContent.entities[0]?.name, 'core-repo');
  } finally {
    server.close();
    server.closeAllConnections?.();
    rmSync(dir, { recursive: true, force: true });
  }
});
