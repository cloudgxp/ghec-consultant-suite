import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBundle, type Entity } from '@ghec/contracts';
import { HttpGitHubReadAdapter } from '../src/github/http.js';
import { collector as reposCollector } from '../src/collectors/repos.js';
import { collector as policiesCollector } from '../src/collectors/policies.js';
import { collector as teamsCollector } from '../src/collectors/teams.js';
import { collector as actionsCollector } from '../src/collectors/actions.js';
import { collector as actionsSecretsCollector } from '../src/collectors/actions-secrets.js';
import { collector as securityCollector } from '../src/collectors/security.js';
import { collector as integrationsCollector } from '../src/collectors/integrations.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';
import { parseDiscoveryOptions } from '../src/commands/discover.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('HttpGitHubReadAdapter.queryGraphQL executes queries and extracts cost and rate limit metrics', async () => {
  let capturedBody: string | undefined;
  const mockFetch: typeof globalThis.fetch = async (_url, init) => {
    capturedBody = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(
      JSON.stringify({
        data: {
          rateLimit: {
            cost: 2,
            remaining: 4950,
            resetAt: '2026-03-10T12:00:00Z',
          },
          organization: {
            name: 'Acme Corp',
          },
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-ratelimit-remaining': '4950',
          'x-ratelimit-reset': '1773144000',
        },
      },
    );
  };

  const adapter = new HttpGitHubReadAdapter({
    token: 'test-token',
    fetchImpl: mockFetch,
  });

  const res = await adapter.queryGraphQL<{
    organization: { name: string };
  }>(
    'query GetOrg($login: String!) { organization(login: $login) { name } }',
    { login: 'acme' },
    new AbortController().signal,
  );

  assert.equal(res.data.organization.name, 'Acme Corp');
  assert.equal(res.cost, 2);
  assert.equal(res.remainingPoints, 4950);
  assert.equal(res.resetAt, '2026-03-10T12:00:00Z');
  assert.ok(capturedBody);
  const parsed = JSON.parse(capturedBody!);
  assert.equal(parsed.variables?.login, 'acme');
});

