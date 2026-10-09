import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import type {
  TargetWriteClient,
  TargetWriteOperation,
} from '../../src/core/types.js';
import { MigrationResultsRepoPublisher } from '../../src/reporting/index.js';

test('creates repo when missing and publishes complete atomic commit tree', async () => {
  let readRepoCalled = false;
  let readRefCalled = false;
  const mutations: TargetWriteOperation[] = [];

  const mockTargetClient: GitHubReadAdapter = {
    queryGraphQL: async () => {
      throw new Error('Not implemented in mock');
    },
    readPage: async () => {
      throw new Error('Not implemented in mock');
    },
    fetchAll: async () => {
      throw new Error('Not implemented in mock');
    },
    readSingle: async <T>(op: ReadOperation) => {
      if (op.path === '/repos/{owner}/{repo}') {
        readRepoCalled = true;
        // Simulate 404 Not Found on first check
        throw new Error('GitHub API Error: 404 Not Found');
      }
      if (op.path === '/repos/{owner}/{repo}/git/ref/heads/{branch}') {
        readRefCalled = true;
        return {
          status: 200,
          observedAt: new Date().toISOString(),
          data: { object: { sha: 'base-commit-sha-123' } } as unknown as T,
        };
      }
      throw new Error(`Unexpected read path: ${op.path}`);
    },
  };

  let blobCounter = 1;
  const mockTargetWriteClient: TargetWriteClient = {
    mutate: async <T>(operation: TargetWriteOperation) => {
      mutations.push(operation);

      if (operation.path === '/orgs/{org}/repos') {
        return {
          status: 201,
          data: { name: 'gei-migration-results' } as unknown as T,
        };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/blobs') {
        return {
          status: 201,
          data: { sha: `blob-sha-${blobCounter++}` } as unknown as T,
        };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/trees') {
        return { status: 201, data: { sha: 'tree-sha-999' } as unknown as T };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/commits') {
        return {
          status: 201,
          data: { sha: 'new-commit-sha-456' } as unknown as T,
        };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/refs/heads/{branch}') {
        return { status: 200, data: {} as unknown as T };
      }
      throw new Error(`Unexpected write path: ${operation.path}`);
    },
  };

  const publisher = new MigrationResultsRepoPublisher({
    targetOrg: 'acme-corp-emu',
    targetClient: mockTargetClient,
    targetWriteClient: mockTargetWriteClient,
  });

  const files = {
    'README.md': '# Migration Results Summary',
    'manifest.json': '{"schemaVersion":"1.0.0"}',
    'success/repo-a.md': '# Success Repo A',
  };

  const result = await publisher.publish(files);

  assert.equal(readRepoCalled, true);
  assert.equal(readRefCalled, true);
  assert.equal(result.commitSha, 'new-commit-sha-456');
  assert.equal(result.filesCommitted, 3);
  assert.equal(result.dryRun, false);

  // Check mutation sequence:
  // 1: POST /orgs/{org}/repos (create repo)
  // 2, 3, 4: POST /git/blobs (3 files)
  // 5: POST /git/trees (tree with base_tree)
  // 6: POST /git/commits (commit)
  // 7: PATCH /git/refs/heads/main (update ref)
  assert.equal(mutations.length, 7);
  assert.equal(mutations[0].path, '/orgs/{org}/repos');
  assert.equal(mutations[1].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[2].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[3].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[4].path, '/repos/{owner}/{repo}/git/trees');
  assert.equal(mutations[5].path, '/repos/{owner}/{repo}/git/commits');
  assert.equal(
    mutations[6].path,
    '/repos/{owner}/{repo}/git/refs/heads/{branch}',
  );
});

