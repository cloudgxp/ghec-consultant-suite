import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AppsInventoryMigrationModule,
  buildGitHubAppManifest,
  buildGitHubAppUrlParametersLink,
  buildRecreatedAppSlug,
  classifyGitHubApp,
  MAX_GITHUB_APP_NAME_LENGTH,
  type AppsInventoryData,
  type GitHubAppManifestPayload,
  type RawAppInstallationsListResponse,
} from '../../src/index.js';
import type { MigrationContext } from '../../src/core/types.js';
import type {
  EndpointProbeResult,
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  constructor(
    private readonly data: unknown,
    private readonly routeHandler?: (op: ReadOperation) => {
      data: unknown;
      status: number;
    } | null,
  ) {}

  async readSingle<T>(op: ReadOperation): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (this.routeHandler) {
      const routed = this.routeHandler(op);
      if (routed) {
        if (routed.data instanceof Error) {
          throw routed.data;
        }
        return {
          data: routed.data as T,
          status: routed.status,
          observedAt: new Date().toISOString(),
        };
      }
    }
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
  sourceRouteHandler?: (op: ReadOperation) => {
    data: unknown;
    status: number;
  } | null,
): MigrationContext {
  return {
    runId: 'test-run-apps',
    scope: {
      level: 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-emu-org',
    },
    sourceClient: new MockReadAdapter(sourceData, sourceRouteHandler),
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

  it('discover classifies third_party, custom_public, and custom_private apps via GET /apps/{app_slug}', async () => {
    const raw: RawAppInstallationsListResponse = {
      total_count: 3,
      installations: [
        {
          id: 101,
          app_id: 1,
          app_slug: 'datadog',
          repository_selection: 'all',
          permissions: { checks: 'read' },
          events: ['check_run'],
        },
        {
          id: 102,
          app_id: 2,
          app_slug: 'source-public-bot',
          repository_selection: 'all',
          permissions: { issues: 'write' },
          events: ['issues'],
        },
        {
          id: 103,
          app_id: 3,
          app_slug: 'internal-deploy-bot',
          repository_selection: 'selected',
          permissions: { deployments: 'write', contents: 'read' },
          events: ['deployment'],
        },
      ],
    };

    const mod = new AppsInventoryMigrationModule();
    const ctx = createContext(raw, null, false, (op) => {
      if (op.id === 'rest.apps.getBySlug') {
        const slug = op.pathParams?.app_slug;
        if (slug === 'datadog') {
          return {
            status: 200,
            data: {
              slug: 'datadog',
              name: 'Datadog',
              external_url: 'https://www.datadoghq.com',
              owner: { login: 'DataDog', type: 'Organization' },
            },
          };
        }
        if (slug === 'source-public-bot') {
          return {
            status: 200,
            data: {
              slug: 'source-public-bot',
              name: 'Source Public Bot',
              description: 'Public org bot',
              external_url: 'https://bot.example.com',
              owner: { login: 'source-org', type: 'Organization' },
            },
          };
        }
        if (slug === 'internal-deploy-bot') {
          return {
            status: 404,
            data: new Error('Not Found'),
          };
        }
      }
      return null;
    });

    const discovered = await mod.discover(ctx);
    assert.equal(discovered.installations.length, 3);

    assert.equal(discovered.installations[0].classification, 'third_party');
    assert.equal(
      discovered.installations[0].recommended_strategy,
      'install_existing',
    );
    assert.equal(discovered.installations[0].owner_login, 'DataDog');

    assert.equal(discovered.installations[1].classification, 'custom_public');
    assert.equal(discovered.installations[1].recommended_strategy, 'either');
    assert.equal(discovered.installations[1].owner_login, 'source-org');

    assert.equal(discovered.installations[2].classification, 'custom_private');
    assert.equal(
      discovered.installations[2].recommended_strategy,
      'recreate_app',
    );
  });

  it('discover handles error properly with descriptive cause', async () => {
    const mod = new AppsInventoryMigrationModule();
    const ctx = createContext(new Error('Rate limited on installations'), null);
    await assert.rejects(
      () => mod.discover(ctx),
      /Failed to discover GitHub Apps inventory for source-org: Rate limited on installations/,
    );
  });

  it('plan generates reinstallation advisories, manifest payloads, URL links, perms warnings, and noops', async () => {
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
          app_slug: 'internal-deploy-bot',
          repository_selection: 'all',
          permissions: { deployments: 'write', issues: 'read' },
          events: ['deployment', 'issues'],
          classification: 'custom_private',
          recommended_strategy: 'recreate_app',
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

    // internal-deploy-bot: warn with both direct install URL and manifest recreation payload
    const botOp = plan.operations.find(
      (o) => o.resourceName === 'internal-deploy-bot',
    );
    assert.ok(botOp);
    assert.equal(botOp.operation, 'warn');
    assert.ok(plan.warnings.some((w) => w.includes('internal-deploy-bot')));

    const payload = botOp.payload as {
      classification: string;
      recommended_strategy: string;
      recreated_app_slug: string;
      destination_install_url: string;
      recreate_app_url: string;
      manifest: GitHubAppManifestPayload;
    };
    assert.equal(payload.classification, 'custom_private');
    assert.equal(payload.recommended_strategy, 'recreate_app');
    assert.ok(payload.recreated_app_slug.length <= MAX_GITHUB_APP_NAME_LENGTH);
    assert.equal(
      payload.destination_install_url,
      'https://github.com/apps/internal-deploy-bot/installations/new',
    );
    assert.match(
      payload.recreate_app_url,
      /^https:\/\/github\.com\/organizations\/target-emu-org\/settings\/apps\/new\?/,
    );
    assert.match(payload.recreate_app_url, /deployments=write/);
    assert.match(payload.recreate_app_url, /events%5B%5D=deployment/);
    assert.deepEqual(payload.manifest.default_permissions, {
      deployments: 'write',
      issues: 'read',
    });
    assert.deepEqual(payload.manifest.default_events, ['deployment', 'issues']);
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

  it('verify reports verified=true when all apps are installed with matching permissions (including recreated custom app slug)', async () => {
    const mod = new AppsInventoryMigrationModule();
    const recreatedBotSlug = buildRecreatedAppSlug(
      'internal-bot',
      'target-emu-org',
    );
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
        {
          id: 2,
          app_id: 20,
          app_slug: 'internal-bot',
          repository_selection: 'selected',
          permissions: { deployments: 'write' },
          events: ['deployment'],
          classification: 'custom_private',
          recommended_strategy: 'recreate_app',
        },
      ],
    };

    const targetData: RawAppInstallationsListResponse = {
      total_count: 2,
      installations: [
        {
          id: 101,
          app_id: 10,
          app_slug: 'slack',
          repository_selection: 'all',
          permissions: { issues: 'read' },
          events: [],
        },
        {
          id: 102,
          app_id: 999,
          app_slug: recreatedBotSlug,
          repository_selection: 'selected',
          permissions: { deployments: 'write' },
          events: ['deployment'],
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

  it('buildRecreatedAppSlug enforces the 34-character GitHub App name limit', () => {
    const shortSlug = buildRecreatedAppSlug('my-bot', 'emu-org');
    assert.equal(shortSlug, 'my-bot-emu-org');
    assert.ok(shortSlug.length <= MAX_GITHUB_APP_NAME_LENGTH);

    const longSlug = buildRecreatedAppSlug(
      'enterprise-deployment-automation-controller-service',
      'global-enterprise-managed-users-org',
    );
    assert.ok(
      longSlug.length <= MAX_GITHUB_APP_NAME_LENGTH,
      `Expected length <= 34, got ${longSlug.length} (${longSlug})`,
    );
    assert.doesNotMatch(longSlug, /-$/);
  });

  it('classifyGitHubApp and manifest builders produce valid manifest and URL query parameters', () => {
    const privateClass = classifyGitHubApp({
      sourceOrg: 'source-org',
      status: 404,
      details: null,
    });
    assert.equal(privateClass.classification, 'custom_private');
    assert.equal(privateClass.recommendedStrategy, 'recreate_app');

    const manifest = buildGitHubAppManifest(
      {
        app_slug: 'release-bot',
        permissions: { contents: 'write', metadata: 'read' },
        events: ['push', 'release'],
      },
      'target-emu',
      { redirectUrl: 'http://localhost:3000/callback' },
    );

    assert.equal(manifest.name, 'release-bot-target-emu');
    assert.equal(manifest.public, false);
    assert.equal(manifest.redirect_url, 'http://localhost:3000/callback');
    assert.deepEqual(manifest.default_permissions, {
      contents: 'write',
      metadata: 'read',
    });
    assert.deepEqual(manifest.default_events, ['push', 'release']);

    const urlLink = buildGitHubAppUrlParametersLink(
      {
        app_slug: 'release-bot',
        permissions: { contents: 'write', metadata: 'read' },
        events: ['push', 'release'],
      },
      'target-emu',
    );
    assert.match(
      urlLink,
      /^https:\/\/github\.com\/organizations\/target-emu\/settings\/apps\/new\?/,
    );
    assert.match(urlLink, /name=release-bot-target-emu/);
    assert.match(urlLink, /contents=write/);
    assert.match(urlLink, /events%5B%5D=release/);
  });

  it('discovers selected_repositories for repo-scoped GitHub Apps and auto-binds them when installed on target', async () => {
    const mod = new AppsInventoryMigrationModule();
    const rawSource: RawAppInstallationsListResponse = {
      total_count: 1,
      installations: [
        {
          id: 5001,
          app_id: 77,
          app_slug: 'dependabot-helper',
          repository_selection: 'selected',
          permissions: { contents: 'read' },
          events: ['push'],
        },
      ],
    };

    const rawTarget: RawAppInstallationsListResponse = {
      total_count: 1,
      installations: [
        {
          id: 9001,
          app_id: 77,
          app_slug: 'dependabot-helper',
          repository_selection: 'selected',
          permissions: { contents: 'read' },
          events: ['push'],
        },
      ],
    };

    const mutations: Array<{
      method: string;
      path: string;
      pathParams?: Record<string, string>;
    }> = [];

    const ctx: MigrationContext = {
      ...createContext(rawSource, rawTarget, false, (op) => {
        if (op.path === '/user/installations/{installation_id}/repositories') {
          return {
            status: 200,
            data: {
              total_count: 2,
              repositories: [{ name: 'api-core' }, { name: 'web-ui' }],
            },
          };
        }
        return null;
      }),
      targetClient: new MockReadAdapter(rawTarget, (op) => {
        if (op.path === '/repos/{owner}/{repo}') {
          return {
            status: 200,
            data: {
              id: op.pathParams?.repo === 'api-core' ? 401 : 402,
              name: op.pathParams?.repo,
            },
          };
        }
        return null;
      }),
      targetWriteClient: {
        async mutate(op) {
          mutations.push({
            method: op.method,
            path: op.path,
            pathParams: op.pathParams,
          });
          return { status: 204 };
        },
      },
    };

    const discovered = await mod.discover(ctx);
    assert.deepEqual(discovered.installations[0]?.selected_repositories, [
      'api-core',
      'web-ui',
    ]);

    const plan = await mod.plan(ctx, discovered);
    const bindOp = plan.operations.find(
      (op) => op.resourceType === 'github_app_repository_binding',
    );
    assert.ok(bindOp);
    assert.equal(bindOp.operation, 'update');

    const applyResult = await mod.apply(ctx, plan);
    assert.equal(applyResult.status, 'complete');
    assert.equal(mutations.length, 2);
    assert.deepEqual(mutations[0], {
      method: 'PUT',
      path: '/user/installations/{installation_id}/repositories/{repository_id}',
      pathParams: {
        installation_id: '9001',
        repository_id: '401',
      },
    });
    assert.deepEqual(mutations[1], {
      method: 'PUT',
      path: '/user/installations/{installation_id}/repositories/{repository_id}',
      pathParams: {
        installation_id: '9001',
        repository_id: '402',
      },
    });
  });
});
