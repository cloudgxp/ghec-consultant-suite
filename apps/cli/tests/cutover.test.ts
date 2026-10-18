import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';
import type { TargetWriteClient, TargetWriteOperation } from '@ghec/migration';
import {
  executeCutoverCommand,
  parseCutoverOptions,
} from '../src/commands/cutover.js';

class MockCutoverReadAdapter implements GitHubReadAdapter {
  constructor(
    private readonly routeHandler: (op: ReadOperation) => {
      data: unknown;
      status: number;
    },
  ) {}

  async readSingle<T>(op: ReadOperation): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    const res = this.routeHandler(op);
    if (res.data instanceof Error) {
      throw res.data;
    }
    return {
      data: res.data as T,
      status: res.status,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    throw new Error('Not implemented');
  }

  async fetchAll<T>(): Promise<{
    items: T[];
    totalCount?: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented');
  }

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    throw new Error('Not implemented');
  }
}

class MockCutoverWriteClient implements TargetWriteClient {
  readonly mutations: TargetWriteOperation[] = [];
  failOnPath?: string;

  async mutate(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: unknown }> {
    if (this.failOnPath && op.path === this.failOnPath) {
      throw new Error(`Simulated failure on ${op.method} ${op.path}`);
    }
    this.mutations.push(op);
    return { status: 200, data: {} };
  }
}

