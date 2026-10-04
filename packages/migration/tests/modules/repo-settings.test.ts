import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RepoSettingsMigrationModule,
  createDefaultModuleRegistry,
  normalizeVisibility,
  determineTargetVisibility,
  diffRepoSettings,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
  type RawGitHubRepositoryResponse,
  type RepoSettingsData,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  constructor(
    private readonly responseData: unknown = {},
    private readonly status = 200,
  ) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (this.status >= 400) {
      throw new Error(`HTTP ${this.status}`);
    }
    return {
      data: this.responseData as T,
      status: this.status,
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

  constructor(
    private readonly statusSequence: number[] = [200],
    private readonly responseData: unknown = {},
  ) {}

  async mutate<T = unknown>(
    operation: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(operation);
    const status = this.statusSequence.shift() ?? 200;
    return { status, data: this.responseData as T };
  }
}

function createMockContext(
  options: {
    sourceData?: unknown;
    targetData?: unknown;
    writeClient?: TargetWriteClient;
    dryRun?: boolean;
  } = {},
): MigrationContext {
  return {
    runId: 'run-test-settings-123',
    scope: {
      level: 'repository',
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
      sourceRepo: 'sample-repo',
      targetRepo: 'sample-repo',
    },
    sourceClient: new MockReadAdapter(options.sourceData),
    targetClient: new MockReadAdapter(options.targetData),
    targetWriteClient: options.writeClient ?? new MockWriteClient(),
    signal: new AbortController().signal,
    dryRun: options.dryRun ?? false,
    continueOnError: true,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

describe('RepoSettingsMigrationModule (Task 025)', () => {
  describe('Helper functions', () => {
    it('normalizes visibility correctly', () => {
      assert.equal(normalizeVisibility('public'), 'public');
      assert.equal(normalizeVisibility('internal'), 'internal');
      assert.equal(normalizeVisibility('private'), 'private');
      assert.equal(normalizeVisibility(undefined, false), 'public');
      assert.equal(normalizeVisibility(undefined, true), 'private');
      assert.equal(normalizeVisibility(undefined, undefined), 'private');
    });

    it('respects visibilityOverride when provided', () => {
      assert.equal(
        determineTargetVisibility('public', { visibilityOverride: 'internal' }),
        'internal',
      );
      assert.equal(determineTargetVisibility('private'), 'private');
    });

    it('diffs repo settings and detects changes', () => {
      const diff = diffRepoSettings(
        'internal',
        'private',
        {
          allowSquashMerge: true,
          squashMergeCommitTitle: 'PR_TITLE',
          squashMergeCommitMessage: 'PR_BODY',
          deleteBranchOnMerge: true,
        },
        {
          allowSquashMerge: true,
          squashMergeCommitTitle: 'COMMIT_OR_PR_TITLE',
          squashMergeCommitMessage: 'COMMIT_MESSAGES',
          deleteBranchOnMerge: false,
        },
      );

      assert.equal(diff.hasChanges, true);
      assert.equal(diff.patchPayload.visibility, 'internal');
      assert.equal(diff.patchPayload.squash_merge_commit_title, 'PR_TITLE');
      assert.equal(diff.patchPayload.squash_merge_commit_message, 'PR_BODY');
      assert.equal(diff.patchPayload.delete_branch_on_merge, true);
      assert.equal(diff.patchPayload.allow_squash_merge, undefined);
    });

    it('returns hasChanges: false when settings match', () => {
      const diff = diffRepoSettings(
        'private',
        'private',
        { allowSquashMerge: true, deleteBranchOnMerge: true },
        { allowSquashMerge: true, deleteBranchOnMerge: true },
      );
      assert.equal(diff.hasChanges, false);
      assert.equal(Object.keys(diff.patchPayload).length, 0);
    });
  });

  describe('Discovery', () => {
    it('discovers settings via live GitHub REST API', async () => {
      const mockSource: RawGitHubRepositoryResponse = {
        visibility: 'internal',
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: true,
        allow_auto_merge: true,
        delete_branch_on_merge: true,
        squash_merge_commit_title: 'PR_TITLE',
        squash_merge_commit_message: 'PR_BODY',
        merge_commit_title: 'MERGE_MESSAGE',
        merge_commit_message: 'PR_TITLE',
      };

      const ctx = createMockContext({ sourceData: mockSource });
      const module = new RepoSettingsMigrationModule();
      const discovered = await module.discover(ctx);

      assert.equal(discovered.repo, 'sample-repo');
      assert.equal(discovered.visibility, 'internal');
      assert.equal(discovered.prSettings.allowSquashMerge, true);
      assert.equal(discovered.prSettings.allowMergeCommit, false);
      assert.equal(discovered.prSettings.squashMergeCommitTitle, 'PR_TITLE');
      assert.equal(discovered.prSettings.squashMergeCommitMessage, 'PR_BODY');
      assert.equal(discovered.prSettings.deleteBranchOnMerge, true);
      assert.equal(discovered.prSettings.allowAutoMerge, true);
    });

    it('discovers settings from cached DiscoveryBundle', async () => {
      const cachedBundle = {
        entities: [
          {
            kind: 'repository',
            name: 'sample-repo',
            visibility: 'internal',
            allowSquashMerge: true,
            deleteBranchOnMerge: true,
            squashMergeCommitTitle: 'PR_TITLE',
          },
        ],
      };

      const ctx = createMockContext();
      const module = new RepoSettingsMigrationModule();
      const discovered = await module.discover(ctx, cachedBundle);

      assert.equal(discovered.repo, 'sample-repo');
      assert.equal(discovered.visibility, 'internal');
      assert.equal(discovered.prSettings.allowSquashMerge, true);
      assert.equal(discovered.prSettings.deleteBranchOnMerge, true);
      assert.equal(discovered.prSettings.squashMergeCommitTitle, 'PR_TITLE');
    });
  });

  describe('Planning', () => {
    it('emits update operation when target visibility or PR settings differ', async () => {
      const sourceData: RepoSettingsData = {
        owner: 'source-org',
        repo: 'sample-repo',
        visibility: 'internal',
        prSettings: {
          allowSquashMerge: true,
          squashMergeCommitTitle: 'PR_TITLE',
          squashMergeCommitMessage: 'PR_BODY',
          deleteBranchOnMerge: true,
        },
      };

      const targetData: RawGitHubRepositoryResponse = {
        visibility: 'private', // GEI default
        allow_squash_merge: true,
        squash_merge_commit_title: 'COMMIT_OR_PR_TITLE',
        squash_merge_commit_message: 'COMMIT_MESSAGES',
        deleteBranchOnMerge: false,
      };

      const ctx = createMockContext({ targetData });
      const module = new RepoSettingsMigrationModule();
      const plan = await module.plan(ctx, sourceData);

      assert.equal(plan.moduleId, 'repo-settings');
      assert.equal(plan.operations.length, 1);
      const op = plan.operations[0];
      assert.equal(op?.operation, 'update');
      assert.equal(op?.resourceName, 'target-org/sample-repo');
      assert.equal(
        (op?.payload as Record<string, unknown>).visibility,
        'internal',
      );
      assert.equal(
        (op?.payload as Record<string, unknown>).squash_merge_commit_title,
        'PR_TITLE',
      );
      assert.equal(
        (op?.payload as Record<string, unknown>).squash_merge_commit_message,
        'PR_BODY',
      );
      assert.equal(
        (op?.payload as Record<string, unknown>).delete_branch_on_merge,
        true,
      );
    });

    it('emits noop operation when target already matches desired settings', async () => {
      const sourceData: RepoSettingsData = {
        owner: 'source-org',
        repo: 'sample-repo',
        visibility: 'internal',
        prSettings: {
          allowSquashMerge: true,
          deleteBranchOnMerge: true,
        },
      };

      const targetData: RawGitHubRepositoryResponse = {
        visibility: 'internal',
        allow_squash_merge: true,
        delete_branch_on_merge: true,
      };

      const ctx = createMockContext({ targetData });
      const module = new RepoSettingsMigrationModule();
      const plan = await module.plan(ctx, sourceData);

      assert.equal(plan.operations.length, 1);
      assert.equal(plan.operations[0]?.operation, 'noop');
    });
  });

  describe('Application & Execution', () => {
    it('applies PATCH mutation to target repository', async () => {
      const writeClient = new MockWriteClient([200]);
      const ctx = createMockContext({ writeClient });
      const module = new RepoSettingsMigrationModule();

      const plan = {
        moduleId: 'repo-settings',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-settings:sample-repo',
            resourceType: 'repository-settings',
            resourceName: 'target-org/sample-repo',
            operation: 'update' as const,
            payload: {
              visibility: 'internal',
              delete_branch_on_merge: true,
            },
          },
        ],
      };

      const result = await module.apply(ctx, plan);
      assert.equal(result.status, 'complete');
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0]?.status, 'succeeded');
      assert.equal(writeClient.calls.length, 1);
      assert.equal(writeClient.calls[0]?.method, 'PATCH');
      assert.equal(writeClient.calls[0]?.path, '/repos/{owner}/{repo}');
      assert.deepEqual(writeClient.calls[0]?.body, {
        visibility: 'internal',
        delete_branch_on_merge: true,
      });
    });

    it('handles dry-run mode without sending network requests', async () => {
      const writeClient = new MockWriteClient([200]);
      const ctx = createMockContext({ writeClient, dryRun: true });
      const module = new RepoSettingsMigrationModule();

      const plan = {
        moduleId: 'repo-settings',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-settings:sample-repo',
            resourceType: 'repository-settings',
            resourceName: 'target-org/sample-repo',
            operation: 'update' as const,
            payload: { visibility: 'internal' },
          },
        ],
      };

      const result = await module.apply(ctx, plan);
      assert.equal(result.status, 'complete');
      assert.equal(writeClient.calls.length, 0); // No calls during dry run
    });

    it('gracefully falls back to internal visibility when enterprise policy disallows public', async () => {
      // First call (public) returns 422 (policy constraint), retry with internal returns 200
      const writeClient = new MockWriteClient([422, 200]);
      const ctx = createMockContext({ writeClient });
      const module = new RepoSettingsMigrationModule({
        enforceInternalForPublic: true,
      });

      const plan = {
        moduleId: 'repo-settings',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-settings:sample-repo',
            resourceType: 'repository-settings',
            resourceName: 'target-org/sample-repo',
            operation: 'update' as const,
            payload: {
              visibility: 'public',
              delete_branch_on_merge: true,
            },
          },
        ],
      };

      const result = await module.apply(ctx, plan);
      assert.equal(result.status, 'complete');
      assert.equal(writeClient.calls.length, 2);
      assert.equal(
        (writeClient.calls[0]?.body as Record<string, unknown>).visibility,
        'public',
      );
      assert.equal(
        (writeClient.calls[1]?.body as Record<string, unknown>).visibility,
        'internal',
      );
    });
  });

  describe('Verification', () => {
    it('verifies target settings match planned state', async () => {
      const targetData: RawGitHubRepositoryResponse = {
        visibility: 'internal',
        delete_branch_on_merge: true,
        squash_merge_commit_title: 'PR_TITLE',
      };

      const ctx = createMockContext({ targetData });
      const module = new RepoSettingsMigrationModule();

      const plan = {
        moduleId: 'repo-settings',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-settings:sample-repo',
            resourceType: 'repository-settings',
            resourceName: 'target-org/sample-repo',
            operation: 'update' as const,
            payload: {
              visibility: 'internal',
              delete_branch_on_merge: true,
              squash_merge_commit_title: 'PR_TITLE',
            },
          },
        ],
      };

      const verification = await module.verify(ctx, plan);
      assert.equal(verification.verified, true);
      assert.equal(verification.discrepancies.length, 0);
    });

    it('reports discrepancies when target settings differ from plan', async () => {
      const targetData: RawGitHubRepositoryResponse = {
        visibility: 'private', // Mismatched
        delete_branch_on_merge: false, // Mismatched
      };

      const ctx = createMockContext({ targetData });
      const module = new RepoSettingsMigrationModule();

      const plan = {
        moduleId: 'repo-settings',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-settings:sample-repo',
            resourceType: 'repository-settings',
            resourceName: 'target-org/sample-repo',
            operation: 'update' as const,
            payload: {
              visibility: 'internal',
              delete_branch_on_merge: true,
            },
          },
        ],
      };

      const verification = await module.verify(ctx, plan);
      assert.equal(verification.verified, false);
      assert.equal(verification.discrepancies.length, 2);
      assert.ok(
        verification.discrepancies[0]?.message.includes('Visibility mismatch'),
      );
      assert.ok(
        verification.discrepancies[1]?.message.includes(
          'delete_branch_on_merge mismatch',
        ),
      );
    });
  });

  describe('Registry Integration', () => {
    it('is registered in default ModuleRegistry with gei-repo dependency', () => {
      const registry = createDefaultModuleRegistry();
      const module = registry.get('repo-settings');

      assert.ok(
        module,
        'repo-settings module must be registered in ModuleRegistry',
      );
      assert.equal(module?.id, 'repo-settings');
      assert.equal(module?.scopeLevel, 'repository');
      assert.deepEqual(module?.dependencies, ['gei-repo']);
    });
  });
});
