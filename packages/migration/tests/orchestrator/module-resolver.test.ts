import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_SCHEMA_VERSION, type MigrationScope } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  ALL_ORGANIZATION_MODULES,
  ALL_REPOSITORY_MODULES,
  createDefaultModuleRegistry,
  MigrationOrchestrator,
  MigrationPlanner,
  ModuleRegistry,
  parseModuleSelectionFlags,
  resolveAutoOrganizationModules,
  resolveAutoRepositoryModules,
  type MigrationModule,
  type TargetWriteClient,
} from '../../src/index.js';

describe('Strategy-Aware Automatic Module Resolution (--modules auto & --exclude-modules)', () => {
  it('parses --modules auto, inline negations (-teams, !users), and --exclude-modules', () => {
    const parsed = parseModuleSelectionFlags(
      'auto,-teams,!post-migration-mannequins',
      'packages, ip-allow-lists',
    );

    assert.equal(parsed.isAuto, true);
    assert.deepEqual(parsed.modules, ['auto']);
    assert.deepEqual(parsed.excludeModules.sort(), [
      'ip-allow-lists',
      'packages',
      'post-migration-mannequins',
      'teams',
    ]);
  });

  it('resolves standard GEI repository modules by excluding issues, pull-requests, and releases from applyModules and verifyModules (verified via gei-repo parity inspector)', () => {
    const standardRepo: MigrationScope['repositories'][number] = {
      sourceOrg: 'source-org',
      sourceRepo: 'service-a',
      targetOrg: 'target-org',
      targetRepo: 'service-a',
      gitTransferStrategy: 'auto',
      lfsStrategy: 'dual-remote-stream',
    };

    const resolved = resolveAutoRepositoryModules(standardRepo);

    assert.equal(resolved.applyModules.includes('issues'), false);
    assert.equal(resolved.applyModules.includes('pull-requests'), false);
    assert.equal(resolved.applyModules.includes('releases'), false);
    assert.equal(resolved.applyModules.includes('gei-repo'), true);
    assert.equal(resolved.applyModules.includes('repo-settings'), true);
    assert.equal(resolved.applyModules.includes('lfs'), true);
    assert.deepEqual(resolved.verifyModules, resolved.applyModules);
  });

  it('includes issues, pull-requests, and releases in applyModules and verifyModules for mirror-push repositories', () => {
    const massiveRepo: MigrationScope['repositories'][number] = {
      sourceOrg: 'source-org',
      sourceRepo: 'chromium',
      targetOrg: 'target-org',
      targetRepo: 'chromium',
      gitTransferStrategy: 'mirror-push',
    };

    const resolved = resolveAutoRepositoryModules(massiveRepo);

    assert.equal(resolved.applyModules.includes('issues'), true);
    assert.equal(resolved.applyModules.includes('pull-requests'), true);
    assert.equal(resolved.applyModules.includes('releases'), true);
    assert.equal(resolved.verifyModules.includes('issues'), true);
    assert.equal(resolved.verifyModules.includes('pull-requests'), true);
    assert.equal(resolved.verifyModules.includes('releases'), true);
    assert.equal(
      resolved.applyModules.length,
      ALL_REPOSITORY_MODULES.length - 1,
    );
  });

  it('honors excludeModules across both organization and repository resolutions and DAG sorting', () => {
    const orgResolved = resolveAutoOrganizationModules(undefined, undefined, [
      'teams',
      'post-migration-mannequins',
    ]);
    assert.equal(
      orgResolved.applyModules.length,
      ALL_ORGANIZATION_MODULES.length - 2,
    );
    assert.equal(orgResolved.applyModules.includes('teams'), false);
    assert.equal(
      orgResolved.applyModules.includes('post-migration-mannequins'),
      false,
    );

    // Ensure DAG resolution does not re-include excluded dependency 'teams' when 'collaborators' is selected
    const registry = createDefaultModuleRegistry();
    const sorted = registry.resolveExecutionPlan(
      ['gei-repo', 'collaborators', 'post-migration-codeowners'],
      { excludeModules: ['teams'] },
    );
    const sortedIds = sorted.map((m) => m.id);
    assert.equal(sortedIds.includes('teams'), false);
    assert.equal(sortedIds.includes('collaborators'), true);
    assert.equal(sortedIds.includes('post-migration-codeowners'), true);
  });

  it('dynamically promotes fallback modules and re-plans downstream modules after gei-repo succeeds, and skips downstream modules when gei-repo fails', async () => {
    const registry = new ModuleRegistry();
    const callLog: string[] = [];

    const mockGeiModule: MigrationModule<{ ok: boolean }> = {
      id: 'gei-repo',
      displayName: 'GEI Repo',
      scopeLevel: 'repository',
      dependencies: [],
      async discover() {
        return { ok: true };
      },
      async plan(ctx) {
        return {
          moduleId: 'gei-repo',
          scopeLevel: 'repository',
          targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
          operations: [
            {
              id: `gei-${ctx.scope.targetRepo}`,
              resourceType: 'repository',
              resourceName: ctx.scope.targetRepo ?? '',
              operation: 'create',
            },
          ],
          warnings: [],
        };
      },
      async apply(ctx) {
        callLog.push(`apply:gei-repo:${ctx.scope.targetRepo}`);
        if (ctx.scope.targetRepo === 'failed-repo') {
          return {
            schemaVersion: MIGRATION_SCHEMA_VERSION,
            moduleId: 'gei-repo',
            status: 'failed',
            durationMs: 1,
            results: [
              {
                operationId: 'gei-failed-repo',
                status: 'failed',
                error: 'Simulated GEI failure',
                completedAt: new Date().toISOString(),
              },
            ],
          };
        }
        return {
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          moduleId: 'gei-repo',
          status: 'partial',
          durationMs: 1,
          results: [
            {
              operationId: 'gei-fallback-repo',
              status: 'succeeded',
              completedAt: new Date().toISOString(),
            },
          ],
          metadataState: 'partial',
          failedMetadataCategories: ['issues'],
        };
      },
      async verify() {
        return { moduleId: 'gei-repo', verified: true, discrepancies: [] };
      },
    };

    const mockSettingsModule: MigrationModule<{ phase: string }> = {
      id: 'repo-settings',
      displayName: 'Repo Settings',
      scopeLevel: 'repository',
      dependencies: ['gei-repo'],
      async discover(ctx) {
        callLog.push(`discover:repo-settings:${ctx.scope.targetRepo}`);
        return { phase: 'discovered' };
      },
      async plan(ctx) {
        callLog.push(`plan:repo-settings:${ctx.scope.targetRepo}`);
        return {
          moduleId: 'repo-settings',
          scopeLevel: 'repository',
          targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
          operations: [],
          warnings: [],
        };
      },
      async apply(ctx) {
        callLog.push(`apply:repo-settings:${ctx.scope.targetRepo}`);
        return {
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          moduleId: 'repo-settings',
          status: 'complete',
          durationMs: 1,
          results: [],
        };
      },
      async verify() {
        return { moduleId: 'repo-settings', verified: true, discrepancies: [] };
      },
    };

    const mockIssuesModule: MigrationModule<{ count: number }> = {
      id: 'issues',
      displayName: 'Issues Fallback',
      scopeLevel: 'repository',
      dependencies: ['gei-repo'],
      async discover(ctx) {
        callLog.push(`discover:issues:${ctx.scope.targetRepo}`);
        return { count: 1 };
      },
      async plan(ctx) {
        callLog.push(`plan:issues:${ctx.scope.targetRepo}`);
        return {
          moduleId: 'issues',
          scopeLevel: 'repository',
          targetIdentifier: `${ctx.scope.targetOrg}/${ctx.scope.targetRepo}`,
          operations: [],
          warnings: [],
        };
      },
      async apply(ctx) {
        callLog.push(`apply:issues:${ctx.scope.targetRepo}`);
        return {
          schemaVersion: MIGRATION_SCHEMA_VERSION,
          moduleId: 'issues',
          status: 'complete',
          durationMs: 1,
          results: [],
        };
      },
      async verify() {
        return { moduleId: 'issues', verified: true, discrepancies: [] };
      },
    };

    registry.registerAll([mockGeiModule, mockSettingsModule, mockIssuesModule]);

    const scope: MigrationScope = {
      version: MIGRATION_SCHEMA_VERSION,
      name: 'test-auto-scope',
      organizations: [],
      repositories: [
        {
          sourceOrg: 'src',
          sourceRepo: 'fallback-repo',
          targetOrg: 'tgt',
          targetRepo: 'fallback-repo',
          useGei: true,
        },
        {
          sourceOrg: 'src',
          sourceRepo: 'failed-repo',
          targetOrg: 'tgt',
          targetRepo: 'failed-repo',
          useGei: true,
        },
      ],
    };

    const dummyClient = {} as unknown as GitHubReadAdapter;
    const dummyWriteClient = {} as unknown as TargetWriteClient;

    // Verify MigrationPlanner in auto mode excludes 'issues' upfront on standard repos
    const planner = new MigrationPlanner({
      scope,
      registry,
      sourceClient: dummyClient,
      targetClient: dummyClient,
      modules: ['auto'],
    });
    const initialPlan = await planner.generatePlan();
    assert.equal(
      initialPlan.modules.some((m) => m.moduleId === 'issues'),
      false,
    );

    callLog.length = 0;

    const orchestrator = new MigrationOrchestrator({
      scope,
      registry,
      sourceClient: dummyClient,
      targetClient: dummyClient,
      targetWriteClient: dummyWriteClient,
      modules: ['auto'],
      continueOnError: true,
    });

    const report = await orchestrator.run();

    // 1. For fallback-repo: gei-repo succeeded with failedMetadataCategories: ['issues'],
    // so repo-settings was re-planned post-GEI AND issues was dynamically promoted and executed!
    assert.ok(callLog.includes('apply:gei-repo:fallback-repo'));
    assert.ok(callLog.includes('apply:repo-settings:fallback-repo'));
    assert.ok(callLog.includes('discover:issues:fallback-repo'));
    assert.ok(callLog.includes('plan:issues:fallback-repo'));
    assert.ok(callLog.includes('apply:issues:fallback-repo'));

    // 2. For failed-repo: gei-repo failed, so repo-settings was skipped!
    assert.ok(callLog.includes('apply:gei-repo:failed-repo'));
    assert.equal(callLog.includes('apply:repo-settings:failed-repo'), false);
    const skippedResult = report.results.find(
      (r) => r.moduleId === 'repo-settings' && r.status === 'skipped',
    );
    assert.ok(skippedResult);
  });
});
