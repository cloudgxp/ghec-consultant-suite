import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateBundle, type Entity } from '@ghec/contracts';
import { collector as actionsCollector } from '../src/collectors/actions.js';
import { collector as securityCollector } from '../src/collectors/security.js';
import { collector as integrationsCollector } from '../src/collectors/integrations.js';
import { collector as lfsCollector } from '../src/collectors/lfs.js';
import { HttpGitHubReadAdapter } from '../src/github/http.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';

test('actions collector extracts runner groups, self-hosted runners, workflow policy, and repo workflows', async () => {
  const mockFetch: typeof globalThis.fetch = async (url) => {
    const urlStr = String(url);

    if (urlStr.includes('/actions/permissions/workflow')) {
      return new Response(
        JSON.stringify({
          default_workflow_permissions: 'read',
          can_approve_pull_request_reviews: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/actions/runner-groups')) {
      return new Response(
        JSON.stringify({
          total_count: 1,
          runner_groups: [
            {
              id: 10,
              name: 'Enterprise-Tier-Runners',
              visibility: 'selected',
              allows_public_repositories: false,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/actions/runners')) {
      return new Response(
        JSON.stringify({
          total_count: 1,
          runners: [
            {
              id: 501,
              name: 'linux-runner-gpu-1',
              os: 'linux',
              status: 'online',
              busy: false,
              labels: [{ id: 1, name: 'gpu-runner' }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/actions/permissions')) {
      return new Response(JSON.stringify({ enabled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('/actions/workflows')) {
      return new Response(
        JSON.stringify({
          total_count: 1,
          workflows: [
            {
              id: 1234,
              name: 'Build and Test',
              path: '.github/workflows/ci.yml',
              state: 'active',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-03-01T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'test-token',
    fetchImpl: mockFetch,
  });

  const repoEntity: Extract<Entity, { kind: 'repository' }> = {
    id: 'org:acme:repo:frontend',
    organizationId: 'acme',
    collectorExecutionId: 'exec:acme:repos:1',
    provenance: {
      source: 'graphql',
      operation: 'graphql.org.repositories',
      observedAt: '2026-03-10T12:00:00Z',
      apiVersion: '2026-03-10',
    },
    kind: 'repository',
    name: 'frontend',
    visibility: 'private',
    archived: false,
    defaultBranch: 'main',
    size: {
      value: 1024,
      unit: 'bytes',
      availability: 'observed',
      reason: null,
    },
    fork: false,
  };

  const result = await actionsCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:actions:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['actions'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
    sharedState: {
      repositories: [repoEntity],
    },
  });

  assert.equal(result.execution.status, 'complete');

  // Verify entities
  const actionRepoEntity = result.entities.find((e) => e.kind === 'actions');
  assert.ok(actionRepoEntity);
  assert.equal(actionRepoEntity.repositoryId, 'org:acme:repo:frontend');

  const wfEntity = result.entities.find((e) => e.kind === 'action-workflow');
  assert.ok(wfEntity);
  assert.equal(wfEntity.name, 'Build and Test');

  const policyEntity = result.entities.find((e) => e.kind === 'action-policy');
  assert.ok(policyEntity);
  assert.equal(policyEntity.defaultTokenPermission, 'read');
  assert.equal(policyEntity.canApprovePullRequests, true);

  const groupEntity = result.entities.find(
    (e) => e.kind === 'action-runner-group',
  );
  assert.ok(groupEntity);
  assert.equal(groupEntity.name, 'Enterprise-Tier-Runners');
  assert.equal(groupEntity.visibility, 'selected');

  const runnerEntity = result.entities.find((e) => e.kind === 'action-runner');
  assert.ok(runnerEntity);
  assert.equal(runnerEntity.name, 'linux-runner-gpu-1');
  assert.equal(runnerEntity.status, 'online');
  assert.equal(runnerEntity.runnerType, 'self-hosted');
  assert.deepEqual(runnerEntity.labels, ['gpu-runner']);
});

test('security collector observes code scanning, dependabot, and open alert counts', async () => {
  const mockFetch: typeof globalThis.fetch = async (url) => {
    const urlStr = String(url);

    if (urlStr.includes('/code-scanning/default-setup')) {
      return new Response(JSON.stringify({ state: 'configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('/vulnerability-alerts')) {
      return new Response(null, { status: 204 });
    }

    if (urlStr.includes('/dependabot/alerts')) {
      return new Response(
        JSON.stringify([
          { number: 101 },
          { number: 102 },
          { number: 103 },
          { number: 104 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'test-token',
    fetchImpl: mockFetch,
  });

  const repoEntity: Extract<Entity, { kind: 'repository' }> = {
    id: 'org:acme:repo:backend',
    organizationId: 'acme',
    collectorExecutionId: 'exec:acme:repos:1',
    provenance: {
      source: 'graphql',
      operation: 'graphql.org.repositories',
      observedAt: '2026-03-10T12:00:00Z',
      apiVersion: '2026-03-10',
    },
    kind: 'repository',
    name: 'backend',
    visibility: 'private',
    archived: false,
    defaultBranch: 'main',
    size: {
      value: 2048,
      unit: 'bytes',
      availability: 'observed',
      reason: null,
    },
    fork: false,
  };

  const result = await securityCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:security:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['security'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
    sharedState: {
      repositories: [repoEntity],
    },
  });

  assert.equal(result.execution.status, 'complete');
  assert.equal(result.entities.length, 1);
  const sec = result.entities[0] as Extract<Entity, { kind: 'security' }>;
  assert.equal(sec.kind, 'security');
  assert.equal(sec.codeScanning, 'enabled');
  assert.equal(sec.dependabot, 'enabled');
  assert.equal(sec.openAlertCount.value, 4);
  assert.equal(sec.openAlertCount.availability, 'observed');
});

test('integrations collector extracts org apps/hooks and repo deploy keys/hooks without secret leaks', async () => {
  const mockFetch: typeof globalThis.fetch = async (url) => {
    const urlStr = String(url);

    if (urlStr.includes('/orgs/acme/installations')) {
      return new Response(
        JSON.stringify([
          { id: 42, app_slug: 'datadog-monitor', suspended_at: null },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/orgs/acme/hooks')) {
      return new Response(
        JSON.stringify([
          {
            id: 88,
            name: 'web',
            active: true,
            config: {
              url: 'https://example.com/webhook',
              secret: 'SUPER_SECRET_LEAK',
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/repos/acme/service-a/keys')) {
      return new Response(
        JSON.stringify([
          {
            id: 999,
            title: 'deploy-token-prod',
            read_only: true,
            verified: true,
            key: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... dummy',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlStr.includes('/repos/acme/service-a/hooks')) {
      return new Response(
        JSON.stringify([
          {
            id: 111,
            name: 'web',
            active: true,
            config: {
              url: 'https://example.com/repo-webhook',
              secret: 'ANOTHER_SECRET',
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'test-token',
    fetchImpl: mockFetch,
  });

  const repoEntity: Extract<Entity, { kind: 'repository' }> = {
    id: 'org:acme:repo:service-a',
    organizationId: 'acme',
    collectorExecutionId: 'exec:acme:repos:1',
    provenance: {
      source: 'graphql',
      operation: 'graphql.org.repositories',
      observedAt: '2026-03-10T12:00:00Z',
      apiVersion: '2026-03-10',
    },
    kind: 'repository',
    name: 'service-a',
    visibility: 'private',
    archived: false,
    defaultBranch: 'main',
    size: {
      value: 1024,
      unit: 'bytes',
      availability: 'observed',
      reason: null,
    },
    fork: false,
  };

  const result = await integrationsCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:integrations:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['integrations'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
    sharedState: {
      repositories: [repoEntity],
    },
  });

  assert.equal(result.execution.status, 'complete');
  assert.equal(result.entities.length, 4);

  const appEntity = result.entities.find(
    (e) => e.integrationKind === 'github_app',
  );
  assert.ok(appEntity);
  assert.equal(appEntity.label, 'datadog-monitor');
  assert.equal(appEntity.repositoryId, null);

  const orgHookEntity = result.entities.find(
    (e) => e.integrationKind === 'webhook' && e.repositoryId === null,
  );
  assert.ok(orgHookEntity);
  assert.equal(orgHookEntity.active, true);

  const deployKeyEntity = result.entities.find(
    (e) => e.integrationKind === 'deploy_key',
  );
  assert.ok(deployKeyEntity);
  assert.equal(deployKeyEntity.repositoryId, 'org:acme:repo:service-a');
  assert.equal(deployKeyEntity.label, 'deploy-token-prod');

  const repoHookEntity = result.entities.find(
    (e) =>
      e.integrationKind === 'webhook' &&
      e.repositoryId === 'org:acme:repo:service-a',
  );
  assert.ok(repoHookEntity);

  // Strict check: zero secrets leaked
  const serialized = JSON.stringify(result.entities);
  assert.equal(serialized.includes('SUPER_SECRET_LEAK'), false);
  assert.equal(serialized.includes('ANOTHER_SECRET'), false);
  assert.equal(serialized.includes('AAAAB3NzaC1yc2E'), false);
});

test('lfs collector inspects .gitattributes to set indicator detected vs not_detected honestly', async () => {
  const mockFetch: typeof globalThis.fetch = async (url) => {
    const urlStr = String(url);

    if (urlStr.includes('/repos/acme/lfs-repo/contents/.gitattributes')) {
      const content = Buffer.from(
        '*.bin filter=lfs diff=lfs merge=lfs -text\n',
      ).toString('base64');
      return new Response(JSON.stringify({ content, encoding: 'base64' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('/repos/acme/standard-repo/contents/.gitattributes')) {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'test-token',
    fetchImpl: mockFetch,
  });

  const repo1: Extract<Entity, { kind: 'repository' }> = {
    id: 'org:acme:repo:lfs-repo',
    organizationId: 'acme',
    collectorExecutionId: 'exec:acme:repos:1',
    provenance: {
      source: 'graphql',
      operation: 'graphql.org.repositories',
      observedAt: '2026-03-10T12:00:00Z',
      apiVersion: '2026-03-10',
    },
    kind: 'repository',
    name: 'lfs-repo',
    visibility: 'private',
    archived: false,
    defaultBranch: 'main',
    size: {
      value: 50000,
      unit: 'bytes',
      availability: 'observed',
      reason: null,
    },
    fork: false,
  };

  const repo2: Extract<Entity, { kind: 'repository' }> = {
    id: 'org:acme:repo:standard-repo',
    organizationId: 'acme',
    collectorExecutionId: 'exec:acme:repos:1',
    provenance: {
      source: 'graphql',
      operation: 'graphql.org.repositories',
      observedAt: '2026-03-10T12:00:00Z',
      apiVersion: '2026-03-10',
    },
    kind: 'repository',
    name: 'standard-repo',
    visibility: 'private',
    archived: false,
    defaultBranch: 'main',
    size: {
      value: 1000,
      unit: 'bytes',
      availability: 'observed',
      reason: null,
    },
    fork: false,
  };

  const result = await lfsCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:lfs:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['lfs'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
    sharedState: {
      repositories: [repo1, repo2],
    },
  });

  assert.equal(result.execution.status, 'complete');
  assert.equal(result.entities.length, 2);

  const lfs1 = result.entities.find(
    (e) => e.id === 'org:acme:lfs:lfs-repo',
  ) as Extract<Entity, { kind: 'lfs' }>;
  assert.ok(lfs1);
  assert.equal(lfs1.indicator, 'detected');
  assert.equal(lfs1.storage.availability, 'unknown');
  assert.equal(lfs1.storage.value, null);

  const lfs2 = result.entities.find(
    (e) => e.id === 'org:acme:lfs:standard-repo',
  ) as Extract<Entity, { kind: 'lfs' }>;
  assert.ok(lfs2);
  assert.equal(lfs2.indicator, 'not_detected');
  assert.equal(lfs2.storage.availability, 'unknown');
  assert.equal(lfs2.storage.value, null);
});

test('DiscoveryOrchestrator runs all advanced domain collectors and emits a fully valid bundle', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ghec-advanced-test-'));

  const mockFetch: typeof globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    const bodyStr = typeof init?.body === 'string' ? init.body : '';

    if (bodyStr.includes('OrgDeepMetadata')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4999,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              id: 'O_1',
              login: 'enterprise-org',
              name: 'Enterprise Org',
              websiteUrl: null,
              isVerified: true,
              requiresTwoFactorAuthentication: true,
              defaultRepositoryPermission: 'READ',
              membersWithRole: { totalCount: 10 },
              pendingMembers: { totalCount: 0 },
              securityManagers: { nodes: [] },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (bodyStr.includes('OrgRepositoriesDeep')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4998,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
                nodes: [
                  {
                    id: 'R_100',
                    name: 'prod-repo',
                    visibility: 'PRIVATE',
                    isArchived: false,
                    isFork: false,
                    diskUsage: 1024,
                    defaultBranchRef: { name: 'main' },
                    branchProtectionRules: { nodes: [] },
                    rulesets: { nodes: [] },
                    releases: { nodes: [] },
                    packages: { nodes: [] },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Actions endpoints
    if (urlStr.includes('/actions/permissions/workflow')) {
      return new Response(
        JSON.stringify({
          default_workflow_permissions: 'write',
          can_approve_pull_request_reviews: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/actions/runner-groups')) {
      return new Response(JSON.stringify({ runner_groups: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/actions/runners')) {
      return new Response(JSON.stringify({ runners: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/actions/permissions')) {
      return new Response(JSON.stringify({ enabled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/actions/workflows')) {
      return new Response(JSON.stringify({ workflows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Security endpoints
    if (urlStr.includes('/code-scanning/default-setup')) {
      return new Response(JSON.stringify({ state: 'configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/vulnerability-alerts')) {
      return new Response(null, { status: 204 });
    }
    if (urlStr.includes('/dependabot/alerts')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Integrations endpoints
    if (urlStr.includes('/installations')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/orgs/enterprise-org/hooks')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/keys')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/repos/enterprise-org/prod-repo/hooks')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // LFS endpoint
    if (urlStr.includes('/contents/.gitattributes')) {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
      });
    }

    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'test-token',
    fetchImpl: mockFetch,
  });

  try {
    const orchestrator = new DiscoveryOrchestrator(
      {
        scope: { kind: 'organization', name: 'enterprise-org' },
        modules: [
          'orgs',
          'repos',
          'actions',
          'security',
          'integrations',
          'lfs',
        ],
        output: tempDir,
        dryRun: false,
        concurrency: 2,
        includeSensitiveMetadata: false,
        redactionProfile: 'standard',
        continueOnError: false,
      },
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'test-token',
      },
      adapter,
    );

    const controller = new AbortController();
    const result = await orchestrator.run(controller.signal);

    assert.equal(result.exitCode, 0);
    const validation = validateBundle(result.bundle);
    assert.ok(
      validation.success,
      `Bundle contract validation failed: ${validation.message}`,
    );
    assert.equal(result.bundle.organizations.length, 1);
    assert.equal(result.bundle.organizations[0]?.login, 'enterprise-org');

    // Ensure all 6 modules are represented in collectors
    const collectedModules = result.bundle.collectors.map((c) => c.module);
    const expectedModules: Array<(typeof collectedModules)[number]> = [
      'orgs',
      'repos',
      'actions',
      'security',
      'integrations',
      'lfs',
    ];
    for (const mod of expectedModules) {
      assert.ok(
        collectedModules.includes(mod),
        `Module ${mod} must be in collectors`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
