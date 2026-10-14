import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AppsInventoryMigrationModule,
  type AppsInventoryData,
  type RawAppInstallationsListResponse,
} from '../../src/index.js';
import type { MigrationContext } from '../../src/core/types.js';
import type {
  EndpointProbeResult,
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

  async probeEndpoint(): Promise<EndpointProbeResult> {
    return { status: 200 };
  }
}

function createContext(
  sourceData: unknown,
  targetData: unknown,
  dryRun = false,
): MigrationContext {
  return {
    runId: 'test-run-apps',
    scope: {
      level: 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-emu-org',
    },
    sourceClient: new MockReadAdapter(sourceData),
    targetClient: new MockReadAdapter(targetData),
    dryRun,
    continueOnError: false,
    signal: new AbortController().signal,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

describe('AppsInventoryMigrationModule', () => {
  it('instantiates and provides valid metadata', () => {
    const mod = new AppsInventoryMigrationModule();
    assert.equal(mod.id, 'apps-inventory');
    assert.equal(mod.displayName, 'GitHub Apps & Integrations Inventory');
    assert.equal(mod.scopeLevel, 'organization');
    assert.deepEqual(mod.dependencies, ['org-settings']);
  });

  it('discover queries REST endpoint and parses installations', async () => {
    const raw: RawAppInstallationsListResponse = {
      total_count: 2,
      installations: [
        {
          id: 101,
          app_id: 1,
          app_slug: 'slack',
          repository_selection: 'all',
          permissions: { issues: 'read', pull_requests: 'read' },
          events: ['issues', 'pull_request'],
          html_url: 'https://github.com/apps/slack',
        },
        {
          id: 102,
          app_id: 2,
          app_slug: 'codecov',
          repository_selection: 'selected',
          permissions: { statuses: 'write' },
          events: ['status'],
          html_url: 'https://github.com/apps/codecov',
        },
      ],
    };

    const mod = new AppsInventoryMigrationModule();
    const ctx = createContext(raw, null);
    const discovered = await mod.discover(ctx);

    assert.equal(discovered.organization, 'source-org');
    assert.equal(discovered.installations.length, 2);
    assert.equal(discovered.installations[0].app_slug, 'slack');
    assert.equal(discovered.installations[0].repository_selection, 'all');
    assert.equal(discovered.installations[1].app_slug, 'codecov');
    assert.equal(discovered.installations[1].repository_selection, 'selected');
  });

  it('discover handles error properly with descriptive cause', async () => {
    const mod = new AppsInventoryMigrationModule();
    const ctx = createContext(new Error('Rate limited on installations'), null);
    await assert.rejects(
      () => mod.discover(ctx),
      /Failed to discover GitHub Apps inventory for source-org: Rate limited on installations/,
    );
  });

  it('plan generates reinstallation advisories, perms warnings, and noops', async () => {
    const mod = new AppsInventoryMigrationModule();
    const sourceData: AppsInventoryData = {
      organization: 'source-org',
      installations: [
        {
          id: 1,
          app_id: 10,
          app_slug: 'datadog',
          repository_selection: 'all',
          permissions: { checks: 'read' },
          events: ['check_run'],
        },
        {
          id: 2,
          app_id: 20,
          app_slug: 'snyk',
          repository_selection: 'all',
          permissions: { contents: 'write', issues: 'write' },
          events: ['push'],
        },
        {
          id: 3,
          app_id: 30,
          app_slug: 'jira-integration',
          repository_selection: 'all',
          permissions: { issues: 'read' },
          events: ['issues'],
        },
      ],
    };

    const targetData: RawAppInstallationsListResponse = {
      total_count: 2,
      installations: [
        {
          id: 101,
          app_id: 10,
          app_slug: 'datadog',
          repository_selection: 'all',
          permissions: { checks: 'read' }, // match
          events: ['check_run'],
        },
        {
          id: 102,
          app_id: 20,
          app_slug: 'snyk',
          repository_selection: 'all',
          permissions: { contents: 'read' }, // mismatch: write vs read, missing issues
          events: ['push'],
        },
      ],
    };

    const ctx = createContext(null, targetData);
    const plan = await mod.plan(ctx, sourceData);

    assert.equal(plan.moduleId, 'apps-inventory');
    assert.equal(plan.operations.length, 3);

    // datadog: noop
    const datadogOp = plan.operations.find((o) => o.resourceName === 'datadog');
    assert.ok(datadogOp);
    assert.equal(datadogOp.operation, 'noop');

    // snyk: warn (permissions mismatch)
    const snykOp = plan.operations.find((o) => o.resourceName === 'snyk');
    assert.ok(snykOp);
    assert.equal(snykOp.operation, 'warn');

    // jira-integration: warn (missing, manual reinstallation required)
    const jiraOp = plan.operations.find(
      (o) => o.resourceName === 'jira-integration',
    );
    assert.ok(jiraOp);
    assert.equal(jiraOp.operation, 'warn');
    assert.ok(plan.warnings.some((w) => w.includes('jira-integration')));
  });

  it('apply logs advisories and returns success in advisory mode', async () => {
    const mod = new AppsInventoryMigrationModule();
    const sourceData: AppsInventoryData = {
      organization: 'source-org',
      installations: [
        {
          id: 1,
          app_id: 10,
          app_slug: 'uninstalled-app',
          repository_selection: 'all',
          permissions: { issues: 'read' },
          events: [],
        },
      ],
    };

    const ctx = createContext(null, { total_count: 0, installations: [] });
    const plan = await mod.plan(ctx, sourceData);
    const result = await mod.apply(ctx, plan);

    assert.equal(result.status, 'complete');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'succeeded');
  });

  it('verify reports verified=true when all apps are installed with matching permissions', async () => {
    const mod = new AppsInventoryMigrationModule();
    const sourceData: AppsInventoryData = {
      organization: 'source-org',
      installations: [
        {
          id: 1,
          app_id: 10,
          app_slug: 'slack',
          repository_selection: 'all',
          permissions: { issues: 'read' },
          events: [],
        },
      ],
    };

    const targetData: RawAppInstallationsListResponse = {
      total_count: 1,
      installations: [
        {
          id: 101,
          app_id: 10,
          app_slug: 'slack',
          repository_selection: 'all',
          permissions: { issues: 'read' },
          events: [],
        },
      ],
    };

    const ctx = createContext(null, targetData);
    const plan = await mod.plan(ctx, sourceData);
    const result = await mod.verify(ctx, plan);

    assert.equal(result.verified, true);
    assert.equal(result.discrepancies.length, 0);
  });

  it('verify reports discrepancies for missing apps and permission mismatches', async () => {
    const mod = new AppsInventoryMigrationModule();
    const sourceData: AppsInventoryData = {
      organization: 'source-org',
      installations: [
        {
          id: 1,
          app_id: 10,
          app_slug: 'slack',
          repository_selection: 'all',
          permissions: { issues: 'read', pull_requests: 'write' },
          events: [],
        },
        {
          id: 2,
          app_id: 20,
          app_slug: 'missing-app',
          repository_selection: 'all',
          permissions: {},
          events: [],
        },
      ],
    };

    const targetData: RawAppInstallationsListResponse = {
      total_count: 1,
      installations: [
        {
          id: 101,
          app_id: 10,
          app_slug: 'slack',
          repository_selection: 'all',
          permissions: { issues: 'read', pull_requests: 'read' }, // mismatch
          events: [],
        },
      ],
    };

    const ctx = createContext(null, targetData);
    const plan = await mod.plan(ctx, sourceData);
    const result = await mod.verify(ctx, plan);

    assert.equal(result.verified, false);
    assert.equal(result.discrepancies.length, 2);
  });
});
