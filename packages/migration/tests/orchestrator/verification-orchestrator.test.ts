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

  it('propagates RulesetsMigrationModule HTTP 403 discover() error as read_error discrepancy and preserves plan warnings', async () => {
    const { RulesetsMigrationModule } =
      await import('../../src/modules/rulesets/module.js');
    const registry = new ModuleRegistry();
    for (const [depId, depScope] of [
      ['gei-repo', 'repository'],
      ['teams', 'organization'],
    ] as const) {
      registry.register({
        id: depId,
        displayName: depId,
        scopeLevel: depScope,
        dependencies: [],
        async discover() {
          return {};
        },
        async plan(ctx) {
          return {
            moduleId: depId,
            scopeLevel: depScope,
            targetIdentifier: ctx.scope.targetOrg,
            operations: [],
            warnings: [],
          };
        },
        async apply() {
          return {
            moduleId: depId,
            status: 'complete',
            durationMs: 1,
            results: [],
          };
        },
        async verify() {
          return { moduleId: depId, verified: true, discrepancies: [] };
        },
      });
    }
    registry.register(new RulesetsMigrationModule());

    const forbiddenSourceAdapter: GitHubReadAdapter = {
      ...createStubAdapter(),
      async readSingle() {
        return {
          data: undefined as never,
          observedAt: new Date().toISOString(),
          status: 403,
        };
      },
    };

    const scope: MigrationScope = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      name: 'test-scope-rulesets-403',
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
      sourceClient: forbiddenSourceAdapter,
      targetClient: createStubAdapter(),
      verificationMode: true,
      modules: ['rulesets'],
      runId: 'plan-rulesets-403',
    });

    const plan = await planner.generatePlan();
    const rulesetPlan = plan.modules.find((m) => m.moduleId === 'rulesets');
    assert.ok(rulesetPlan);
    assert.ok(
      rulesetPlan.warnings.some((w) => w.startsWith('[VERIFY_READ_ERROR]')),
      'Expected [VERIFY_READ_ERROR] warning when rulesets discover() receives HTTP 403',
    );

    // Inject an additional non-read-error warning to verify warning preservation
    const planWithExtraWarning = {
      ...plan,
      modules: plan.modules.map((m) =>
        m.moduleId === 'rulesets'
          ? {
              ...m,
              warnings: [
                ...m.warnings,
                'Bypass actor ID 99 could not be mapped to target org.',
              ],
            }
          : m,
      ),
    };

    const loggedWarnings: string[] = [];
    const orchestrator = new VerificationOrchestrator({
      plan: planWithExtraWarning,
      scope,
      registry,
      sourceClient: forbiddenSourceAdapter,
      targetClient: createStubAdapter(),
      runId: 'verify-rulesets-403',
      logger: {
        info: () => {},
        warn: (msg) => loggedWarnings.push(msg),
        error: () => {},
      },
    });

    const { report, exitCode } = await orchestrator.run();
    assert.equal(exitCode, 1);
    const modEntry = report.modules.find((m) => m.moduleId === 'rulesets');
    assert.ok(modEntry);
    assert.equal(modEntry.verified, false);
    assert.ok(modEntry.discrepancies.some((d) => d.actual === 'read_error'));
    assert.ok(
      modEntry.warnings?.some((w) =>
        w.includes('Bypass actor ID 99 could not be mapped'),
      ),
      'Expected module verification result to preserve plan warnings',
    );
    assert.ok(
      loggedWarnings.some((w) =>
        w.includes('Bypass actor ID 99 could not be mapped'),
      ),
      'Expected VerificationOrchestrator to log non-read-error plan warnings',
    );
  });
});
