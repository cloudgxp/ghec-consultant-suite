import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BranchProtectionReconciliationModule,
  computeBranchProtectionReconciliation,
  convertBranchProtectionToRuleset,
  type BranchProtectionRule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly protection?: Record<string, unknown> | undefined;

  constructor(protection?: Record<string, unknown>) {
    this.protection = protection;
  }

  async readSingle<T>(
    operation: ReadOperation,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    if (operation.path.endsWith('/branches')) {
      return {
        data: [{ name: 'main', protected: true }] as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    return {
      data: (this.protection ?? {}) as unknown as T,
      status: this.protection ? 200 : 404,
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

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return { status: 200, data: undefined };
  }
}

const comprehensiveSourceProtection: BranchProtectionRule = {
  branch: 'main',
  enforce_admins: true,
  required_linear_history: true,
  allow_force_pushes: true,
  allow_deletions: false,
  block_creations: true, // GEI omitted #5
  lock_branch: true, // GEI omitted #4
  required_conversation_resolution: true,
  required_status_checks: {
    strict: true,
    contexts: ['ci/build', 'ci/test'],
  },
  required_deployments: {
    environments: ['production', 'staging'], // GEI omitted #3
  },
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    required_approving_review_count: 2,
    require_last_push_approval: true, // GEI omitted #2
    dismissal_restrictions: {
      users: ['alice'], // GEI omitted #7
      teams: ['security-leads'],
    },
    bypass_pull_request_allowances: {
      users: ['bot-user'], // GEI omitted #1
      teams: ['admins'],
    },
  },
};

// Target post-GEI state where the 7 settings are missing
const geiMigratedTargetProtection: BranchProtectionRule = {
  branch: 'main',
  enforce_admins: true,
  required_linear_history: true,
  allow_force_pushes: false, // GEI dropped
  allow_deletions: false,
  block_creations: false, // GEI dropped
  lock_branch: false, // GEI dropped
  required_conversation_resolution: true,
  required_status_checks: {
    strict: true,
    contexts: ['ci/build', 'ci/test'],
  },
  required_deployments: undefined, // GEI dropped
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    required_approving_review_count: 2,
    require_last_push_approval: false, // GEI dropped
    dismissal_restrictions: undefined, // GEI dropped
    bypass_pull_request_allowances: undefined, // GEI dropped
  },
};

test('computeBranchProtectionReconciliation detects all 7 GEI-omitted properties', () => {
  const diff = computeBranchProtectionReconciliation(
    comprehensiveSourceProtection,
    geiMigratedTargetProtection,
  );

  assert.equal(diff.needsReconciliation, true);
  assert.equal(diff.omittedSettings.bypassPullRequestAllowances, true);
  assert.equal(diff.omittedSettings.requireLastPushApproval, true);
  assert.equal(diff.omittedSettings.requiredDeployments, true);
  assert.equal(diff.omittedSettings.lockBranch, true);
  assert.equal(diff.omittedSettings.blockCreations, true);
  assert.equal(diff.omittedSettings.allowForcePushesCustom, true);
  assert.equal(diff.omittedSettings.dismissalRestrictions, true);

  // Assert reconciled payload contains all restored values
  const payload = diff.reconciledPayload as Record<string, unknown>;
  assert.equal(payload['lock_branch'], true);
  assert.equal(payload['block_creations'], true);
  assert.equal(payload['allow_force_pushes'], true);
  assert.deepEqual(
    (payload['required_deployments'] as { environments: string[] })
      .environments,
    ['production', 'staging'],
  );
  assert.equal(
    (
      payload['required_pull_request_reviews'] as {
        require_last_push_approval: boolean;
      }
    ).require_last_push_approval,
    true,
  );
  assert.deepEqual(
    (
      payload['required_pull_request_reviews'] as {
        bypass_pull_request_allowances: { users: string[] };
      }
    ).bypass_pull_request_allowances.users,
    ['bot-user'],
  );
  assert.deepEqual(
    (
      payload['required_pull_request_reviews'] as {
        dismissal_restrictions: { users: string[] };
      }
    ).dismissal_restrictions.users,
    ['alice'],
  );
});

test('convertBranchProtectionToRuleset produces conformant ruleset format', () => {
  const ruleset = convertBranchProtectionToRuleset(
    comprehensiveSourceProtection,
  );

  assert.equal(ruleset.name, 'Branch protection: main');
  assert.equal(ruleset.target, 'branch');
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.conditions?.ref_name?.include, ['refs/heads/main']);

  const ruleTypes = ruleset.rules?.map((r) => r.type) ?? [];
  assert.ok(ruleTypes.includes('deletion'));
  assert.ok(ruleTypes.includes('required_linear_history'));
  assert.ok(ruleTypes.includes('required_status_checks'));
  assert.ok(ruleTypes.includes('pull_request'));
  assert.ok(ruleTypes.includes('required_deployments'));
  assert.ok(ruleTypes.includes('creation'));
});

test('BranchProtectionReconciliationModule lifecycle: discover, plan, apply, verify', async () => {
  const module = new BranchProtectionReconciliationModule();
  const writeClient = new MockWriteClient();

  const ctx: MigrationContext = {
    runId: 'bp-run',
    scope: {
      level: 'repository',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      sourceRepo: 'repo-a',
      targetRepo: 'repo-a',
    },
    sourceClient: new MockReadAdapter(
      comprehensiveSourceProtection as unknown as Record<string, unknown>,
    ),
    targetClient: new MockReadAdapter(
      geiMigratedTargetProtection as unknown as Record<string, unknown>,
    ),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  // 1. Discover
  const discovered = await module.discover(ctx);
  assert.equal(discovered.protections.length, 1);
  assert.equal(discovered.protections[0]!.branch, 'main');

  // 2. Plan
  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.moduleId, 'branch-protection');
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]!.operation, 'update');
  assert.match(
    plan.operations[0]!.reason ?? '',
    /Reconciling GEI-omitted settings/,
  );

  // 3. Apply
  const execution = await module.apply(ctx, plan);
  assert.equal(execution.status, 'complete');
  assert.equal(writeClient.calls.length, 1);
  assert.equal(writeClient.calls[0]!.method, 'PUT');
  assert.equal(
    writeClient.calls[0]!.path,
    '/repos/dst-org/repo-a/branches/main/protection',
  );

  // 4. Verify post-apply against matching state
  const ctxVerified: MigrationContext = {
    ...ctx,
    targetClient: new MockReadAdapter(
      comprehensiveSourceProtection as unknown as Record<string, unknown>,
    ),
  };
  const verification = await module.verify(ctxVerified, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});
