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
        sourceOrg: 'demogxp',
        sourceRepo: 'repo-1',
        targetOrg: 'antigravity-migration-test',
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
        sourceOrg: 'demogxp',
        sourceRepo: 'repo-1',
        targetOrg: 'antigravity-migration-test',
        targetRepo: 'repo-1',
      },
      sourceClient: createMockAdapter({}),
      targetClient: createMockAdapter({}),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      signal: new AbortController().signal,
      dryRun: false,
    };

    const plan = await module.plan(ctx, {
      sourceOrg: 'demogxp',
      sourceRepo: 'repo-1',
      targetOrg: 'antigravity-migration-test',
      targetRepo: 'repo-1',
      targetRepoVisibility: 'private',
      targetExists: false,
    });

    assert.equal(plan.moduleId, 'gei-repo');
    assert.equal(plan.targetIdentifier, 'antigravity-migration-test/repo-1');
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
        ssoUrl: 'https://github.com/orgs/demogxp/sso',
      },
    });

    const ctx: MigrationContext = {
      scope: {
        level: 'repository',
        sourceOrg: 'demogxp',
        sourceRepo: 'repo-1',
        targetOrg: 'antigravity-migration-test',
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
      targetIdentifier: 'antigravity-migration-test/repo-1',
      operations: [],
      warnings: [],
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.results.length, 1);
    assert.match(result.results[0]!.error ?? '', /SAML Single Sign-On/);
  });
});
