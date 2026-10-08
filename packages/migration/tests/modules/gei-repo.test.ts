import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeiRepoMigrationModule } from '../../src/modules/gei-repo/module.js';
import type { MigrationContext } from '../../src/core/types.js';
import type {
  GitHubReadAdapter,
  EndpointProbeResult,
  ReadOperation,
} from '@ghec/github-client';

function createMockAdapter(options: {
  probeResult?: EndpointProbeResult | undefined;
  targetExists?: boolean;
}): GitHubReadAdapter {
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
      if (operation.path?.includes('/user/memberships/orgs/')) {
        return {
          data: { state: 'active', role: 'admin', user: { login: 'admin' } },
          observedAt: new Date().toISOString(),
          status: 200,
        };
      }
      if (operation.path?.includes('/repos/')) {
        if (options.targetExists) {
          return {
            data: { id: 123 },
            observedAt: new Date().toISOString(),
            status: 200,
          };
        }
        return {
          data: null as never,
          observedAt: new Date().toISOString(),
          status: 404,
        };
      }
      return {
        data: {} as never,
        observedAt: new Date().toISOString(),
        status: 200,
      };
    },
    async fetchAll() {
      return {
        items: [],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
    async probeEndpoint() {
      return (
        options.probeResult ?? {
          status: 200,
          oauthScopes: ['repo', 'admin:org'],
        }
      );
    },
  };
}