describe('cutover CLI command', () => {
  it('parseCutoverOptions parses flags and enforces required org or scope inputs', () => {
    assert.throws(() => parseCutoverOptions([]), /Either --scope/);

    const opts = parseCutoverOptions([
      '--source-org',
      'demogxp',
      '--target-org',
      'demogxp-mig5',
      '--repos',
      'demo, api-core',
      '--deactivate-source-webhooks',
      '--disable-source-actions',
      '--archive-source-repos',
      '--dry-run',
    ]);

    assert.equal(opts.sourceOrg, 'demogxp');
    assert.equal(opts.targetOrg, 'demogxp-mig5');
    assert.deepEqual(opts.repos, ['demo', 'api-core']);
    assert.equal(opts.includeDeployKeys, true);
    assert.equal(opts.includePagesCname, true);
    assert.equal(opts.deactivateSourceWebhooks, true);
    assert.equal(opts.disableSourceActions, true);
    assert.equal(opts.archiveSourceRepos, true);
    assert.equal(opts.dryRun, true);
  });

  it('executeCutoverCommand plans deploy-key and Pages CNAME cutover in dry-run mode without mutating', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cutover-dry-'));
    try {
      const sourceWrite = new MockCutoverWriteClient();
      const targetWrite = new MockCutoverWriteClient();

      const sourceClient = new MockCutoverReadAdapter((op) => {
        if (op.path === '/repos/{owner}/{repo}/keys') {
          return {
            status: 200,
            data: [
              {
                id: 101,
                title: 'Demogxp-test-deploy',
                key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey',
                read_only: false,
              },
            ],
          };
        }
        if (op.path === '/repos/{owner}/{repo}/pages') {
          return {
            status: 200,
            data: {
              cname: 'docs.example.com',
              https_enforced: true,
            },
          };
        }
        return { status: 200, data: [] };
      });

      const targetClient = new MockCutoverReadAdapter((op) => {
        if (op.path === '/repos/{owner}/{repo}/keys') {
          return { status: 200, data: [] };
        }
        if (op.path === '/repos/{owner}/{repo}/pages') {
          return { status: 200, data: { cname: null } };
        }
        return { status: 200, data: [] };
      });

      const { report } = await executeCutoverCommand(
        {
          sourceOrg: 'demogxp',
          targetOrg: 'demogxp-mig5',
          repos: ['demo'],
          includeDeployKeys: true,
          includePagesCname: true,
          deactivateSourceWebhooks: false,
          disableSourceActions: false,
          archiveSourceRepos: false,
          dryRun: true,
          outputPath: join(tmpDir, 'cutover.json'),
          appendStepSummary: false,
        },
        {
          sourceClient,
          targetClient,
          sourceWriteClient: sourceWrite,
          targetWriteClient: targetWrite,
        },
      );

      assert.equal(report.dryRun, true);
      assert.equal(report.summary.planned, 2);
      assert.equal(sourceWrite.mutations.length, 0);
      assert.equal(targetWrite.mutations.length, 0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('executeCutoverCommand detaches deploy keys and Pages CNAME from source and migrates to target in live mode', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cutover-live-'));
    try {
      const sourceWrite = new MockCutoverWriteClient();
      const targetWrite = new MockCutoverWriteClient();

      const sourceClient = new MockCutoverReadAdapter((op) => {
        if (op.path === '/repos/{owner}/{repo}/keys') {
          return {
            status: 200,
            data: [
              {
                id: 101,
                title: 'Demogxp-test-deploy',
                key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey',
                read_only: false,
              },
            ],
          };
        }
        if (op.path === '/repos/{owner}/{repo}/pages') {
          return {
            status: 200,
            data: {
              cname: 'docs.example.com',
              https_enforced: true,
            },
          };
        }
        if (op.path === '/repos/{owner}/{repo}/hooks') {
          return {
            status: 200,
            data: [
              {
                id: 555,
                active: true,
                config: { url: 'https://ci.example.com/webhook' },
              },
            ],
          };
        }
        return { status: 200, data: [] };
      });

      const targetClient = new MockCutoverReadAdapter((op) => {
        if (op.path === '/repos/{owner}/{repo}/keys') {
          return { status: 200, data: [] };
        }
        if (op.path === '/repos/{owner}/{repo}/pages') {
          return { status: 200, data: { cname: null } };
        }
        return { status: 200, data: [] };
      });

      const { report } = await executeCutoverCommand(
        {
          sourceOrg: 'demogxp',
          targetOrg: 'demogxp-mig5',
          repos: ['demo'],
          includeDeployKeys: true,
          includePagesCname: true,
          deactivateSourceWebhooks: true,
          disableSourceActions: true,
          archiveSourceRepos: true,
          dryRun: false,
          outputPath: join(tmpDir, 'cutover-live.json'),
          appendStepSummary: false,
        },
        {
          sourceClient,
          targetClient,
          sourceWriteClient: sourceWrite,
          targetWriteClient: targetWrite,
        },
      );

      assert.equal(report.summary.succeeded, 5);
      assert.equal(report.summary.failed, 0);

      // Verify source mutations: DELETE key, PUT pages cname=null, PATCH hook active=false, PUT actions permissions enabled=false, PATCH repo archived=true
      assert.ok(
        sourceWrite.mutations.some(
          (m) =>
            m.method === 'DELETE' &&
            m.path === '/repos/{owner}/{repo}/keys/{key_id}',
        ),
      );
      assert.ok(
        sourceWrite.mutations.some(
          (m) => m.method === 'PUT' && m.path === '/repos/{owner}/{repo}/pages',
        ),
      );
      assert.ok(
        sourceWrite.mutations.some(
          (m) =>
            m.method === 'PATCH' &&
            m.path === '/repos/{owner}/{repo}/hooks/{hook_id}',
        ),
      );
      assert.ok(
        sourceWrite.mutations.some(
          (m) =>
            m.method === 'PUT' &&
            m.path === '/repos/{owner}/{repo}/actions/permissions',
        ),
      );
      assert.ok(
        sourceWrite.mutations.some(
          (m) => m.method === 'PATCH' && m.path === '/repos/{owner}/{repo}',
        ),
      );

      // Verify target mutations: POST key, PUT pages cname
      assert.ok(
        targetWrite.mutations.some(
          (m) => m.method === 'POST' && m.path === '/repos/{owner}/{repo}/keys',
        ),
      );
      assert.ok(
        targetWrite.mutations.some(
          (m) => m.method === 'PUT' && m.path === '/repos/{owner}/{repo}/pages',
        ),
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('executeCutoverCommand automatically rolls back deploy key to source if target creation fails', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cutover-rollback-'));
    try {
      const sourceWrite = new MockCutoverWriteClient();
      const targetWrite = new MockCutoverWriteClient();
      targetWrite.failOnPath = '/repos/{owner}/{repo}/keys';

      const sourceClient = new MockCutoverReadAdapter((op) => {
        if (op.path === '/repos/{owner}/{repo}/keys') {
          return {
            status: 200,
            data: [
              {
                id: 101,
                title: 'Demogxp-test-deploy',
                key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey',
                read_only: true,
              },
            ],
          };
        }
        return { status: 200, data: [] };
      });

      const targetClient = new MockCutoverReadAdapter(() => ({
        status: 200,
        data: [],
      }));

      const { report } = await executeCutoverCommand(
        {
          sourceOrg: 'demogxp',
          targetOrg: 'demogxp-mig5',
          repos: ['demo'],
          includeDeployKeys: true,
          includePagesCname: false,
          deactivateSourceWebhooks: false,
          disableSourceActions: false,
          archiveSourceRepos: false,
          dryRun: false,
          outputPath: join(tmpDir, 'cutover-rollback.json'),
          appendStepSummary: false,
        },
        {
          sourceClient,
          targetClient,
          sourceWriteClient: sourceWrite,
          targetWriteClient: targetWrite,
        },
      );

      assert.equal(report.summary.rolledBack, 1);
      assert.equal(report.actions[0]?.status, 'rolled-back');
      // Source should have DELETE followed by POST rollback
      assert.equal(sourceWrite.mutations.length, 2);
      assert.equal(sourceWrite.mutations[0]?.method, 'DELETE');
      assert.equal(sourceWrite.mutations[1]?.method, 'POST');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
