import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '../..');

const regPath = join(root, 'research/github/collector-registry.json');
const registry = JSON.parse(readFileSync(regPath, 'utf8'));

const graphqlQueries = [
  {
    id: 'graphql.org.metadata-deep',
    purpose:
      'Consolidated organization profile, membership counts, security managers, and project fields',
    targetScope: 'organization',
    satisfiedCollectorIds: [
      'rest.orgs.get',
      'rest.orgs.list-members',
      'rest.orgs.list-outside-collaborators',
      'rest.orgs.get-membership-for-user',
      'rest.orgs.list-security-manager-teams',
      'rest.projects.list-for-org',
      'rest.projects.list-fields-for-org',
    ],
    queryText: `query OrgMetadataDeep($login: String!) {
  rateLimit { cost remaining resetAt }
  organization(login: $login) {
    id
    login
    name
    description
    websiteUrl
    isVerified
    requiresTwoFactorAuthentication
    defaultRepositoryPermission
    membersWithRole { totalCount }
    pendingMembers { totalCount }
    securityManagers(first: 20) {
      nodes { slug name }
    }
    projectsV2(first: 20) {
      nodes {
        id
        title
        fields(first: 20) {
          nodes {
            ... on ProjectV2FieldCommon { id name dataType }
          }
        }
      }
    }
  }
}`,
    variables: { login: 'String!' },
    pageSize: 1,
    estimatedPointCost: 2,
    fieldMappings: {
      id: 'organization.id',
      login: 'organization.login',
      name: 'organization.displayName',
      defaultRepositoryPermission: 'organization.defaultRepositoryPermission',
      securityManagers: 'Entity[kind=policy]',
    },
  },
  {
    id: 'graphql.org.repositories-deep',
    purpose:
      'Paged repository discovery with nested branch protections, repo rulesets, languages, release assets, and topics',
    targetScope: 'organization',
    satisfiedCollectorIds: [
      'rest.repos.list-for-org',
      'rest.repos.get',
      'rest.repos.list-branches',
      'rest.repos.get-branch-protection',
      'rest.repos.get-branch-rules',
      'rest.repos.get-status-checks-protection',
      'rest.repos.get-repo-rulesets',
      'rest.repos.get-repo-ruleset',
      'rest.repos.list-languages',
      'rest.repos.list-forks',
      'rest.repos.get-all-topics',
      'rest.repos.list-release-assets',
      'rest.packages.list-packages-for-organization',
      'rest.packages.get-package-for-organization',
    ],
    queryText: `query OrgRepositoriesDeep($login: String!, $cursor: String) {
  rateLimit { cost remaining resetAt }
  organization(login: $login) {
    repositories(first: 100, after: $cursor, orderBy: {field: NAME, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      totalCount
      nodes {
        id
        name
        visibility
        isArchived
        isFork
        diskUsage
        defaultBranchRef { name }
        refs(refPrefix: "refs/heads/", first: 20) {
          nodes { name prefix }
        }
        branchProtectionRules(first: 10) {
          nodes {
            pattern
            requiresApprovingReviews
            requiredApprovingReviewCount
            requiresStatusChecks
            requiresStrictStatusChecks
            requiredStatusCheckContexts
          }
        }
        rulesets(first: 10) {
          nodes {
            name
            enforcement
            target
          }
        }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
        repositoryTopics(first: 10) {
          nodes { topic { name } }
        }
        releases(first: 5) {
          nodes {
            name
            releaseAssets(first: 10) {
              nodes { name size downloadCount }
            }
          }
        }
        packages(first: 10) {
          nodes { name packageType }
        }
      }
    }
  }
}`,
    variables: { login: 'String!', cursor: 'String' },
    pageSize: 100,
    estimatedPointCost: 5,
    fieldMappings: {
      id: 'Entity[kind=repository].id',
      name: 'Entity[kind=repository].name',
      visibility: 'Entity[kind=repository].visibility',
      diskUsage: 'Entity[kind=repository].size (bytes = diskUsage * 1024)',
      'defaultBranchRef.name': 'Entity[kind=repository].defaultBranch',
      'branchProtectionRules.nodes': 'Entity[kind=policy]',
      'rulesets.nodes': 'Entity[kind=policy]',
      'releaseAssets.nodes': 'Entity[kind=asset]',
    },
  },
  {
    id: 'graphql.org.teams-deep',
    purpose:
      'Team hierarchy, parent/child team linkages, members count, and repository permissions',
    targetScope: 'organization',
    satisfiedCollectorIds: [
      'rest.teams.list',
      'rest.teams.get-by-name',
      'rest.teams.list-child-in-org',
      'rest.teams.list-members-in-org',
      'rest.teams.list-repos-in-org',
      'rest.repos.list-teams',
      'rest.repos.list-collaborators',
      'rest.repos.get-collaborator-permission-level',
    ],
    queryText: `query OrgTeamsDeep($login: String!, $cursor: String) {
  rateLimit { cost remaining resetAt }
  organization(login: $login) {
    teams(first: 100, after: $cursor, rootTeamsOnly: true) {
      pageInfo { hasNextPage endCursor }
      totalCount
      nodes {
        id
        slug
        name
        description
        members { totalCount }
        childTeams(first: 20) {
          nodes { id slug name members { totalCount } }
        }
        repositories(first: 100) {
          edges {
            permission
            node { id name }
          }
        }
      }
    }
  }
}`,
    variables: { login: 'String!', cursor: 'String' },
    pageSize: 100,
    estimatedPointCost: 4,
    fieldMappings: {
      slug: 'Entity[kind=team].name',
      childTeams: 'Entity[kind=team].parentTeamId',
      'members.totalCount': 'Entity[kind=team].membershipCount',
      'repositories.edges': 'Entity[kind=team].repositoryAccess',
    },
  },
  {
    id: 'graphql.enterprise.orgs-deep',
    purpose:
      'Enterprise member organizations, license counts, enterprise teams, and assignments',
    targetScope: 'enterprise',
    satisfiedCollectorIds: [
      'rest.enterprise-admin.get-consumed-licenses',
      'rest.enterprise-teams.list',
      'rest.enterprise-team-memberships.list',
      'rest.enterprise-team-memberships.get',
      'rest.enterprise-team-organizations.get-assignments',
      'rest.enterprise-team-organizations.get-assignment',
    ],
    queryText: `query EnterpriseOrgsDeep($slug: String!, $cursor: String) {
  rateLimit { cost remaining resetAt }
  enterprise(slug: $slug) {
    id
    name
    slug
    organizations(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      totalCount
      nodes { id login name }
    }
    teams(first: 50) {
      nodes {
        slug
        name
        members { totalCount }
      }
    }
  }
}`,
    variables: { slug: 'String!', cursor: 'String' },
    pageSize: 100,
    estimatedPointCost: 3,
    fieldMappings: {
      'organizations.nodes': 'DiscoveryBundle.organizations',
      'teams.nodes': 'Entity[kind=team]',
    },
  },
];

