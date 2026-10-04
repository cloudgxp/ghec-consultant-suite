import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateBundle } from '@ghec/contracts';
import {
  OrgMetadataAggregator,
  RepositoryDeepDiscoveryAggregator,
  TeamHierarchyAndAccessAggregator,
} from '../src/collectors/aggregators/index.js';
import { HttpGitHubReadAdapter } from '../src/github/http.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';

test('OrgMetadataAggregator extracts organization profile', async () => {
  const mockFetch: typeof globalThis.fetch = async (_url, init) => {
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
              id: 'O_123',
              login: 'octocorp',
              name: 'Octo Corporation',
              description: 'Enterprise Cloud Organization',
              websiteUrl: 'https://octocorp.example.com',
              isVerified: true,
              requiresTwoFactorAuthentication: true,
              defaultRepositoryPermission: 'READ',
              membersWithRole: { totalCount: 150 },
              pendingMembers: { totalCount: 5 },
              securityManagers: {
                nodes: [
                  { slug: 'appsec-team', name: 'Application Security' },
                  { slug: 'soc-team', name: 'Security Operations' },
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

  const aggregator = new OrgMetadataAggregator();
  const result = await aggregator.collect({
    organizationId: 'octocorp',
    executionId: 'exec:octocorp:orgs:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['orgs'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
  });

  assert.equal(result.organizations.length, 1);
  assert.equal(result.organizations[0]?.login, 'octocorp');
  assert.equal(result.organizations[0]?.displayName, 'Octo Corporation');

  assert.equal(result.execution.status, 'complete');
  assert.equal(result.execution.provenance[0]?.source, 'graphql');
  assert.equal(
    result.execution.provenance[0]?.operation,
    'graphql.org.metadata-deep',
  );

  assert.equal(result.entities.length, 0);
});

test('RepositoryDeepDiscoveryAggregator paginates and extracts repositories, policies, and assets', async () => {
  let callCount = 0;
  const mockFetch: typeof globalThis.fetch = async (_url, init) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    if (bodyStr.includes('OrgRepositoriesDeep')) {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            data: {
              rateLimit: {
                cost: 2,
                remaining: 4998,
                resetAt: '2026-03-10T12:00:00Z',
              },
              organization: {
                repositories: {
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-page-2' },
                  totalCount: 2,
                  nodes: [
                    {
                      id: 'R_1',
                      name: 'payment-service',
                      visibility: 'PRIVATE',
                      isArchived: false,
                      isFork: false,
                      diskUsage: 4096,
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
                            name: 'block-force-push',
                            enforcement: 'ACTIVE',
                            target: 'branch',
                          },
                        ],
                      },
                      releases: {
                        nodes: [
                          {
                            name: 'v1.0.0',
                            releaseAssets: {
                              nodes: [
                                {
                                  name: 'binary.tar.gz',
                                  size: 1048576,
                                  downloadCount: 42,
                                },
                              ],
                            },
                          },
                        ],
                      },
                      packages: {
                        nodes: [{ name: 'payment-lib', packageType: 'NPM' }],
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } else {
        return new Response(
          JSON.stringify({
            data: {
              rateLimit: {
                cost: 1,
                remaining: 4997,
                resetAt: '2026-03-10T12:00:00Z',
              },
              organization: {
                repositories: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  totalCount: 2,
                  nodes: [
                    {
                      id: 'R_2',
                      name: 'auth-service',
                      visibility: 'INTERNAL',
                      isArchived: true,
                      isFork: false,
                      diskUsage: 1024,
                      defaultBranchRef: { name: 'master' },
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

  const aggregator = new RepositoryDeepDiscoveryAggregator();
  const result = await aggregator.collect({
    organizationId: 'octocorp',
    executionId: 'exec:octocorp:repos:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['repos', 'policies', 'packages'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
  });

  assert.equal(callCount, 2, 'Must have made exactly 2 paginated calls');

  // Verify repositories
  const repoEntities = result.entities.filter((e) => e.kind === 'repository');
  assert.equal(repoEntities.length, 2);
  assert.equal(repoEntities[0]?.name, 'payment-service');
  assert.equal(repoEntities[0]?.visibility, 'private');
  assert.equal(repoEntities[1]?.name, 'auth-service');
  assert.equal(repoEntities[1]?.visibility, 'internal');
  assert.equal(repoEntities[1]?.archived, true);

  // Verify policies
  const policyEntities = result.entities.filter((e) => e.kind === 'policy');
  assert.equal(policyEntities.length, 2);
  const bpPolicy = policyEntities.find(
    (p) => p.kind === 'policy' && p.policyKind === 'branch_protection',
  );
  assert.ok(bpPolicy);
  assert.equal(bpPolicy?.name, 'main');

  const rsPolicy = policyEntities.find(
    (p) => p.kind === 'policy' && p.policyKind === 'ruleset',
  );
  assert.ok(rsPolicy);
  assert.equal(rsPolicy?.name, 'block-force-push');

  // Verify assets
  const assetEntities = result.entities.filter((e) => e.kind === 'asset');
  assert.equal(assetEntities.length, 2); // 1 release asset + 1 package
  const releaseAsset = assetEntities.find(
    (a) => a.kind === 'asset' && a.assetKind === 'release',
  );
  assert.ok(releaseAsset);
  assert.equal(releaseAsset?.name, 'binary.tar.gz');

  // Verify executions
  assert.equal(result.executions.length, 3);
  const reposExec = result.executions.find((e) => e.module === 'repos');
  assert.equal(reposExec?.status, 'complete');
  assert.equal(reposExec?.coverage.observed, 2);

  const policiesExec = result.executions.find((e) => e.module === 'policies');
  assert.equal(policiesExec?.status, 'complete');
  assert.equal(policiesExec?.coverage.observed, 2);

  const packagesExec = result.executions.find((e) => e.module === 'packages');
  assert.equal(packagesExec?.status, 'complete');
  assert.equal(packagesExec?.coverage.observed, 2);
});

test('TeamHierarchyAndAccessAggregator extracts hierarchy, membership, and repository permissions', async () => {
  const mockFetch: typeof globalThis.fetch = async (_url, init) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    if (bodyStr.includes('OrgTeamsDeep')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4996,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              teams: {
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
                nodes: [
                  {
                    id: 'T_1',
                    slug: 'engineering',
                    name: 'Engineering',
                    description: 'All engineers',
                    members: { totalCount: 45 },
                    childTeams: {
                      nodes: [
                        {
                          id: 'T_2',
                          slug: 'backend',
                          name: 'Backend Engineering',
                          members: { totalCount: 20 },
                        },
                      ],
                    },
                    repositories: {
                      edges: [
                        {
                          permission: 'ADMIN',
                          node: { id: 'R_1', name: 'payment-service' },
                        },
                        {
                          permission: 'READ',
                          node: { id: 'R_2', name: 'auth-service' },
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

  const aggregator = new TeamHierarchyAndAccessAggregator();
  const result = await aggregator.collect({
    organizationId: 'octocorp',
    executionId: 'exec:octocorp:teams:1',
    adapter,
    signal: new AbortController().signal,
    configuration: {
      modules: ['teams'],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: false,
    },
  });

  assert.equal(result.entities.length, 2);

  const rootTeam = result.entities.find(
    (t) => t.kind === 'team' && t.name === 'engineering',
  );
  assert.ok(rootTeam && rootTeam.kind === 'team');
  assert.equal(rootTeam.parentTeamId, null);
  assert.equal(rootTeam.membershipCount.value, 45);
  assert.equal(rootTeam.repositoryAccess.length, 2);
  assert.equal(rootTeam.repositoryAccess[0]?.permission, 'admin');
  assert.equal(rootTeam.repositoryAccess[1]?.permission, 'read');

  const childTeam = result.entities.find(
    (t) => t.kind === 'team' && t.name === 'backend',
  );
  assert.ok(childTeam && childTeam.kind === 'team');
  assert.equal(childTeam.parentTeamId, 'org:octocorp:team:engineering');
  assert.equal(childTeam.membershipCount.value, 20);

  assert.equal(result.execution.status, 'complete');
  assert.equal(result.execution.coverage.observed, 2);
});

test('DiscoveryOrchestrator seamlessly orchestrates discovery using GraphQL aggregators', async () => {
  const mockFetch: typeof globalThis.fetch = async (_url, init) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    if (bodyStr.includes('PreflightProbe')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              limit: 5000,
              cost: 1,
              remaining: 4999,
              resetAt: '2026-03-10T12:00:00Z',
            },
            viewer: { login: 'consultant-operator' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (bodyStr.includes('ProbeOrg')) {
      return new Response(
        JSON.stringify({
          data: {
            organization: {
              name: 'Octo Corp',
              repositories: { totalCount: 1 },
              teams: { totalCount: 1 },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (bodyStr.includes('OrgDeepMetadata')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4995,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              id: 'O_1',
              login: 'octocorp',
              name: 'Octo Corporation',
              securityManagers: {
                nodes: [{ slug: 'appsec', name: 'AppSec' }],
              },
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
              remaining: 4994,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              repositories: {
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
                nodes: [
                  {
                    id: 'R_1',
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
                          requiredApprovingReviewCount: 1,
                          requiresStatusChecks: true,
                          requiresStrictStatusChecks: true,
                        },
                      ],
                    },
                    rulesets: {
                      nodes: [
                        {
                          name: 'prod-rules',
                          enforcement: 'ACTIVE',
                          target: 'branch',
                        },
                      ],
                    },
                    releases: {
                      nodes: [
                        {
                          name: 'v1.0',
                          releaseAssets: {
                            nodes: [
                              {
                                name: 'dist.zip',
                                size: 1024,
                                downloadCount: 10,
                              },
                            ],
                          },
                        },
                      ],
                    },
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

    if (bodyStr.includes('OrgTeamsDeep')) {
      return new Response(
        JSON.stringify({
          data: {
            rateLimit: {
              cost: 1,
              remaining: 4993,
              resetAt: '2026-03-10T12:00:00Z',
            },
            organization: {
              teams: {
                pageInfo: { hasNextPage: false, endCursor: null },
                totalCount: 1,
                nodes: [
                  {
                    slug: 'core-team',
                    name: 'Core Team',
                    members: { totalCount: 10 },
                    childTeams: { nodes: [] },
                    repositories: {
                      edges: [
                        {
                          permission: 'ADMIN',
                          node: { id: 'R_1', name: 'payments-api' },
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

  const tempDir = mkdtempSync(join(tmpdir(), 'ghec-aggregators-test-'));

  try {
    const orchestrator = new DiscoveryOrchestrator(
      {
        scope: { kind: 'organization', name: 'octocorp' },
        modules: ['orgs', 'repos', 'policies', 'teams', 'packages'],
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

    const bundleValidation = validateBundle(result.bundle);
    assert.ok(
      bundleValidation.success,
      `Bundle must validate against schema: ${bundleValidation.message}`,
    );

    assert.equal(result.bundle.organizations.length, 1);
    assert.equal(result.bundle.organizations[0]?.login, 'octocorp');

    // Check provenances all state graphql
    const repoEntity = result.bundle.entities.find(
      (e) => e.kind === 'repository',
    );
    assert.ok(repoEntity);
    assert.equal(repoEntity?.provenance.source, 'graphql');

    const teamEntity = result.bundle.entities.find((e) => e.kind === 'team');
    assert.ok(teamEntity);
    assert.equal(teamEntity?.provenance.source, 'graphql');

    const policyEntity = result.bundle.entities.find(
      (e) => e.kind === 'policy',
    );
    assert.ok(policyEntity);
    assert.equal(policyEntity?.provenance.source, 'graphql');

    const assetEntity = result.bundle.entities.find((e) => e.kind === 'asset');
    assert.ok(assetEntity);
    assert.equal(assetEntity?.provenance.source, 'graphql');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
