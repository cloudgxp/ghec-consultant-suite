import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ActionsRunnersMigrationModule,
  type ActionsRunnersData,
  type RawRunnerGroupsListResponse,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type { MigrationContext } from '../../src/core/types.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  constructor(private readonly data: unknown) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (this.data instanceof Error) {
      throw this.data;
    }
    return {
      data: this.data as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    throw new Error('Not implemented in mock');
  }

  async fetchAll<T>(): Promise<{
    items: T[];
    totalCount?: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented in mock');
  }

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    throw new Error('Not implemented in mock');
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly mutations: TargetWriteOperation[] = [];
  shouldFail = false;

  async mutate(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: unknown }> {
    if (this.shouldFail) {
      throw new Error(`Simulated mutation failure for ${op.id}`);
    }
    this.mutations.push(op);
    return { status: 200, data: { id: 101, name: 'mock' } };
  }
}

function createContext(
  sourceData: unknown,
  targetData: unknown,
  writeClient?: TargetWriteClient,
  dryRun = false,
  continueOnError = false,
): { ctx: MigrationContext; writeClient: MockWriteClient } {
  const writer = (writeClient ?? new MockWriteClient()) as MockWriteClient;
  const ctx: MigrationContext = {
    runId: 'test-run-123',
    scope: {
      level: 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-emu-org',
    },
    sourceClient: new MockReadAdapter(sourceData),
    targetClient: new MockReadAdapter(targetData),
    targetWriteClient: writer,
    dryRun,
    continueOnError,
    signal: new AbortController().signal,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  return { ctx, writeClient: writer };
}

describe('ActionsRunnersMigrationModule', () => {
  it('instantiates and provides valid metadata', () => {
    const mod = new ActionsRunnersMigrationModule();
    assert.equal(mod.id, 'actions-runners');
    assert.equal(mod.displayName, 'Actions Self-Hosted Runner Groups');
    assert.equal(mod.scopeLevel, 'organization');
    assert.deepEqual(mod.dependencies, ['actions-policies']);
  });

  it('discover correctly queries and extracts runner groups', async () => {
    const raw: RawRunnerGroupsListResponse = {
      total_count: 2,
      runner_groups: [
        {
          id: 1,
          name: 'Default',
          visibility: 'all',
          default: true,
          allows_public_repositories: false,
          restricted_to_workflows: false,
          selected_workflows: [],
        },
        {
          id: 2,
          name: 'Security-Hardened',
          visibility: 'selected',
          default: false,
          allows_public_repositories: true,
          restricted_to_workflows: true,
          selected_workflows: ['.github/workflows/deploy.yml'],
        },
      ],
    };

    const mod = new ActionsRunnersMigrationModule();
    const { ctx } = createContext(raw, { total_count: 0, runner_groups: [] });
    const discovered = await mod.discover(ctx);

    assert.equal(discovered.organization, 'source-org');
    assert.equal(discovered.runner_groups.length, 2);
    assert.equal(discovered.runner_groups[0].name, 'Default');
    assert.equal(discovered.runner_groups[0].visibility, 'all');
    assert.equal(discovered.runner_groups[1].name, 'Security-Hardened');
    assert.equal(discovered.runner_groups[1].visibility, 'selected');
    assert.equal(discovered.runner_groups[1].restricted_to_workflows, true);
  });

  it('discover throws wrapped error on read failure', async () => {
    const mod = new ActionsRunnersMigrationModule();
    const { ctx } = createContext(new Error('API 500 error'), {
      total_count: 0,
      runner_groups: [],
    });
    await assert.rejects(
      () => mod.discover(ctx),
      /Failed to discover Actions runner groups for source-org: API 500 error/,
    );
  });

  it('plan generates create, update, and noop operations with EMU policy enforcement', async () => {
    const mod = new ActionsRunnersMigrationModule();
    const sourceData: ActionsRunnersData = {
      organization: 'source-org',
      runner_groups: [
        {
          name: 'Default',
          visibility: 'all',
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
        {
          name: 'Linux-Builds',
          visibility: 'all',
          allows_public_repositories: true, // Should trigger EMU warning and adjustment
          restricted_to_workflows: false,
        },
        {
          name: 'Production-Deployers',
          visibility: 'selected',
          allows_public_repositories: false,
          restricted_to_workflows: true,
          selected_workflows: ['.github/workflows/release.yml'],
        },
      ],
    };

    const targetExisting: RawRunnerGroupsListResponse = {
      total_count: 2,
      runner_groups: [
        {
          id: 10,
          name: 'Default',
          visibility: 'all',
          default: true,
          allows_public_repositories: false,
          restricted_to_workflows: false,
          selected_workflows: [],
        },
        {
          id: 11,
          name: 'Linux-Builds',
          visibility: 'selected', // Needs update
          default: false,
          allows_public_repositories: false,
          restricted_to_workflows: false,
          selected_workflows: [],
        },
      ],
    };

    const { ctx } = createContext(null, targetExisting);
    const plan = await mod.plan(ctx, sourceData);

    assert.equal(plan.moduleId, 'actions-runners');
    assert.equal(plan.operations.length, 3);

    // Default: noop
    const defaultOp = plan.operations.find((o) => o.resourceName === 'Default');
    assert.ok(defaultOp);
    assert.equal(defaultOp.operation, 'noop');

    // Linux-Builds: update (visibility changed, allows_public enforced to false)
    const linuxOp = plan.operations.find(
      (o) => o.resourceName === 'Linux-Builds',
    );
    assert.ok(linuxOp);
    assert.equal(linuxOp.operation, 'update');
    assert.equal(
      (linuxOp.payload as { allows_public_repositories: boolean })
        .allows_public_repositories,
      false,
    );

    // Production-Deployers: create
    const prodOp = plan.operations.find(
      (o) => o.resourceName === 'Production-Deployers',
    );
    assert.ok(prodOp);
    assert.equal(prodOp.operation, 'create');

    // Check EMU warning was logged
    assert.ok(
      plan.warnings.some(
        (w) => w.includes('Linux-Builds') && w.includes('GHEC-EMU'),
      ),
    );
  });

  it('apply executes mutations in live mode and honors dryRun', async () => {
    const mod = new ActionsRunnersMigrationModule();
    const sourceData: ActionsRunnersData = {
      organization: 'source-org',
      runner_groups: [
        {
          name: 'GPU-Cluster',
          visibility: 'selected',
          allows_public_repositories: false,
          restricted_to_workflows: true,
        },
      ],
    };

    const { ctx: dryCtx, writeClient: dryWriter } = createContext(
      null,
      { total_count: 0, runner_groups: [] },
      undefined,
      true, // dryRun
    );

    const plan = await mod.plan(dryCtx, sourceData);
    const dryResult = await mod.apply(dryCtx, plan);

    assert.equal(dryResult.status, 'complete');
    assert.equal(dryWriter.mutations.length, 0);

    // Live mode
    const { ctx: liveCtx, writeClient: liveWriter } = createContext(
      null,
      { total_count: 0, runner_groups: [] },
      undefined,
      false, // live
    );

    const liveResult = await mod.apply(liveCtx, plan);
    assert.equal(liveResult.status, 'complete');
    assert.equal(liveWriter.mutations.length, 1);
    assert.equal(liveWriter.mutations[0].method, 'POST');
    assert.equal(
      liveWriter.mutations[0].path,
      '/orgs/{org}/actions/runner-groups',
    );
  });

  it('verify reports verified=true when all runner groups match', async () => {
    const mod = new ActionsRunnersMigrationModule();
    const sourceData: ActionsRunnersData = {
      organization: 'source-org',
      runner_groups: [
        {
          name: 'Default',
          visibility: 'all',
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
        {
          name: 'Internal-Runners',
          visibility: 'selected',
          allows_public_repositories: false,
          restricted_to_workflows: true,
        },
      ],
    };

    const targetData: RawRunnerGroupsListResponse = {
      total_count: 2,
      runner_groups: [
        {
          id: 1,
          name: 'Default',
          visibility: 'all',
          default: true,
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
        {
          id: 2,
          name: 'Internal-Runners',
          visibility: 'selected',
          default: false,
          allows_public_repositories: false,
          restricted_to_workflows: true,
        },
      ],
    };

    const { ctx } = createContext(null, targetData);
    const plan = await mod.plan(ctx, sourceData);
    const verifyResult = await mod.verify(ctx, plan);

    assert.equal(verifyResult.verified, true);
    assert.equal(verifyResult.discrepancies.length, 0);
  });

  it('verify reports discrepancies for missing runner group and property mismatches', async () => {
    const mod = new ActionsRunnersMigrationModule();
    const sourceData: ActionsRunnersData = {
      organization: 'source-org',
      runner_groups: [
        {
          name: 'Default',
          visibility: 'all',
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
        {
          name: 'Missing-Group',
          visibility: 'selected',
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
      ],
    };

    const targetData: RawRunnerGroupsListResponse = {
      total_count: 1,
      runner_groups: [
        {
          id: 1,
          name: 'Default',
          visibility: 'selected', // Mismatch
          default: true,
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
      ],
    };

    const { ctx } = createContext(null, targetData);
    const plan = await mod.plan(ctx, sourceData);
    const verifyResult = await mod.verify(ctx, plan);

    assert.equal(verifyResult.verified, false);
    assert.equal(verifyResult.discrepancies.length, 2);

    const missingDiscrepancy = verifyResult.discrepancies.find((d) =>
      d.resourceName.includes('Missing-Group'),
    );
    assert.ok(missingDiscrepancy);

    const visibilityDiscrepancy = verifyResult.discrepancies.find((d) =>
      d.resourceName.includes('Default.visibility'),
    );
    assert.ok(visibilityDiscrepancy);
  });

  it('discovers, plans, auto-creates, and verifies larger GitHub-hosted runners without modifying billing spend limits', async () => {
    const mod = new ActionsRunnersMigrationModule();
    const rawSource = {
      total_count: 1,
      runner_groups: [
        {
          id: 1,
          name: 'Default',
          visibility: 'all',
          default: true,
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
      ],
      runners: [
        {
          id: 501,
          name: 'ubuntu-16core-build',
          runner_group_id: 1,
          machine_size_details: { id: '16-core' },
          image_details: { id: 'ubuntu-24.04', source: 'github' },
          maximum_runners: 10,
          public_ip_enabled: false,
          status: 'Ready',
          platform: 'linux-x64',
        },
      ],
    };

    const targetBeforeApply = {
      total_count: 1,
      runner_groups: [
        {
          id: 10,
          name: 'Default',
          visibility: 'all',
          default: true,
          allows_public_repositories: false,
          restricted_to_workflows: false,
        },
      ],
      runners: [],
    };

    const { ctx, writeClient } = createContext(rawSource, targetBeforeApply);
    const discovered = await mod.discover(ctx);

    assert.equal(discovered.hosted_runners?.length, 1);
    assert.equal(discovered.hosted_runners?.[0]?.name, 'ubuntu-16core-build');
    assert.equal(discovered.hosted_runners?.[0]?.size, '16-core');
    assert.equal(discovered.hosted_runners?.[0]?.runner_group_name, 'Default');

    const plan = await mod.plan(ctx, discovered);
    const hostedRunnerOp = plan.operations.find(
      (op) => op.resourceType === 'hosted-runner',
    );
    assert.ok(hostedRunnerOp);
    assert.equal(hostedRunnerOp.operation, 'create');
    assert.equal(hostedRunnerOp.resourceName, 'ubuntu-16core-build');
    assert.ok(
      plan.warnings?.some((w) => w.includes('Actions spending limits')),
    );

    const execResult = await mod.apply(ctx, plan);
    assert.equal(execResult.status, 'complete');
    const hostedMutation = writeClient.mutations.find(
      (m) => m.path === '/orgs/{org}/actions/hosted-runners',
    );
    assert.ok(hostedMutation);
    assert.equal(hostedMutation.method, 'POST');
    assert.deepEqual(hostedMutation.body, {
      name: 'ubuntu-16core-build',
      size: '16-core',
      image: { id: 'ubuntu-24.04', source: 'github' },
      runner_group_id: 10,
      maximum_runners: 10,
      enable_static_ip: false,
    });

    // Verify when target now has the larger hosted runner registered
    const targetAfterApply = {
      ...targetBeforeApply,
      runners: [
        {
          id: 901,
          name: 'ubuntu-16core-build',
          runner_group_id: 10,
          size: '16-core',
          image: { id: 'ubuntu-24.04', source: 'github' },
          status: 'Shutdown',
        },
      ],
    };
    const { ctx: verifyCtx } = createContext(rawSource, targetAfterApply);
    const verifyResult = await mod.verify(verifyCtx, plan);
    assert.equal(verifyResult.verified, true);
    assert.equal(verifyResult.discrepancies.length, 0);
  });
});