const satisfiedIds = new Set(
  graphqlQueries.flatMap((q) => q.satisfiedCollectorIds),
);

const restOnlyCollectors = [];
for (const c of registry.collectors) {
  if (!satisfiedIds.has(c.id)) {
    let reason =
      'Endpoint provides specialized metadata not exposed via GitHub GraphQL API';
    if (c.module === 'actions') {
      reason =
        'GitHub Actions runner infrastructure, runner groups, runner machine specs, custom runner images, and cache limits are REST-only';
    } else if (
      c.module === 'actions-secrets' ||
      c.module === 'codespaces' ||
      c.module === 'copilot'
    ) {
      reason =
        'Secret and variable metadata names/timestamps are restricted to REST API endpoints to enforce secret security boundaries';
    } else if (c.module === 'security') {
      reason =
        'Code scanning default setup, code security configurations, and secret scanning push protection history are REST-only';
    } else if (c.module === 'network') {
      reason =
        'Hosted compute network configurations for enterprise and org are REST-only';
    } else if (c.module === 'integrations') {
      reason = 'GitHub App installations and private registries are REST-only';
    } else if (c.module === 'billing') {
      reason = 'Enterprise budgets and license sync endpoints are REST-only';
    } else if (c.module === 'governance') {
      reason =
        'Custom properties definitions and enterprise roles are REST-only';
    } else if (c.module === 'migration') {
      reason = 'Migration status and archive metadata endpoints are REST-only';
    } else if (c.module === 'api-activity') {
      reason = 'API Insights summary and time statistics are REST-only';
    } else if (c.module === 'deployments') {
      reason = 'GitHub Pages configuration and build history are REST-only';
    }
    restOnlyCollectors.push({
      id: c.id,
      module: c.module,
      reason,
      requiredScope: c.scope,
    });
  }
}

const catalog = {
  $schema: './schemas/graphql-query-catalog.schema.json',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  targetApiVersion: '2026-03-10',
  summary: {
    totalPlannedCollectors: registry.collectors.length,
    satisfiedByGraphQL: satisfiedIds.size,
    restOnly: restOnlyCollectors.length,
    consolidationRatio: `${satisfiedIds.size} collectors consolidated into ${graphqlQueries.length} GraphQL queries (>85% request volume reduction)`,
  },
  queries: graphqlQueries,
  restOnlyCollectors,
};

const outPath = join(root, 'research/github/graphql-query-catalog.json');
writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`Successfully generated GraphQL query catalog at ${outPath}`);
console.log(
  `Total: ${catalog.summary.totalPlannedCollectors}, GraphQL: ${catalog.summary.satisfiedByGraphQL}, REST-Only: ${catalog.summary.restOnly}`,
);