test('HttpGitHubReadAdapter.queryGraphQL sanitizes GraphQL error array without leaking query variables', async () => {
  const mockFetch: typeof globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        errors: [
          {
            message:
              'Could not resolve to an Organization with the login of secret-org.',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  const adapter = new HttpGitHubReadAdapter({
    fetchImpl: mockFetch,
  });

  await assert.rejects(
    () =>
      adapter.queryGraphQL(
        'query ($login: String!) { org(login: $login) }',
        { login: 'secret-org', secretParam: 'token-value-123' },
        new AbortController().signal,
      ),
    (err: Error) => {
      assert.match(err.message, /GraphQL query failed/);
      assert.doesNotMatch(err.message, /token-value-123/);
      return true;
    },
  );
});

test('GraphQL collectors (repos, policies, teams) tag provenance with source = graphql', async () => {
  const mockFetch: typeof globalThis.fetch = async (_url, init) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    if (bodyStr.includes('OrgRepositories')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4999,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
                nodes: [
                  {
                    id: 'R_123',
                    name: 'payments-api',
                    visibility: 'PRIVATE',
                    isArchived: false,
                    isFork: false,
                    diskUsage: 2048,
                    defaultBranchRef: { name: 'main' },
                    branchProtectionRules: {
                      nodes: [
                        {
                          pattern: 'main',
                          requiresApprovingReviews: true,
                          requiredApprovingReviewCount: 2,
                          requiresStatusChecks: true,
                          requiresStrictStatusChecks: true,
                        },
                      ],
                    },
                    rulesets: {
                      nodes: [
                        {
                          name: 'prod-release',
                          enforcement: 'ACTIVE',
                          target: 'branch',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (bodyStr.includes('OrgTeams')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4998,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              teams: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    slug: 'core-devs',
                    name: 'Core Developers',
                    parentTeam: null,
                    members: { totalCount: 8 },
                    repositories: {
                      edges: [
                        {
                          permission: 'ADMIN',
                          node: { name: 'payments-api' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
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

  const signal = new AbortController().signal;

  // 1. Run repos
  const repoResult = await reposCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:repos:1',
    adapter,
    signal,
    configuration: {
      modules: ['repos', 'policies', 'teams'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
  });

  assert.equal(repoResult.execution.status, 'complete');
  assert.equal(repoResult.execution.provenance[0]?.source, 'graphql');
  assert.ok(repoResult.entities.length >= 3);
  assert.ok(
    repoResult.entities.some(
      (entity) => entity.kind === 'repository-portfolio',
    ),
  );
  assert.ok(
    repoResult.entities.some((entity) => entity.kind === 'code-ownership'),
  );
  const repoEntity = repoResult.entities.find(
    (entity) => entity.kind === 'repository',
  )!;
  assert.equal(repoEntity.kind, 'repository');
  assert.equal(repoEntity.provenance.source, 'graphql');
  assert.equal(repoEntity.size.value, 2048 * 1024); // KB to bytes conversion

  // 2. Run policies with sharedState populated by repos
  const policyResult = await policiesCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:policies:1',
    adapter,
    signal,
    configuration: {
      modules: ['repos', 'policies', 'teams'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
    sharedState: {
      repositories: [
        repoEntity as Extract<typeof repoEntity, { kind: 'repository' }>,
      ],
      repositoryPolicies: repoResult.repositoryPolicies,
    },
  });

  assert.equal(policyResult.execution.status, 'complete');
  assert.equal(policyResult.execution.provenance[0]?.source, 'graphql');
  assert.equal(policyResult.entities.length, 2); // 1 branch protection + 1 ruleset
  assert.ok(
    policyResult.entities.every((e) => e.provenance.source === 'graphql'),
  );

  // 3. Run teams
  const teamResult = await teamsCollector.collect({
    organizationId: 'acme',
    executionId: 'exec:acme:teams:1',
    adapter,
    signal,
    configuration: {
      modules: ['repos', 'policies', 'teams'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
    sharedState: {
      repositories: [
        repoEntity as Extract<typeof repoEntity, { kind: 'repository' }>,
      ],
    },
  });

  assert.equal(teamResult.execution.status, 'complete');
  assert.equal(teamResult.execution.provenance[0]?.source, 'graphql');
  assert.equal(teamResult.entities.length, 1);
  const teamEntity = teamResult.entities[0]!;
  assert.equal(teamEntity.kind, 'team');
  assert.equal(teamEntity.provenance.source, 'graphql');
  assert.equal(teamEntity.membershipCount.value, 8);
  assert.equal(teamEntity.repositoryAccess.length, 1);
  assert.equal(teamEntity.repositoryAccess[0]?.permission, 'admin');
});

test('REST fallback collectors (actions, actions-secrets, security, integrations) tag provenance source = rest and discard secrets', async () => {
  const mockFetch: typeof globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/actions/permissions')) {
      return new Response(JSON.stringify({ enabled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/actions/workflows')) {
      return new Response(
        JSON.stringify({ total_count: 1, workflows: [{ name: 'CI/CD' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/actions/secrets')) {
      return new Response(
        JSON.stringify({
          total_count: 1,
          secrets: [
            {
              name: 'PROD_DB_KEY',
              updated_at: '2026-03-01T00:00:00Z',
              secret_value_should_never_exist: 'FORBIDDEN_VALUE_123',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/code-scanning/default-setup')) {
      return new Response(JSON.stringify({ state: 'configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (urlStr.includes('/vulnerability-alerts')) {
      return new Response(null, { status: 204 });
    }
    if (urlStr.includes('/installations')) {
      return new Response(
        JSON.stringify([
          { id: 555, app_slug: 'deploy-bot', suspended_at: null },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/hooks')) {
      return new Response(
        JSON.stringify([
          {
            id: 888,
            name: 'web',
            active: true,
            config: {
              url: 'https://example.com/webhook?token=LEAKED_TOKEN',
              secret: 'LEAKED_WEBHOOK_SECRET',
            },
          },
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

  const signal = new AbortController().signal;
  const repoEntity = {
    id: 'org:acme:repo:service-a',
    organizationId: 'acme',
    collectorExecutionId: 'exec:acme:repos:1',
    provenance: {
      source: 'graphql' as const,
      operation: 'graphql.org.repositories',
      observedAt: new Date().toISOString(),
      apiVersion: '2026-03-10',
    },
    kind: 'repository' as const,
    name: 'service-a',
    visibility: 'private' as const,
    archived: false,
    defaultBranch: 'main',
    size: {
      value: 1024,
      unit: 'bytes' as const,
      availability: 'observed' as const,
      reason: null,
    },
    fork: false,
  };

  const baseContext = {
    organizationId: 'acme',
    adapter,
    signal,
    configuration: {
      modules: ['actions', 'actions-secrets', 'security', 'integrations'],
      format: 'json' as const,
      includeSensitiveMetadata: false,
      redactionProfile: 'standard' as const,
      continueOnError: false,
    },
    sharedState: {
      repositories: [repoEntity],
    },
  };

  // 1. Actions
  const actionsRes = await actionsCollector.collect({
    ...baseContext,
    executionId: 'exec:acme:actions:1',
  });
  assert.equal(actionsRes.execution.provenance[0]?.source, 'rest');
  assert.equal(actionsRes.entities[0]?.kind, 'actions');
  assert.equal(actionsRes.entities[0]?.provenance.source, 'rest');
  const firstAction = actionsRes.entities[0] as Extract<
    Entity,
    { kind: 'actions' }
  >;
  assert.equal(firstAction.enabled, true);

  // 2. Actions Secrets
  const secretsRes = await actionsSecretsCollector.collect({
    ...baseContext,
    executionId: 'exec:acme:actions-secrets:1',
  });
  assert.equal(secretsRes.execution.provenance[0]?.source, 'rest');
  for (const entity of secretsRes.entities) {
    assert.ok(
      entity.kind === 'actions-secret' ||
        entity.kind === 'configuration-metadata' ||
        entity.kind === 'configuration-coverage',
    );
    assert.equal(entity.provenance.source, 'rest');
    // Ensure absolutely NO forbidden secret payload or values leaked
    assert.equal('secret_value_should_never_exist' in entity, false);
    assert.equal('value' in entity, false);
    assert.equal('encrypted_value' in entity, false);
  }

  // 3. Security
  const securityRes = await securityCollector.collect({
    ...baseContext,
    executionId: 'exec:acme:security:1',
  });
  assert.equal(securityRes.execution.provenance[0]?.source, 'rest');
  assert.equal(securityRes.entities[0]?.kind, 'security');
  assert.equal(securityRes.entities[0]?.provenance.source, 'rest');
  const firstSecurity = securityRes.entities[0] as Extract<
    Entity,
    { kind: 'security' }
  >;
  assert.equal(firstSecurity.codeScanning, 'enabled');
  assert.equal(firstSecurity.dependabot, 'enabled');

  // 4. Integrations
  const intRes = await integrationsCollector.collect({
    ...baseContext,
    executionId: 'exec:acme:integrations:1',
  });
  assert.equal(intRes.execution.provenance[0]?.source, 'rest');
  for (const entity of intRes.entities) {
    assert.equal(entity.kind, 'integration');
    assert.equal(entity.provenance.source, 'rest');
    // Ensure no token or secret leak
    const serialized = JSON.stringify(entity);
    assert.doesNotMatch(serialized, /LEAKED_TOKEN/);
    assert.doesNotMatch(serialized, /LEAKED_WEBHOOK_SECRET/);
  }
});

test('DiscoveryOrchestrator produces bundle satisfying validateBundle with both GraphQL and REST collectors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-mixed-'));
  try {
    const plan = parseDiscoveryOptions([
      '--organization',
      'fictional-north',
      '--modules',
      'all',
      '--output',
      dir,
    ]);

    const now = new Date().toISOString();
    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (urlStr.includes('/graphql')) {
        if (bodyStr.includes('OrgRepositories')) {
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4999, resetAt: now },
                organization: {
                  repositories: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 1,
                    nodes: [
                      {
                        id: 'R_1',
                        name: 'core-repo',
                        visibility: 'PRIVATE',
                        isArchived: false,
                        isFork: false,
                        diskUsage: 512,
                        defaultBranchRef: { name: 'main' },
                        branchProtectionRules: {
                          nodes: [
                            {
                              pattern: 'main',
                              requiresApprovingReviews: true,
                              requiredApprovingReviewCount: 1,
                              requiresStatusChecks: false,
                              requiresStrictStatusChecks: false,
                            },
                          ],
                        },
                        rulesets: {
                          nodes: [
                            {
                              name: 'main-ruleset',
                              enforcement: 'ACTIVE',
                              target: 'branch',
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (bodyStr.includes('OrgTeams')) {
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4998, resetAt: now },
                organization: {
                  teams: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        slug: 'platform-team',
                        name: 'Platform Team',
                        parentTeam: null,
                        members: { totalCount: 3 },
                        repositories: {
                          edges: [
                            {
                              permission: 'ADMIN',
                              node: { name: 'core-repo' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      if (urlStr.includes('/orgs/fictional-north/actions/secrets')) {
        return new Response(
          JSON.stringify([
            {
              name: 'DEPLOY_KEY',
              updated_at: now,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/repos/fictional-north/core-repo/actions/secrets')) {
        return new Response(JSON.stringify([]), {
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
        return new Response(
          JSON.stringify({ total_count: 1, workflows: [{ name: 'build' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/code-scanning/default-setup')) {
        return new Response(JSON.stringify({ state: 'configured' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/vulnerability-alerts')) {
        return new Response(null, { status: 204 });
      }

      if (urlStr.includes('/installations')) {
        return new Response(
          JSON.stringify([
            { id: 101, app_slug: 'test-app', suspended_at: null },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/hooks')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/orgs/fictional-north/members')) {
        return new Response(
          JSON.stringify([{ id: 1, login: 'alice', role: 'admin' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/packages')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/orgs/fictional-north')) {
        return new Response(
          JSON.stringify({
            id: 101,
            login: 'fictional-north',
            name: 'Fictional North Corp',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new HttpGitHubReadAdapter({
      token: 'mock-token',
      fetchImpl: mockFetch,
    });

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'mock-token',
      },
      adapter,
    );

    const controller = new AbortController();
    const result = await orchestrator.run(controller.signal);

    assert.equal(result.exitCode, 0);
    assert.equal(result.bundle.scan.status, 'complete');

    // Validate bundle contract with Zod
    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);

    // Verify GraphQL collectors
    const reposExecution = result.bundle.collectors.find(
      (c) => c.module === 'repos',
    );
    assert.equal(reposExecution?.provenance[0]?.source, 'graphql');
    const policiesExecution = result.bundle.collectors.find(
      (c) => c.module === 'policies',
    );
    assert.equal(policiesExecution?.provenance[0]?.source, 'graphql');
    const teamsExecution = result.bundle.collectors.find(
      (c) => c.module === 'teams',
    );
    assert.equal(teamsExecution?.provenance[0]?.source, 'graphql');

    // Verify REST collectors
    const actionsExecution = result.bundle.collectors.find(
      (c) => c.module === 'actions',
    );
    assert.equal(actionsExecution?.provenance[0]?.source, 'rest');
    const secretsExecution = result.bundle.collectors.find(
      (c) => c.module === 'actions-secrets',
    );
    assert.equal(secretsExecution?.provenance[0]?.source, 'rest');
    const secExecution = result.bundle.collectors.find(
      (c) => c.module === 'security',
    );
    assert.equal(secExecution?.provenance[0]?.source, 'rest');
    const intExecution = result.bundle.collectors.find(
      (c) => c.module === 'integrations',
    );
    assert.equal(intExecution?.provenance[0]?.source, 'rest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Enterprise scope GraphQL enumeration paginates correctly across multiple pages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-ent-page-'));
  try {
    const plan = parseDiscoveryOptions([
      '--enterprise',
      'mega-corp',
      '--modules',
      'orgs',
      '--output',
      dir,
    ]);

    const calls: Array<{ query: string; variables?: Record<string, unknown> }> =
      [];
    const now = new Date().toISOString();

    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (urlStr.includes('/graphql')) {
        const bodyJson = JSON.parse(bodyStr);
        calls.push(bodyJson);

        if (bodyJson.variables?.cursor === 'page-2-cursor') {
          // Page 2
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4998, resetAt: now },
                enterprise: {
                  id: 'ENT_1',
                  name: 'Mega Corp',
                  slug: 'mega-corp',
                  organizations: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 3,
                    nodes: [
                      {
                        id: 'org:org-gamma',
                        login: 'org-gamma',
                        name: 'Gamma Division',
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // Page 1
        return new Response(
          JSON.stringify({
            data: {
              rateLimit: { cost: 1, remaining: 4999, resetAt: now },
              enterprise: {
                id: 'ENT_1',
                name: 'Mega Corp',
                slug: 'mega-corp',
                organizations: {
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'page-2-cursor',
                  },
                  totalCount: 3,
                  nodes: [
                    {
                      id: 'org:org-alpha',
                      login: 'org-alpha',
                      name: 'Alpha Division',
                    },
                    {
                      id: 'org:org-beta',
                      login: 'org-beta',
                      name: 'Beta Division',
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Org Anchor for each org
      for (const org of ['org-alpha', 'org-beta', 'org-gamma']) {
        if (urlStr.includes(`/orgs/${org}`)) {
          return new Response(
            JSON.stringify({
              id: 100,
              login: org,
              name: `${org.toUpperCase()} Org`,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new HttpGitHubReadAdapter({
      token: 'mock-token',
      fetchImpl: mockFetch,
    });

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'mock-token',
      },
      adapter,
    );

    const result = await orchestrator.run(new AbortController().signal);

    assert.equal(result.exitCode, 0);
    assert.equal(result.bundle.scan.status, 'complete');
    assert.equal(result.bundle.scope.kind, 'enterprise');
    if (result.bundle.scope.kind === 'enterprise') {
      assert.equal(result.bundle.scope.slug, 'mega-corp');
      assert.equal(result.bundle.scope.enumeration, 'complete');
      assert.equal(result.bundle.scope.inaccessibleOrganizationCount, null);
    }
    assert.equal(result.bundle.organizations.length, 3);
    assert.deepEqual(
      result.bundle.organizations.map((o) => o.login),
      ['org-alpha', 'org-beta', 'org-gamma'],
    );
    assert.equal(result.bundle.summary.organizationCount, 3);

    // Verify pagination calls
    const graphQLCalls = calls.filter((c) =>
      c.query?.includes('EnterpriseOrganizations'),
    );
    assert.equal(graphQLCalls.length, 2);
    assert.equal(graphQLCalls[0]?.variables?.cursor, null);
    assert.equal(graphQLCalls[1]?.variables?.cursor, 'page-2-cursor');

    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Enterprise multi-org execution orchestrates DAG with strict boundary protection across organizations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-ent-boundary-'));
  try {
    const plan = parseDiscoveryOptions([
      '--enterprise',
      'multi-corp',
      '--modules',
      'orgs,repos,teams,policies',
      '--output',
      dir,
    ]);

    const now = new Date().toISOString();
    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (urlStr.includes('/graphql')) {
        if (bodyStr.includes('EnterpriseOrganizations')) {
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4999, resetAt: now },
                enterprise: {
                  id: 'ENT_1',
                  name: 'Multi Corp',
                  slug: 'multi-corp',
                  organizations: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 2,
                    nodes: [
                      {
                        id: 'org:fictional-north',
                        login: 'fictional-north',
                        name: 'Fictional North',
                      },
                      {
                        id: 'org:fictional-south',
                        login: 'fictional-south',
                        name: 'Fictional South',
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (bodyStr.includes('OrgRepositories')) {
          const isNorth = bodyStr.includes('fictional-north');
          const repoName = isNorth ? 'north-payments' : 'south-billing';
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4990, resetAt: now },
                organization: {
                  repositories: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 1,
                    nodes: [
                      {
                        id: isNorth ? 'R_north' : 'R_south',
                        name: repoName,
                        visibility: 'PRIVATE',
                        isArchived: false,
                        isFork: false,
                        diskUsage: 1024,
                        defaultBranchRef: { name: 'main' },
                        branchProtectionRules: {
                          nodes: [
                            {
                              pattern: 'main',
                              requiresApprovingReviews: true,
                              requiredApprovingReviewCount: 1,
                              requiresStatusChecks: false,
                              requiresStrictStatusChecks: false,
                            },
                          ],
                        },
                        rulesets: { nodes: [] },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (bodyStr.includes('OrgTeams')) {
          const isNorth = bodyStr.includes('fictional-north');
          const teamSlug = isNorth ? 'north-engineers' : 'south-engineers';
          const repoName = isNorth ? 'north-payments' : 'south-billing';
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4980, resetAt: now },
                organization: {
                  teams: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        slug: teamSlug,
                        name: teamSlug.toUpperCase(),
                        parentTeam: null,
                        members: { totalCount: 4 },
                        repositories: {
                          edges: [
                            {
                              permission: 'ADMIN',
                              node: { name: repoName },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      if (urlStr.includes('/orgs/fictional-north')) {
        return new Response(
          JSON.stringify({
            id: 1,
            login: 'fictional-north',
            name: 'Fictional North',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (urlStr.includes('/orgs/fictional-south')) {
        return new Response(
          JSON.stringify({
            id: 2,
            login: 'fictional-south',
            name: 'Fictional South',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new HttpGitHubReadAdapter({
      token: 'mock-token',
      fetchImpl: mockFetch,
    });

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'mock-token',
      },
      adapter,
    );

    const result = await orchestrator.run(new AbortController().signal);

    assert.equal(result.exitCode, 0);
    assert.equal(result.bundle.scan.status, 'complete');
    assert.equal(result.bundle.organizations.length, 2);
    assert.equal(result.bundle.summary.organizationCount, 2);
    assert.equal(result.bundle.summary.repositoryCount, 2);

    // Verify boundary isolation:
    // fictional-north entities must only reference fictional-north
    const northEntities = result.bundle.entities.filter(
      (e) => e.organizationId === 'fictional-north',
    );
    for (const e of northEntities) {
      if ('repositoryId' in e && e.repositoryId) {
        assert.ok(
          e.repositoryId.includes('fictional-north'),
          `Entity ${e.id} repositoryId leaked cross-org`,
        );
      }
      if (e.kind === 'team') {
        for (const a of e.repositoryAccess) {
          assert.ok(
            a.repositoryId.includes('fictional-north'),
            `Team ${e.id} repositoryAccess leaked cross-org`,
          );
        }
      }
    }

    // fictional-south entities must only reference fictional-south
    const southEntities = result.bundle.entities.filter(
      (e) => e.organizationId === 'fictional-south',
    );
    for (const e of southEntities) {
      if ('repositoryId' in e && e.repositoryId) {
        assert.ok(
          e.repositoryId.includes('fictional-south'),
          `Entity ${e.id} repositoryId leaked cross-org`,
        );
      }
      if (e.kind === 'team') {
        for (const a of e.repositoryAccess) {
          assert.ok(
            a.repositoryId.includes('fictional-south'),
            `Team ${e.id} repositoryAccess leaked cross-org`,
          );
        }
      }
    }

    // Strict validation against @ghec/contracts schema & relational boundaries
    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Enterprise scope tracks partial enumeration when organizations are inaccessible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-ent-partial-'));
  try {
    const plan = parseDiscoveryOptions([
      '--enterprise',
      'partially-accessible-corp',
      '--modules',
      'orgs,repos',
      '--output',
      dir,
    ]);

    const now = new Date().toISOString();
    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (urlStr.includes('/graphql')) {
        if (bodyStr.includes('EnterpriseOrganizations')) {
          // totalCount is 3, but only 2 nodes returned (1 was omitted at GraphQL level)
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4999, resetAt: now },
                enterprise: {
                  id: 'ENT_PARTIAL',
                  name: 'Partially Accessible Corp',
                  slug: 'partially-accessible-corp',
                  organizations: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 3,
                    nodes: [
                      {
                        id: 'org:org-accessible',
                        login: 'org-accessible',
                        name: 'Accessible Org',
                      },
                      {
                        id: 'org:org-forbidden',
                        login: 'org-forbidden',
                        name: 'Forbidden Org',
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (bodyStr.includes('OrgRepositories')) {
          return new Response(
            JSON.stringify({
              data: {
                rateLimit: { cost: 1, remaining: 4990, resetAt: now },
                organization: {
                  repositories: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 1,
                    nodes: [
                      {
                        id: 'R_acc',
                        name: 'accessible-repo',
                        visibility: 'PRIVATE',
                        isArchived: false,
                        isFork: false,
                        diskUsage: 512,
                        defaultBranchRef: { name: 'main' },
                        branchProtectionRules: { nodes: [] },
                        rulesets: { nodes: [] },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      if (urlStr.includes('/orgs/org-accessible')) {
        return new Response(
          JSON.stringify({
            id: 101,
            login: 'org-accessible',
            name: 'Accessible Org',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // org-forbidden returns 403 Forbidden (e.g. SAML SSO authorization required or forbidden)
      if (urlStr.includes('/orgs/org-forbidden')) {
        return new Response(
          JSON.stringify({
            message: 'Resource not accessible by integration (SAML required)',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new HttpGitHubReadAdapter({
      token: 'mock-token',
      fetchImpl: mockFetch,
    });

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'mock-token',
      },
      adapter,
    );

    const result = await orchestrator.run(new AbortController().signal);

    // Inaccessible orgs must yield exitCode 4 and status 'partial'
    assert.equal(result.exitCode, 4);
    assert.equal(result.bundle.scan.status, 'partial');
    assert.equal(result.bundle.scope.kind, 'enterprise');
    if (result.bundle.scope.kind === 'enterprise') {
      assert.equal(result.bundle.scope.enumeration, 'partial');
      // 1 omitted from GraphQL nodes + 1 forbidden by HTTP 403 = 2 inaccessible
      assert.equal(result.bundle.scope.inaccessibleOrganizationCount, 2);
    }

    // Only the accessible org is included in organizations
    assert.equal(result.bundle.organizations.length, 1);
    assert.equal(result.bundle.organizations[0]?.login, 'org-accessible');

    // Limitations must mention the inaccessible organizations
    assert.ok(
      result.bundle.limitations.some((l) =>
        l.includes('Enterprise enumeration is partial'),
      ),
    );
    assert.ok(
      result.bundle.limitations.some((l) => l.includes('org-forbidden')),
    );

    // Summary must match actual collected data
    assert.equal(result.bundle.summary.organizationCount, 1);
    assert.equal(result.bundle.summary.repositoryCount, 1);

    // Validate bundle contract with Zod
    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Enterprise multi-org execution respects concurrency bounds (max 2 concurrent orgs)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghec-orch-ent-concurrency-'));
  try {
    const plan = parseDiscoveryOptions([
      '--enterprise',
      'concurrency-test-corp',
      '--modules',
      'orgs',
      '--output',
      dir,
    ]);

    let activeConcurrentOrgs = 0;
    let maxConcurrentOrgsSeen = 0;

    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (
        urlStr.includes('/graphql') &&
        bodyStr.includes('EnterpriseOrganizations')
      ) {
        return new Response(
          JSON.stringify({
            data: {
              rateLimit: {
                cost: 1,
                remaining: 4999,
                resetAt: new Date().toISOString(),
              },
              enterprise: {
                id: 'ENT_CONC',
                name: 'Concurrency Test Corp',
                slug: 'concurrency-test-corp',
                organizations: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  totalCount: 4,
                  nodes: [
                    { id: 'org:org-1', login: 'org-1', name: 'Org 1' },
                    { id: 'org:org-2', login: 'org-2', name: 'Org 2' },
                    { id: 'org:org-3', login: 'org-3', name: 'Org 3' },
                    { id: 'org:org-4', login: 'org-4', name: 'Org 4' },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/orgs/org-')) {
        activeConcurrentOrgs++;
        if (activeConcurrentOrgs > maxConcurrentOrgsSeen) {
          maxConcurrentOrgsSeen = activeConcurrentOrgs;
        }
        // Small delay to test overlap
        await new Promise((resolve) => setTimeout(resolve, 30));
        activeConcurrentOrgs--;

        return new Response(
          JSON.stringify({ id: 1, login: 'org', name: 'Org' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new HttpGitHubReadAdapter({
      token: 'mock-token',
      fetchImpl: mockFetch,
    });

    const orchestrator = new DiscoveryOrchestrator(
      plan,
      {
        baseUrl: 'https://api.github.com',
        apiVersion: '2026-03-10',
        token: 'mock-token',
      },
      adapter,
    );

    const result = await orchestrator.run(new AbortController().signal);

    assert.equal(result.exitCode, 0);
    assert.equal(result.bundle.organizations.length, 4);
    // Bounded concurrency verification: maximum 2 concurrent organizations
    assert.ok(
      maxConcurrentOrgsSeen <= 2,
      `Observed concurrent orgs ${maxConcurrentOrgsSeen} exceeded limit of 2`,
    );

    const validation = validateBundle(result.bundle);
    assert.ok(validation.success, validation.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