describe('GeiRepoMigrationModule', () => {
  it('identifies target repository existence in discover()', async () => {
    const module = new GeiRepoMigrationModule();
    const mockTarget = createMockAdapter({ targetExists: true });

    const ctx: MigrationContext = {
      scope: {
        level: 'repository',
        sourceOrg: 'example-source-org',
        sourceRepo: 'repo-1',
        targetOrg: 'example-target-emu',
        targetRepo: 'repo-1',
      },
      sourceClient: createMockAdapter({}),
      targetClient: mockTarget,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
    };

    const discovered = await module.discover(ctx);
    assert.equal(discovered.targetExists, true);
    assert.equal(discovered.targetRepoVisibility, 'private');
  });

  it('emits deterministic plan() offline without network calls', async () => {
    const module = new GeiRepoMigrationModule();
    const ctx: MigrationContext = {
      scope: {
        level: 'repository',
        sourceOrg: 'example-source-org',
        sourceRepo: 'repo-1',
        targetOrg: 'example-target-emu',
        targetRepo: 'repo-1',
      },
      sourceClient: createMockAdapter({}),
      targetClient: createMockAdapter({}),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
    };

    const plan = await module.plan(ctx, {
      sourceOrg: 'example-source-org',
      sourceRepo: 'repo-1',
      targetOrg: 'example-target-emu',
      targetRepo: 'repo-1',
      targetRepoVisibility: 'private',
      targetExists: false,
    });

    assert.equal(plan.moduleId, 'gei-repo');
    assert.equal(plan.targetIdentifier, 'example-target-emu/repo-1');
    assert.deepEqual(plan.operations, []);
    assert.deepEqual(plan.warnings, []);
  });

  it('fails live apply() fast if source credentials have blockers', async () => {
    const mockRunner = {
      execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    };
    const module = new GeiRepoMigrationModule(mockRunner);
    const mockSource = createMockAdapter({
      probeResult: {
        status: 403,
        oauthScopes: ['repo', 'admin:org'],
        ssoRequired: true,
        ssoUrl: 'https://github.com/orgs/example-source-org/sso',
      },
    });

    const ctx: MigrationContext = {
      scope: {
        level: 'repository',
        sourceOrg: 'example-source-org',
        sourceRepo: 'repo-1',
        targetOrg: 'example-target-emu',
        targetRepo: 'repo-1',
      },
      sourceClient: mockSource,
      targetClient: createMockAdapter({ targetExists: false }),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
    };

    const result = await module.apply(ctx, {
      moduleId: 'gei-repo',
      scopeLevel: 'repository',
      targetIdentifier: 'example-target-emu/repo-1',
      operations: [],
      warnings: [],
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.results.length, 1);
    assert.match(result.results[0]!.error ?? '', /SAML Single Sign-On/);
  });

  it('passes granular per-repository options to GEI command runner', async () => {
    let capturedArgs: readonly string[] = [];
    let capturedTimeout: number | undefined;

    const mockRunner = async (
      cmd: string,
      args: readonly string[],
      opts?: { timeoutMs?: number },
    ) => {
      capturedArgs = args;
      capturedTimeout = opts?.timeoutMs;
      return { command: cmd, args, exitCode: 0, stdout: '', stderr: '' };
    };

    const module = new GeiRepoMigrationModule(mockRunner);
    const ctx: MigrationContext = {
      runId: 'test-run-granular',
      scope: {
        level: 'repository',
        sourceOrg: 'source-org',
        sourceRepo: 'custom-repo',
        targetOrg: 'target-org',
        targetRepo: 'custom-repo',
        options: {
          skipReleases: true,
          timeoutSeconds: 600,
          targetRepoVisibility: 'internal',
        },
      },
      sourceClient: createMockAdapter({
        probeResult: {
          status: 200,
          oauthScopes: ['repo', 'admin:org'],
          ssoRequired: false,
        },
      }),
      targetClient: createMockAdapter({ targetExists: false }),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
      continueOnError: false,
    };

    const result = await module.apply(ctx, {
      moduleId: 'gei-repo',
      scopeLevel: 'repository',
      targetIdentifier: 'target-org/custom-repo',
      operations: [],
      warnings: [],
    });

    assert.equal(result.status, 'complete');
    assert.ok(
      capturedArgs.includes('--skip-releases'),
      'args should include --skip-releases',
    );
    assert.ok(
      capturedArgs.includes('--target-repo-visibility'),
      'args should include --target-repo-visibility',
    );
    assert.equal(
      capturedArgs[capturedArgs.indexOf('--target-repo-visibility') + 1],
      'internal',
    );
    assert.equal(capturedTimeout, 600000, 'timeoutMs should be 600000ms');
  });

  it('detects metadata overflow in GEI stdout and records partial status and failed categories', async () => {
    const mockRunner = async (cmd: string, args: readonly string[]) => {
      return {
        command: cmd,
        args,
        exitCode: 0,
        stdout:
          'Starting migration RM_999\nWARNING: Repository metadata too big to migrate (Archive: 42GB)\nFinished.',
        stderr: '',
      };
    };

    const loggedWarnings: string[] = [];
    const module = new GeiRepoMigrationModule(mockRunner);
    const ctx: MigrationContext = {
      runId: 'test-run-metadata-overflow',
      scope: {
        level: 'repository',
        sourceOrg: 'source-org',
        sourceRepo: 'large-repo',
        targetOrg: 'target-org',
        targetRepo: 'large-repo',
      },
      sourceClient: createMockAdapter({
        probeResult: {
          status: 200,
          oauthScopes: ['repo', 'admin:org'],
        },
      }),
      targetClient: createMockAdapter({ targetExists: false }),
      logger: {
        info: () => {},
        warn: (msg: string) => loggedWarnings.push(msg),
        error: () => {},
      },
      signal: new AbortController().signal,
      dryRun: false,
      continueOnError: false,
    };

    const result = await module.apply(ctx, {
      moduleId: 'gei-repo',
      scopeLevel: 'repository',
      targetIdentifier: 'target-org/large-repo',
      operations: [],
      warnings: [],
    });

    assert.equal(result.status, 'partial');
    assert.equal(result.metadataState, 'failed');
    assert.ok(result.failedMetadataCategories?.includes('issues'));
    assert.ok(result.failedMetadataCategories?.includes('pull-requests'));
    assert.ok(result.failedMetadataCategories?.includes('releases'));
    assert.ok(result.failedMetadataCategories?.includes('settings'));
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.status, 'failed');
    assert.ok(
      loggedWarnings.some((w) => w.includes('Repository metadata too big')),
    );
  });

  it('detects PR review thread errors via target Migration Log issue fallback', async () => {
    const mockRunner = async (cmd: string, args: readonly string[]) => {
      return {
        command: cmd,
        args,
        exitCode: 0,
        stdout: 'Migration complete RM_101',
        stderr: '',
      };
    };

    const mockTarget: GitHubReadAdapter = {
      ...createMockAdapter({ targetExists: false }),
      async readPage(op: ReadOperation) {
        if (op.path?.includes('/issues')) {
          return {
            items: [
              {
                title: 'Migration Log',
                body: 'GEI finished with errors:\nERROR: REVIEW_THREAD_MISSING_END_COMMIT_OID on PR #15',
              },
            ],
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
    };

    const module = new GeiRepoMigrationModule(mockRunner);
    const ctx: MigrationContext = {
      runId: 'test-run-migration-log-issue',
      scope: {
        level: 'repository',
        sourceOrg: 'source-org',
        sourceRepo: 'pr-repo',
        targetOrg: 'target-org',
        targetRepo: 'pr-repo',
      },
      sourceClient: createMockAdapter({
        probeResult: {
          status: 200,
          oauthScopes: ['repo', 'admin:org'],
        },
      }),
      targetClient: mockTarget,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
      continueOnError: false,
    };

    const result = await module.apply(ctx, {
      moduleId: 'gei-repo',
      scopeLevel: 'repository',
      targetIdentifier: 'target-org/pr-repo',
      operations: [],
      warnings: [],
    });

    assert.equal(result.status, 'partial');
    assert.equal(result.metadataState, 'partial');
    assert.ok(result.failedMetadataCategories?.includes('pull-requests'));
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.status, 'failed');
  });

  it('verify() passes when source and target metadata are in parity', async () => {
    const module = new GeiRepoMigrationModule();
    const mockRepoData = {
      id: 1,
      default_branch: 'main',
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true,
    };

    const createParityAdapter = (): GitHubReadAdapter => ({
      ...createMockAdapter({}),
      async readSingle(op: ReadOperation) {
        if (op.path?.includes('/repos/')) {
          return {
            data: mockRepoData,
            status: 200,
            observedAt: new Date().toISOString(),
          };
        }
        return { data: {}, status: 200, observedAt: new Date().toISOString() };
      },
      async readPage(op: ReadOperation) {
        if (op.path?.includes('/issues')) {
          return {
            items: [{ title: 'Issue 1', body: 'Body 1', state: 'open' }],
            nextCursor: null,
            observedAt: new Date().toISOString(),
            remainingRequests: 5000,
            resetAt: null,
            status: 200,
          };
        }
        if (op.path?.includes('/pulls')) {
          return {
            items: [{ state: 'open', merged_at: null }],
            nextCursor: null,
            observedAt: new Date().toISOString(),
            remainingRequests: 5000,
            resetAt: null,
            status: 200,
          };
        }
        if (op.path?.includes('/releases')) {
          return {
            items: [{ assets: [{ id: 10 }] }],
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
    });

    const ctx: MigrationContext = {
      runId: 'test-parity-pass',
      scope: {
        level: 'repository',
        sourceOrg: 'source-org',
        sourceRepo: 'parity-repo',
        targetOrg: 'target-org',
        targetRepo: 'parity-repo',
      },
      sourceClient: createParityAdapter(),
      targetClient: createParityAdapter(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
      continueOnError: false,
    };

    const verifyResult = await module.verify(ctx, {
      moduleId: 'gei-repo',
      scopeLevel: 'repository',
      targetIdentifier: 'target-org/parity-repo',
      operations: [],
      warnings: [],
    });

    assert.equal(verifyResult.verified, true);
    assert.deepEqual(verifyResult.discrepancies, []);
  });

  it('verify() detects deep metadata omissions and settings drift', async () => {
    const module = new GeiRepoMigrationModule();
    const sourceAdapter: GitHubReadAdapter = {
      ...createMockAdapter({}),
      async readSingle(op: ReadOperation) {
        if (op.path?.includes('/repos/')) {
          return {
            data: {
              id: 1,
              default_branch: 'main',
              has_issues: true,
              has_wiki: true,
              has_projects: false,
              allow_squash_merge: true,
            },
            status: 200,
            observedAt: new Date().toISOString(),
          };
        }
        return { data: {}, status: 200, observedAt: new Date().toISOString() };
      },
      async readPage(op: ReadOperation) {
        if (op.path?.includes('/issues')) {
          return {
            items: [
              { title: 'Issue 1', state: 'open' },
              { title: 'Issue 2', state: 'closed' },
            ],
            nextCursor: null,
            observedAt: new Date().toISOString(),
            remainingRequests: 5000,
            resetAt: null,
            status: 200,
          };
        }
        if (op.path?.includes('/pulls')) {
          return {
            items: [{ state: 'open' }],
            nextCursor: null,
            observedAt: new Date().toISOString(),
            remainingRequests: 5000,
            resetAt: null,
            status: 200,
          };
        }
        if (op.path?.includes('/releases')) {
          return {
            items: [{ assets: [{ id: 1 }, { id: 2 }] }],
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
    };

    const targetAdapter: GitHubReadAdapter = {
      ...createMockAdapter({ targetExists: true }),
      async readSingle(op: ReadOperation) {
        if (op.path?.includes('/repos/')) {
          return {
            data: {
              id: 2,
              default_branch: 'main',
              has_issues: false, // drifted
              has_wiki: false, // drifted
              has_projects: false,
              allow_squash_merge: false, // drifted
            },
            status: 200,
            observedAt: new Date().toISOString(),
          };
        }
        return { data: {}, status: 200, observedAt: new Date().toISOString() };
      },
      async readPage(op: ReadOperation) {
        if (op.path?.includes('/issues')) {
          return {
            items: [
              {
                title: 'Migration Log',
                body: 'WARNING: Repository metadata too big to migrate\nArchive generation failed',
              },
            ],
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
    };

    const ctx: MigrationContext = {
      runId: 'test-parity-fail',
      scope: {
        level: 'repository',
        sourceOrg: 'source-org',
        sourceRepo: 'drift-repo',
        targetOrg: 'target-org',
        targetRepo: 'drift-repo',
      },
      sourceClient: sourceAdapter,
      targetClient: targetAdapter,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
      continueOnError: false,
    };

    const verifyResult = await module.verify(ctx, {
      moduleId: 'gei-repo',
      scopeLevel: 'repository',
      targetIdentifier: 'target-org/drift-repo',
      operations: [],
      warnings: [],
    });

    assert.equal(verifyResult.verified, false);
    const resources = verifyResult.discrepancies.map((d) => d.resourceName);
    assert.ok(resources.includes('issues'), 'should flag missing issues');
    assert.ok(
      resources.includes('pull-requests'),
      'should flag missing pull requests',
    );
    assert.ok(resources.includes('releases'), 'should flag missing releases');
    assert.ok(
      resources.includes('repo-settings'),
      'should flag drifted repo settings',
    );
    assert.ok(
      resources.includes('migration-log'),
      'should flag migration log warnings',
    );
  });
});
