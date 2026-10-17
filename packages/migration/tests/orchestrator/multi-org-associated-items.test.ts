import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGRATION_SCHEMA_VERSION,
  validateMigrationPlan,
  validateMigrationScope,
  type MigrationScope,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  ActionsRunnersMigrationModule,
  CustomRolesMigrationModule,
  GLOBAL_SINGLETON_ORGANIZATION_MODULES,
  MigrationPlanner,
  OrgCustomPropertiesMigrationModule,
  OrgRulesetsMigrationModule,
  OrgSecretsMigrationModule,
  OrgVariablesMigrationModule,
  PackagesMigrationModule,
  TeamsMigrationModule,
  buildOrganizationScopeTarget,
  createDefaultModuleRegistry,
  type MigrationContext,
} from '../../src/index.js';

function createSilentLogger(): MigrationContext['logger'] {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createMockReadClient(
  handlers: {
    readSingle?: (req: {
      id: string;
      path?: string;
      pathParams?: Record<string, unknown>;
    }) => unknown;
    fetchAll?: (req: {
      id: string;
      path?: string;
      pathParams?: Record<string, unknown>;
    }) => readonly unknown[];
  } = {},
): GitHubReadAdapter {
  return {
    readSingle: async <T>(req: {
      id: string;
      path?: string;
      pathParams?: Record<string, unknown>;
    }) => ({
      data: (handlers.readSingle ? handlers.readSingle(req) : {}) as T,
      status: 200,
      headers: {},
    }),
    fetchAll: async <T>(req: {
      id: string;
      path?: string;
      pathParams?: Record<string, unknown>;
    }) => ({
      items: (handlers.fetchAll ? handlers.fetchAll(req) : []) as T[],
      totalRequests: 1,
    }),
    queryGraphQL: async <T>() => ({
      data: {} as T,
      status: 200,
      headers: {},
    }),
  } as unknown as GitHubReadAdapter;
}

describe('Associated-Only Organization Items & Multi-Org (N -> 1) Consolidation', () => {
  const multiOrgPublicScope: MigrationScope = {
    version: MIGRATION_SCHEMA_VERSION,
    name: 'multi-org-to-acme-open-source-public',
    targetType: 'ghec',
    orgItemsMode: 'associated-only',
    organizations: [
      {
        source: 'acme-alpha',
        target: 'acme-open-source',
        targetType: 'ghec',
        orgItemsMode: 'associated-only',
        modules: ['auto'],
      },
      {
        source: 'acme-beta',
        target: 'acme-open-source',
        targetType: 'ghec',
        orgItemsMode: 'associated-only',
        modules: ['auto'],
      },
    ],
    repositories: [
      {
        sourceOrg: 'acme-alpha',
        sourceRepo: 'pub-web',
        targetOrg: 'acme-open-source',
        targetRepo: 'acme-alpha-pub-web',
        targetRepoVisibility: 'public',
        useGei: true,
        skipReleases: false,
        lfsStrategy: 'dual-remote-stream',
        modules: ['gei-repo'],
      },
      {
        sourceOrg: 'acme-beta',
        sourceRepo: 'beta-cli',
        targetOrg: 'acme-open-source',
        targetRepo: 'beta-cli',
        targetRepoVisibility: 'public',
        useGei: true,
        skipReleases: false,
        lfsStrategy: 'dual-remote-stream',
        modules: ['gei-repo'],
      },
    ],
    identityMapping: {
      strategy: 'pass-through',
    },
  };

  it('validates N -> 1 organization consolidation in MigrationScopeSchema and builds scoped context', () => {
    const validated = validateMigrationScope(multiOrgPublicScope);
    assert.equal(validated.success, true);

    const alphaTarget = buildOrganizationScopeTarget(
      multiOrgPublicScope,
      multiOrgPublicScope.organizations[0]!,
    );
    assert.equal(alphaTarget.orgItemsMode, 'associated-only');
    assert.equal(alphaTarget.isMultiOrgConsolidation, true);
    assert.deepEqual(alphaTarget.scopedRepositories, [
      {
        sourceOrg: 'acme-alpha',
        sourceRepo: 'pub-web',
        targetOrg: 'acme-open-source',
        targetRepo: 'acme-alpha-pub-web',
        targetRepoVisibility: 'public',
      },
    ]);
  });

  it('filters teams to in-scope repositories, preserves parent teams, maps renamed repos, and skips global base permission', async () => {
    const alphaScope = buildOrganizationScopeTarget(
      multiOrgPublicScope,
      multiOrgPublicScope.organizations[0]!,
    );
    const ctx: MigrationContext = {
      scope: alphaScope,
      sourceClient: createMockReadClient(),
      targetClient: createMockReadClient({
        fetchAll: () => [],
      }),
      dryRun: true,
      signal: new AbortController().signal,
      logger: createSilentLogger(),
    };

    const teamsModule = new TeamsMigrationModule();
    const plan = await teamsModule.plan(ctx, {
      defaultRepositoryPermission: 'write',
      teams: [
        {
          id: 1,
          name: 'Engineering Parent',
          slug: 'engineering-parent',
          privacy: 'closed',
          parentSlug: null,
          members: [{ login: 'alice', role: 'maintainer' }],
          repositoryAccess: [
            { repositoryName: 'private-monolith', permission: 'admin' },
          ],
        },
        {
          id: 2,
          name: 'Public Web Maintainers',
          slug: 'public-web-maintainers',
          privacy: 'closed',
          parentSlug: 'engineering-parent',
          members: [{ login: 'bob', role: 'member' }],
          repositoryAccess: [
            { repositoryName: 'pub-web', permission: 'maintain' },
            { repositoryName: 'private-monolith', permission: 'push' },
          ],
        },
        {
          id: 3,
          name: 'Internal Ops Only',
          slug: 'internal-ops-only',
          privacy: 'closed',
          parentSlug: null,
          members: [{ login: 'charlie', role: 'member' }],
          repositoryAccess: [
            { repositoryName: 'private-monolith', permission: 'pull' },
          ],
        },
      ],
    });

    // Global org base permission operation must be skipped
    assert.equal(
      plan.operations.some((op) => op.id === 'op-org-base-permission'),
      false,
    );

    // Unassociated team 'internal-ops-only' must be excluded
    assert.equal(
      plan.operations.some((op) =>
        op.resourceName.includes('internal-ops-only'),
      ),
      false,
    );

    // Ancestor 'engineering-parent' is preserved (with out-of-scope repo access stripped)
    // and 'public-web-maintainers' is included with only in-scope 'pub-web' mapped to 'acme-alpha-pub-web'
    assert.equal(
      plan.operations.some(
        (op) =>
          op.resourceType === 'team' &&
          op.resourceName === 'engineering-parent',
      ),
      true,
    );
    assert.equal(
      plan.operations.some(
        (op) =>
          op.resourceType === 'team' &&
          op.resourceName === 'public-web-maintainers',
      ),
      true,
    );
    const repoBindings = plan.operations.filter(
      (op) => op.resourceType === 'team-repo-permission',
    );
    assert.equal(repoBindings.length, 1);
    assert.equal(
      repoBindings[0]?.resourceName,
      'public-web-maintainers:acme-alpha-pub-web',
    );
  });

  it('filters org-variables and org-secrets in associated-only mode and converts all-visibility to selected', async () => {
    const alphaScope = buildOrganizationScopeTarget(
      multiOrgPublicScope,
      multiOrgPublicScope.organizations[0]!,
    );
    const mockReposHandler = (req: {
      pathParams?: Record<string, unknown>;
    }) => {
      if (req.pathParams?.org === 'acme-alpha') {
        return [
          { id: 101, name: 'pub-web' },
          { id: 102, name: 'private-monolith' },
        ];
      }
      return [
        { id: 501, name: 'acme-alpha-pub-web' },
        { id: 601, name: 'beta-cli' },
      ];
    };

    const ctx: MigrationContext = {
      scope: alphaScope,
      sourceClient: createMockReadClient({ fetchAll: mockReposHandler }),
      targetClient: createMockReadClient({
        fetchAll: (req) => {
          if (req.id === 'rest.repos.listForOrg') {
            return mockReposHandler(req);
          }
          return [];
        },
        readSingle: (req) => {
          if (req.id === 'rest.actions.listOrgVariables') {
            return {
              variables: [
                {
                  name: 'SHARED_CI_ENV',
                  value: 'prod',
                  visibility: 'selected',
                },
              ],
            };
          }
          if (req.id === 'rest.actions.listSelectedOrgVariableRepositories') {
            return { repositories: [{ id: 601 }] };
          }
          return {};
        },
      }),
      dryRun: true,
      signal: new AbortController().signal,
      logger: createSilentLogger(),
    };

    const varsModule = new OrgVariablesMigrationModule();
    const varsPlan = await varsModule.plan(ctx, {
      organization: 'acme-alpha',
      variables: [
        // 1. Private-only variable -> skipped because all in-scope repos are public
        {
          name: 'PRIVATE_DB_HOST',
          value: 'db.internal',
          visibility: 'private',
          selectedRepositoryIds: [],
        },
        // 2. Selected variable for out-of-scope repo (102) -> skipped
        {
          name: 'MONOLITH_ONLY_VAR',
          value: '1',
          visibility: 'selected',
          selectedRepositoryIds: ['102'],
        },
        // 3. 'all' visibility variable -> converted to 'selected' for acme-alpha's in-scope repo (501) and merged additively with target's existing [601] -> [501, 601]
        {
          name: 'SHARED_CI_ENV',
          value: 'prod',
          visibility: 'all',
          selectedRepositoryIds: [],
        },
      ],
    });

    assert.equal(varsPlan.operations.length, 1);
    assert.equal(varsPlan.operations[0]?.resourceName, 'SHARED_CI_ENV');
    assert.deepEqual(varsPlan.operations[0]?.payload, {
      name: 'SHARED_CI_ENV',
      value: 'prod',
      visibility: 'selected',
      selected_repository_ids: [501, 601],
    });

    const secretsModule = new OrgSecretsMigrationModule();
    const secretsPlan = await secretsModule.plan(ctx, {
      organization: 'acme-alpha',
      secrets: [
        {
          domain: 'actions',
          name: 'PRIVATE_SIGNING_KEY',
          visibility: 'private',
          selectedRepositoryIds: [],
        },
        {
          domain: 'actions',
          name: 'NPM_PUBLISH_TOKEN',
          visibility: 'all',
          selectedRepositoryIds: [],
        },
      ],
    });

    assert.equal(secretsPlan.operations.length, 1);
    assert.equal(secretsPlan.operations[0]?.resourceName, 'NPM_PUBLISH_TOKEN');
    assert.deepEqual(secretsPlan.operations[0]?.payload, {
      domain: 'actions',
      visibility: 'selected',
      selected_repository_ids: [501],
      valuePopulation: 'vault-or-blank',
    });
  });

  it('filters org-rulesets, actions-runners, org-custom-properties, custom-roles, and packages in associated-only mode', async () => {
    const alphaScope = buildOrganizationScopeTarget(
      multiOrgPublicScope,
      multiOrgPublicScope.organizations[0]!,
    );
    const ctx: MigrationContext = {
      scope: alphaScope,
      sourceClient: createMockReadClient(),
      targetClient: createMockReadClient({
        readSingle: (req) => {
          if (req.id === 'rest.orgs.listCustomPropertySchemas') {
            return [
              {
                property_name: 'team_owner',
                value_type: 'single_select',
                required: false,
                allowed_values: ['beta-team'],
              },
            ];
          }
          return {};
        },
        fetchAll: () => [],
      }),
      dryRun: true,
      signal: new AbortController().signal,
      logger: createSilentLogger(),
    };

    // 1. Org Rulesets: rewrites ~ALL to ['acme-alpha-pub-web'] and skips rulesets targeting only private-* patterns
    const rulesetsModule = new OrgRulesetsMigrationModule();
    const rulesetsPlan = await rulesetsModule.plan(ctx, {
      rulesets: [
        {
          id: 1,
          name: 'Main Branch Protection',
          target: 'branch',
          enforcement: 'active',
          conditions: {
            repository_name: {
              include: ['~ALL'],
              exclude: [],
            },
          },
          rules: [{ type: 'deletion' }],
        },
        {
          id: 2,
          name: 'Private Monolith Rules',
          target: 'branch',
          enforcement: 'active',
          conditions: {
            repository_name: {
              include: ['private-*'],
              exclude: [],
            },
          },
          rules: [{ type: 'deletion' }],
        },
      ],
    });

    assert.equal(rulesetsPlan.operations.length, 1);
    assert.equal(
      rulesetsPlan.operations[0]?.resourceName,
      'Main Branch Protection',
    );
    const rulesetPayload = rulesetsPlan.operations[0]?.payload as {
      conditions?: { repository_name?: { include?: string[] } };
    };
    assert.deepEqual(rulesetPayload.conditions?.repository_name?.include, [
      'acme-alpha-pub-web',
    ]);

    // 2. Actions Runners: skips default group and private-only runner groups when target scope is public-only
    const runnersModule = new ActionsRunnersMigrationModule();
    const runnersPlan = await runnersModule.plan(ctx, {
      organization: 'acme-alpha',
      runner_groups: [
        {
          id: 1,
          name: 'Default',
          visibility: 'all',
          default: true,
          allows_public_repositories: true,
          restricted_to_workflows: false,
          selected_workflows: [],
        },
        {
          id: 2,
          name: 'Private Runners',
          visibility: 'all',
          default: false,
          allows_public_repositories: false,
          restricted_to_workflows: false,
          selected_workflows: [],
        },
        {
          id: 3,
          name: 'OSS Public Builders',
          visibility: 'selected',
          default: false,
          allows_public_repositories: true,
          restricted_to_workflows: true,
          selected_workflows: [
            'acme-alpha/pub-web/.github/workflows/ci.yml@refs/heads/main',
            'acme-alpha/private-monolith/.github/workflows/ci.yml@refs/heads/main',
          ],
        },
      ],
    });

    assert.equal(runnersPlan.operations.length, 1);
    assert.equal(
      runnersPlan.operations[0]?.resourceName,
      'OSS Public Builders',
    );
    assert.deepEqual(
      (runnersPlan.operations[0]?.payload as { selected_workflows?: string[] })
        .selected_workflows,
      [
        'acme-open-source/acme-alpha-pub-web/.github/workflows/ci.yml@refs/heads/main',
      ],
    );

    // 3. Org Custom Properties: merges allowedValues additively with existing target values
    const propsModule = new OrgCustomPropertiesMigrationModule();
    const propsPlan = await propsModule.plan(ctx, {
      organization: 'acme-alpha',
      definitions: [
        {
          propertyName: 'team_owner',
          valueType: 'single_select',
          required: false,
          allowedValues: ['alpha-team'],
        },
      ],
    });
    assert.deepEqual(
      (propsPlan.operations[0]?.payload as { allowed_values?: string[] })
        .allowed_values,
      ['beta-team', 'alpha-team'],
    );

    // 4. Custom Roles: keeps repositoryRoles and skips global organizationRoles
    const rolesModule = new CustomRolesMigrationModule();
    const rolesPlan = await rolesModule.plan(ctx, {
      organization: 'acme-alpha',
      repositoryRoles: [
        {
          id: 1,
          name: 'release-engineer',
          baseRole: 'write',
          permissions: ['create_tag'],
        },
      ],
      organizationRoles: [
        {
          id: 2,
          name: 'org-billing-auditor',
          permissions: ['read_organization_actions_usage_metrics'],
        },
      ],
    });
    assert.equal(rolesPlan.operations.length, 1);
    assert.equal(rolesPlan.operations[0]?.resourceName, 'release-engineer');

    // 5. Packages: filters packages to only those linked to in-scope repositories
    const pkgsModule = new PackagesMigrationModule();
    const pkgsPlan = await pkgsModule.plan(ctx, {
      org: 'acme-alpha',
      packages: [
        {
          id: 1,
          name: 'pub-web-image',
          packageType: 'container',
          visibility: 'public',
          repositoryName: 'pub-web',
          versions: [{ id: 1, name: '1.0.0', tags: ['1.0.0'] }],
        },
        {
          id: 2,
          name: 'private-monolith-image',
          packageType: 'container',
          visibility: 'private',
          repositoryName: 'private-monolith',
          versions: [{ id: 1, name: '1.0.0', tags: ['1.0.0'] }],
        },
      ],
    });
    assert.equal(pkgsPlan.operations.length, 1);
    assert.equal(pkgsPlan.operations[0]?.resourceName, 'pub-web-image@1.0.0');
  });

  it('generates a schema-valid multi-org MigrationPlan excluding global singletons and disambiguating sourceIdentifier', async () => {
    const registry = createDefaultModuleRegistry();
    const planner = new MigrationPlanner({
      registry,
      scope: multiOrgPublicScope,
      sourceClient: createMockReadClient(),
      targetClient: createMockReadClient(),
      logger: createSilentLogger(),
    });

    const plan = await planner.generatePlan();
    const validation = validateMigrationPlan(plan);
    assert.equal(validation.success, true);

    const orgPlans = plan.modules.filter(
      (mp) => mp.scopeLevel === 'organization',
    );
    assert.ok(orgPlans.length > 0);

    // Every organization ModulePlan must carry sourceIdentifier ('acme-alpha' or 'acme-beta')
    for (const mp of orgPlans) {
      assert.ok(
        mp.sourceIdentifier === 'acme-alpha' ||
          mp.sourceIdentifier === 'acme-beta',
      );
      // Global singletons must never be planned in associated-only mode
      assert.equal(
        GLOBAL_SINGLETON_ORGANIZATION_MODULES.includes(mp.moduleId),
        false,
        `Expected global singleton ${mp.moduleId} to be excluded in associated-only mode`,
      );
    }
  });
});
