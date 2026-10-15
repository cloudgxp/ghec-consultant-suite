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
    'organization/teams.md': '# Organization Module: teams',
    'success/repo-a.md': '# Success Repo A',
    'repositories/repo-a/repo-variables.md': '# Repo Variables',
  };

  const result = await publisher.publish(files);

  assert.equal(readRepoCalled, true);
  assert.equal(readRefCalled, true);
  assert.equal(result.commitSha, 'new-commit-sha-456');
  assert.equal(result.filesCommitted, 5);
  assert.equal(result.dryRun, false);

  // Check mutation sequence:
  // 1: POST /orgs/{org}/repos (create repo)
  // 2..6: POST /git/blobs (5 files across 3 tiers)
  // 7: POST /git/trees (tree with base_tree)
  // 8: POST /git/commits (commit)
  // 9: PATCH /git/refs/heads/main (update ref)
  assert.equal(mutations.length, 9);
  assert.equal(mutations[0].path, '/orgs/{org}/repos');
  assert.equal(mutations[1].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[2].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[3].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[4].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[5].path, '/repos/{owner}/{repo}/git/blobs');
  assert.equal(mutations[6].path, '/repos/{owner}/{repo}/git/trees');
  assert.equal(mutations[7].path, '/repos/{owner}/{repo}/git/commits');
  assert.equal(
    mutations[8].path,
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

test('starts from clean root tree on batch 1 and chains base_tree on subsequent batches', async () => {
  const treeMutations: TargetWriteOperation[] = [];
  const commitMutations: TargetWriteOperation[] = [];

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
          data: { name: 'migration-audit-results' } as unknown as T,
        };
      }
      if (op.path === '/repos/{owner}/{repo}/git/ref/heads/{branch}') {
        return {
          status: 200,
          observedAt: new Date().toISOString(),
          data: { object: { sha: 'prior-commit-sha-111' } } as unknown as T,
        };
      }
      throw new Error(`Unexpected path: ${op.path}`);
    },
  };

  let treeIdx = 1;
  const mockTargetWriteClient: TargetWriteClient = {
    mutate: async <T>(operation: TargetWriteOperation) => {
      if (operation.path === '/repos/{owner}/{repo}/git/trees') {
        treeMutations.push(operation);
        return {
          status: 201,
          data: { sha: `batch-tree-sha-${treeIdx++}` } as unknown as T,
        };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/commits') {
        commitMutations.push(operation);
        return {
          status: 201,
          data: { sha: 'clean-commit-sha-222' } as unknown as T,
        };
      }
      if (operation.path === '/repos/{owner}/{repo}/git/refs/heads/{branch}') {
        return { status: 200, data: {} as unknown as T };
      }
      throw new Error(`Unexpected mutation: ${operation.path}`);
    },
  };

  const publisher = new MigrationResultsRepoPublisher({
    targetOrg: 'demogxp-mig2',
    repoName: 'migration-audit-results',
    targetClient: mockTargetClient,
    targetWriteClient: mockTargetWriteClient,
  });

  const files: Record<string, string> = {};
  for (let i = 1; i <= 125; i++) {
    files[`repositories/repo-${i}/gei-repo.md`] = `# File ${i}`;
  }

  const result = await publisher.publish(files);
  assert.equal(result.commitSha, 'clean-commit-sha-222');
  assert.equal(treeMutations.length, 2);

  const firstTreeBody = treeMutations[0]?.body as Record<string, unknown>;
  const secondTreeBody = treeMutations[1]?.body as Record<string, unknown>;
  assert.equal(firstTreeBody.base_tree, undefined);
  assert.equal(secondTreeBody.base_tree, 'batch-tree-sha-1');

  const commitBody = commitMutations[0]?.body as Record<string, unknown>;
  assert.deepEqual(commitBody.parents, ['prior-commit-sha-111']);
});