test('updates existing repo without re-creating repository', async () => {
  const mutations: TargetWriteOperation[] = [];

  const mockTargetClient: GitHubReadAdapter = {
    queryGraphQL: async () => {
      throw new Error('Not implemented');
    },
    readPage: async () => {
      throw new Error('Not implemented');
    },
    fetchAll: async () => {
      throw new Error('Not implemented');
    },
    readSingle: async <T>(op: ReadOperation) => {
      if (op.path === '/repos/{owner}/{repo}') {
        return {
          status: 200,
          observedAt: new Date().toISOString(),
          data: { name: 'gei-migration-results' } as unknown as T,
        };
      }
      if (op.path === '/repos/{owner}/{repo}/git/ref/heads/{branch}') {
        return {
          status: 200,
          observedAt: new Date().toISOString(),
          data: { object: { sha: 'existing-commit-sha' } } as unknown as T,
        };
      }
      throw new Error(`Unexpected path: ${op.path}`);
    },
  };

  const mockTargetWriteClient: TargetWriteClient = {
    mutate: async <T>(operation: TargetWriteOperation) => {
      mutations.push(operation);
      if (operation.path === '/repos/{owner}/{repo}/git/blobs') {
        return { status: 201, data: { sha: 'blob-sha' } as unknown as T };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/trees') {
        return { status: 201, data: { sha: 'tree-sha' } as unknown as T };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/commits') {
        return {
          status: 201,
          data: { sha: 'updated-commit-sha' } as unknown as T,
        };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/refs/heads/{branch}') {
        return { status: 200, data: {} as unknown as T };
      }
      throw new Error(`Unexpected mutation: ${operation.path}`);
    },
  };

  const publisher = new MigrationResultsRepoPublisher({
    targetOrg: 'acme-corp-emu',
    targetClient: mockTargetClient,
    targetWriteClient: mockTargetWriteClient,
  });

  const result = await publisher.publish({ 'README.md': '# Updated Results' });

  assert.equal(result.commitSha, 'updated-commit-sha');
  // Does NOT contain repo creation mutation
  assert.ok(!mutations.some((m) => m.path === '/orgs/{org}/repos'));
  assert.equal(mutations.length, 4); // 1 blob + 1 tree + 1 commit + 1 ref update
});

test('dry-run mode produces zero write mutations', async () => {
  const mutations: TargetWriteOperation[] = [];

  const mockTargetClient: GitHubReadAdapter = {
    queryGraphQL: async () => {
      throw new Error('Not implemented');
    },
    readPage: async () => {
      throw new Error('Not implemented');
    },
    fetchAll: async () => {
      throw new Error('Not implemented');
    },
    readSingle: async () => {
      throw new Error('404 Not Found');
    },
  };

  const mockTargetWriteClient: TargetWriteClient = {
    mutate: async () => {
      throw new Error('Mutate should NOT be called in dry-run mode');
    },
  };

  const publisher = new MigrationResultsRepoPublisher({
    targetOrg: 'acme-corp-emu',
    targetClient: mockTargetClient,
    targetWriteClient: mockTargetWriteClient,
    dryRun: true,
  });

  const result = await publisher.publish({ 'README.md': '# Test' });

  assert.equal(result.dryRun, true);
  assert.equal(result.commitSha, 'dry-run-sha');
  assert.equal(result.filesCommitted, 1);
  assert.equal(mutations.length, 0);
});

test('defensively handles errors and redacts tokens from exception messages', async () => {
  const mockTargetClient: GitHubReadAdapter = {
    queryGraphQL: async () => {
      throw new Error('Not implemented');
    },
    readPage: async () => {
      throw new Error('Not implemented');
    },
    fetchAll: async () => {
      throw new Error('Not implemented');
    },
    readSingle: async () => {
      throw new Error(
        'Connection rejected with token ghp_secret12345678901234567890 at https://api.github.com',
      );
    },
  };

  const publisher = new MigrationResultsRepoPublisher({
    targetOrg: 'acme-corp-emu',
    targetClient: mockTargetClient,
  });

  await assert.rejects(
    async () => {
      await publisher.ensureTargetRepository();
    },
    (err: Error) => {
      assert.ok(!err.message.includes('ghp_secret12345678901234567890'));
      assert.ok(err.message.includes('[REDACTED_TOKEN]'));
      return true;
    },
  );
});
