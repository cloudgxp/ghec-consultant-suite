import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationScope,
  type ModulePlan,
  type ModuleVerificationResult,
} from '@ghec/contracts';
import { ModuleRegistry } from '../../src/core/registry.js';
import type {
  MigrationContext,
  MigrationModule,
} from '../../src/core/types.js';
import { MigrationPlanner } from '../../src/planner/planner.js';
import { VerificationOrchestrator } from '../../src/orchestrator/verification-orchestrator.js';

function createStubAdapter(): GitHubReadAdapter {
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
    async readSingle() {
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
      return { status: 200, oauthScopes: ['repo', 'admin:org'] };
    },
  };
}

describe('VerificationOrchestrator fail-closed behavior', () => {
  it('fails closed and emits discrepancy when module discover() throws HTTP 500/403/429 in verificationMode', async () => {
    const registry = new ModuleRegistry();

    const failingDiscoverModule: MigrationModule<unknown> = {
      id: 'org-variables',
      name: 'Org Variables',
      scopeLevel: 'organization',
      dependencies: [],
      async discover() {
        throw new Error(
          'HTTP 502 Bad Gateway while reading https://x-access-token:ghp_secret123456@api.github.com/orgs/source-org/actions/variables',
        );
      },
      async plan(): Promise<ModulePlan> {
        return {
          moduleId: 'org-variables',
          scopeLevel: 'organization',
          targetIdentifier: 'target-org',
          operations: [],
          warnings: [],
        };
      },
      async apply() {
        return {
          moduleId: 'org-variables',
          status: 'complete',
          durationMs: 1,
          results: [],
        };
      },
      async verify(): Promise<ModuleVerificationResult> {
        return {
          moduleId: 'org-variables',
          verified: true,
          discrepancies: [],
        };
      },
    };

    registry.register(failingDiscoverModule);

    const scope: MigrationScope = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      name: 'test-scope',
      organizations: [
        {
          source: 'source-org',
          target: 'target-org',
          modules: ['org-variables'],
        },
      ],
      repositories: [],
    };

    const planner = new MigrationPlanner({
      scope,
      registry,
      sourceClient: createStubAdapter(),
      targetClient: createStubAdapter(),
      verificationMode: true,
      runId: 'plan-fail-closed-discover',
    });

    const plan = await planner.generatePlan();

    const orchestrator = new VerificationOrchestrator({
      plan,
      scope,
      registry,
      sourceClient: createStubAdapter(),
      targetClient: createStubAdapter(),
      runId: 'verify-fail-closed-discover',
    });

    const { report, exitCode } = await orchestrator.run();

    assert.equal(exitCode, 1);
    assert.equal(report.summary.unverifiedModuleCount, 1);
    assert.equal(report.summary.discrepancyCount, 1);
    const modEntry = report.modules.find((m) => m.moduleId === 'org-variables');
    assert.ok(modEntry, 'Expected org-variables module entry');
    assert.equal(modEntry.verified, false);
    assert.equal(modEntry.discrepancies.length, 1);
    assert.equal(
      modEntry.discrepancies[0]?.expected,
      'verifiable source and target state',
    );
    assert.equal(modEntry.discrepancies[0]?.actual, 'read_error');
    assert.ok(!modEntry.discrepancies[0]?.message.includes('ghp_secret'));
  });

  it('fails closed and emits discrepancy when module verify() throws an unhandled error', async () => {
    const registry = new ModuleRegistry();

    const failingVerifyModule: MigrationModule<unknown> = {
      id: 'rulesets',
      name: 'Repository Rulesets',
      scopeLevel: 'repository',
      dependencies: [],
      async discover() {
        return {};
      },
      async plan(ctx: MigrationContext): Promise<ModulePlan> {
        return {
          moduleId: 'rulesets',
          scopeLevel: 'repository',
          targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo ?? ''}`,
          operations: [],
          warnings: [],
        };
      },
      async apply() {
        return {
          moduleId: 'rulesets',
          status: 'complete',
          durationMs: 1,
          results: [],
        };
      },
      async verify(): Promise<ModuleVerificationResult> {
        throw new Error(
          'HTTP 429 Too Many Requests: secondary rate limit exceeded (Bearer ghp_superSecret999)',
        );
      },
    };

    registry.register(failingVerifyModule);

    const scope: MigrationScope = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      name: 'test-scope-repo',
      organizations: [],
      repositories: [
        {
          sourceOrg: 'source-org',
          sourceRepo: 'app-repo',
          targetOrg: 'target-org',
          targetRepo: 'app-repo',
          useGei: false,
          modules: ['rulesets'],
        },
      ],
    };

    const planner = new MigrationPlanner({
      scope,
      registry,
      sourceClient: createStubAdapter(),
      targetClient: createStubAdapter(),
      verificationMode: true,
      runId: 'plan-fail-closed-verify',
    });

    const plan = await planner.generatePlan();

    const orchestrator = new VerificationOrchestrator({
      plan,
      scope,
      registry,
      sourceClient: createStubAdapter(),
      targetClient: createStubAdapter(),
      runId: 'verify-fail-closed-verify',
    });

    const { report, exitCode } = await orchestrator.run();

    assert.equal(exitCode, 1);
    assert.equal(report.summary.unverifiedModuleCount, 1);
    assert.equal(report.summary.discrepancyCount, 1);
    const modEntry = report.modules.find((m) => m.moduleId === 'rulesets');
    assert.ok(modEntry, 'Expected rulesets module entry');
    assert.equal(modEntry.verified, false);
    assert.equal(modEntry.discrepancies.length, 1);
    assert.equal(modEntry.discrepancies[0]?.actual, 'read_error');
    assert.ok(
      !modEntry.discrepancies[0]?.message.includes('ghp_superSecret999'),
    );
  });
});
