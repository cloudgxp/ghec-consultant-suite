import type { Entity } from '@ghec/contracts';
import type { GraphQLResponse } from '@ghec/github-client';
import type {
  Collector,
  CollectorContext,
  CollectorResult,
  DiscoveredPolicyItem,
} from './types.js';

export const ORG_REPOSITORIES_QUERY = `query OrgRepositories($login: String!, $cursor: String) {
  rateLimit {
    cost
    remaining
    resetAt
  }
  organization(login: $login) {
    projectsV2(first: 100) {
      nodes {
        id
        number
        title
        closed
        updatedAt
        items(first: 1) { totalCount }
        fields(first: 1) { totalCount }
        repositories(first: 100) { nodes { name } totalCount }
      }
    }
    repositories(
      first: 100
      after: $cursor
      orderBy: { field: NAME, direction: ASC }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
      nodes {
        id
        name
        visibility
        isArchived
        isFork
        isTemplate
        pushedAt
        diskUsage
        primaryLanguage { name }
        repositoryTopics(first: 100) { nodes { topic { name } } }
        defaultBranchRef {
          name
        }
        branchProtectionRules(first: 10) {
          nodes {
            pattern
            requiresApprovingReviews
            requiredApprovingReviewCount
            requiresStatusChecks
            requiresStrictStatusChecks
          }
        }
        rulesets(first: 10) {
          nodes {
            name
            enforcement
            target
          }
        }
      }
    }
  }
}`;

export const ORG_REPOSITORIES_QUERY_WITHOUT_PROJECTS = `query OrgRepositoriesWithoutProjects($login: String!, $cursor: String) {
  rateLimit {
    cost
    remaining
    resetAt
  }
  organization(login: $login) {
    repositories(
      first: 100
      after: $cursor
      orderBy: { field: NAME, direction: ASC }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
      nodes {
        id
        name
        visibility
        isArchived
        isFork
        isTemplate
        pushedAt
        diskUsage
        primaryLanguage { name }
        repositoryTopics(first: 100) { nodes { topic { name } } }
        defaultBranchRef {
          name
        }
        branchProtectionRules(first: 10) {
          nodes {
            pattern
            requiresApprovingReviews
            requiredApprovingReviewCount
            requiresStatusChecks
            requiresStrictStatusChecks
          }
        }
        rulesets(first: 10) {
          nodes {
            name
            enforcement
            target
          }
        }
      }
    }
  }
}`;

interface GraphQLRepoNode {
  id: string;
  name: string;
  visibility?: string | null;
  isArchived?: boolean | null;
  isFork?: boolean | null;
  isTemplate?: boolean | null;
  pushedAt?: string | null;
  diskUsage?: number | null;
  primaryLanguage?: { name?: string | null } | null;
  repositoryTopics?: {
    nodes?: Array<{ topic?: { name?: string | null } | null }>;
  } | null;
  defaultBranchRef?: { name: string } | null;
  branchProtectionRules?: {
    nodes?: Array<{
      pattern: string;
      requiresApprovingReviews?: boolean | null;
      requiredApprovingReviewCount?: number | null;
      requiresStatusChecks?: boolean | null;
      requiresStrictStatusChecks?: boolean | null;
    }>;
  } | null;
  rulesets?: {
    nodes?: Array<{
      name: string;
      enforcement: string;
      target?: string | null;
    }>;
  } | null;
}

interface OrgRepositoriesData {
  organization?: {
    projectsV2?: {
      nodes?: Array<{
        id: string;
        number?: number;
        title?: string;
        closed?: boolean;
        updatedAt?: string | null;
        items?: { totalCount?: number };
        fields?: { totalCount?: number };
        repositories?: {
          nodes?: Array<{ name?: string }>;
          totalCount?: number;
        };
      }>;
    };
    repositories?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount?: number;
      nodes?: GraphQLRepoNode[];
    };
  };
}

export const collector: Collector = {
  id: 'repos',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    let cursor: string | null = null;
    let hasNextPage = true;
    const allRepoNodes: GraphQLRepoNode[] = [];
    let projectNodes: NonNullable<
      NonNullable<OrgRepositoriesData['organization']>['projectsV2']
    >['nodes'] = [];
    let lastObservedAt = startedAt;

    let activeQuery = ORG_REPOSITORIES_QUERY;

    while (hasNextPage && !context.signal.aborted) {
      let response: GraphQLResponse<OrgRepositoriesData>;
      try {
        response = await context.adapter.queryGraphQL<OrgRepositoriesData>(
          activeQuery,
          {
            login: context.organizationId,
            cursor,
          },
          context.signal,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          activeQuery === ORG_REPOSITORIES_QUERY &&
          /read:project|projectsV2|INSUFFICIENT_SCOPES/i.test(msg)
        ) {
          activeQuery = ORG_REPOSITORIES_QUERY_WITHOUT_PROJECTS;
          response = await context.adapter.queryGraphQL<OrgRepositoriesData>(
            activeQuery,
            {
              login: context.organizationId,
              cursor,
            },
            context.signal,
          );
        } else {
          throw err;
        }
      }

      lastObservedAt = response.observedAt;
      const reposPayload = response.data?.organization?.repositories;
      if (response.data?.organization?.projectsV2?.nodes) {
        projectNodes = response.data.organization.projectsV2.nodes;
      }
      const nodes = reposPayload?.nodes ?? [];
      allRepoNodes.push(...nodes);

      const pageInfo = reposPayload?.pageInfo;
      hasNextPage = Boolean(pageInfo?.hasNextPage && pageInfo?.endCursor);
      cursor = pageInfo?.endCursor ?? null;

      if (hasNextPage && activeQuery === ORG_REPOSITORIES_QUERY) {
        activeQuery = ORG_REPOSITORIES_QUERY_WITHOUT_PROJECTS;
      }
    }

    interface GitHubCustomProperty {
      property_name: string;
      value_type: string;
      required?: boolean;
      default_value?: string | string[];
      allowed_values?: string[];
      description?: string;
    }
    let orgCustomProperties: GitHubCustomProperty[] = [];
    try {
      const propsRes = await context.adapter.readSingle<GitHubCustomProperty[]>(
        {
          id: 'rest.orgs.getCustomProperties',
          transport: 'rest',
          verifiedReadOnly: true,
          path: `/orgs/{org}/properties/schema`,
          pathParams: { org: context.organizationId },
        },
        context.signal,
      );
      if (Array.isArray(propsRes.data)) {
        orgCustomProperties = propsRes.data;
      }
    } catch {
      // Ignore if org properties API fails
    }

    interface GitHubRepoCustomPropertyValue {
      repository_name: string;
      properties: Array<{
        property_name: string;
        value: string | string[];
      }>;
    }
    const repoProperties = new Map<
      string,
      Array<{ name: string; value: string | null }>
    >();
    try {
      const propsValuesRes =
        await context.adapter.fetchAll<GitHubRepoCustomPropertyValue>(
          {
            id: 'rest.orgs.getCustomPropertyValues',
            transport: 'rest',
            verifiedReadOnly: true,
            path: `/orgs/{org}/properties/values`,
            pathParams: { org: context.organizationId },
          },
          context.signal,
        );
      for (const repo of propsValuesRes.items) {
        repoProperties.set(
          repo.repository_name,
          repo.properties.map((p) => ({
            name: p.property_name,
            value: Array.isArray(p.value)
              ? p.value.join(', ')
              : p.value == null
                ? null
                : String(p.value),
          })),
        );
      }
    } catch {
      // Ignore
    }

    const completedAt = new Date().toISOString();

    const customPropertyEntities: Entity[] = orgCustomProperties.map((prop) => {
      const rawType = prop.value_type?.toLowerCase() ?? 'string';
      const valueType = [
        'string',
        'single_select',
        'multi_select',
        'true_false',
      ].includes(rawType)
        ? (rawType as
            'string' | 'single_select' | 'multi_select' | 'true_false')
        : 'string';

      return {
        id: `org:${context.organizationId}:custom-property:${prop.property_name}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.orgs.getCustomProperties',
          observedAt: lastObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'custom-property-definition',
        propertyName: prop.property_name,
        valueType,
        required: prop.required ?? null,
        defaultValue: prop.default_value ?? null,
        allowedValues: prop.allowed_values ?? null,
        description: prop.description ?? null,
      };
    });
    const repositories: Entity[] = allRepoNodes.map((node) => {
      const repoId = `org:${context.organizationId}:repo:${node.name}`;
      const sizeValue =
        typeof node.diskUsage === 'number' ? node.diskUsage * 1024 : null;
      const rawVis = node.visibility?.toLowerCase();
      const visibility =
        rawVis === 'public'
          ? 'public'
          : rawVis === 'internal'
            ? 'internal'
            : rawVis === 'private'
              ? 'private'
              : 'unknown';

      return {
        id: repoId,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'graphql',
          operation: 'graphql.org.repositories',
          observedAt: lastObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'repository',
        name: node.name,
        visibility,
        archived: Boolean(node.isArchived),
        defaultBranch: node.defaultBranchRef?.name ?? 'main',
        size:
          sizeValue !== null
            ? {
                value: sizeValue,
                unit: 'bytes',
                availability: 'observed',
                reason: null,
              }
            : {
                value: null,
                unit: 'bytes',
                availability: 'unknown',
                reason: 'Repository size metric unavailable from source',
              },
        fork: Boolean(node.isFork),
      };
    });
    const repoIds = new Map(
      allRepoNodes.map((node) => [
        node.name,
        `org:${context.organizationId}:repo:${node.name}`,
      ]),
    );
    const portfolioEntities: Entity[] = allRepoNodes.flatMap((node) => {
      const repositoryId = repoIds.get(node.name)!;
      const provenance = {
        source: 'graphql' as const,
        operation: 'graphql.org.repositories.portfolio',
        observedAt: lastObservedAt,
        apiVersion: '2026-03-10',
      };
      return [
        {
          id: `${repositoryId}:portfolio`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance,
          kind: 'repository-portfolio' as const,
          repositoryId,
          primaryLanguage: node.primaryLanguage?.name ?? null,
          topics: (node.repositoryTopics?.nodes ?? []).flatMap((item) =>
            item.topic?.name ? [item.topic.name] : [],
          ),
          template: node.isTemplate ?? null,
          pushedAt: node.pushedAt ?? null,
          businessClassification: null,
          migrationWave: null,
          customProperties: repoProperties.get(node.name) ?? [],
          metadataCoverage: 'partial' as const,
        },
        {
          id: `${repositoryId}:code-ownership`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            ...provenance,
            operation: 'codeowners-metadata-coverage',
          },
          kind: 'code-ownership' as const,
          repositoryId,
          presence: 'unknown' as const,
          location: 'unknown' as const,
          syntaxStatus: 'unknown' as const,
          ruleCount: {
            value: null,
            unit: 'count' as const,
            availability: 'unknown' as const,
            reason:
              'Raw CODEOWNERS content is prohibited from standard collection',
          },
          ownerCount: {
            value: null,
            unit: 'count' as const,
            availability: 'unknown' as const,
            reason: 'Approved source-side aggregate parser is unavailable',
          },
          resolvableTeamCount: {
            value: null,
            unit: 'count' as const,
            availability: 'unknown' as const,
            reason: 'Owner aggregates were not collected',
          },
          resolvableUserCount: {
            value: null,
            unit: 'count' as const,
            availability: 'unknown' as const,
            reason: 'Owner aggregates were not collected',
          },
          unresolvedOwnerCount: {
            value: null,
            unit: 'count' as const,
            availability: 'unknown' as const,
            reason: 'Owner aggregates were not collected',
          },
          reviewPolicyIntegrated: null,
          updatedAt: null,
          coverage: 'unsupported' as const,
          coverageReason:
            'Metadata-safe source-side CODEOWNERS aggregate parser is not enabled; raw file content was not fetched',
        },
      ];
    });
    const projectEntities: Entity[] = (projectNodes ?? []).map((project) => ({
      id: `org:${context.organizationId}:project:${project.id}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'graphql',
        operation: 'graphql.org.projectsV2.metadata',
        observedAt: lastObservedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'project',
      title: project.title ?? `Project ${project.number ?? 0}`,
      number: project.number ?? 0,
      status:
        project.closed === true
          ? 'closed'
          : project.closed === false
            ? 'open'
            : 'unknown',
      ownerScope: 'organization',
      linkedRepositoryIds: (project.repositories?.nodes ?? []).flatMap(
        (repo) =>
          repo.name && repoIds.has(repo.name) ? [repoIds.get(repo.name)!] : [],
      ),
      itemCount:
        typeof project.items?.totalCount === 'number'
          ? {
              value: project.items.totalCount,
              unit: 'count',
              availability: 'observed',
              reason: null,
            }
          : {
              value: null,
              unit: 'count',
              availability: 'unknown',
              reason: 'Project item aggregate unavailable',
            },
      fieldCount:
        typeof project.fields?.totalCount === 'number'
          ? {
              value: project.fields.totalCount,
              unit: 'count',
              availability: 'observed',
              reason: null,
            }
          : {
              value: null,
              unit: 'count',
              availability: 'unknown',
              reason: 'Project field aggregate unavailable',
            },
      updatedAt: project.updatedAt ?? null,
      coverage: 'complete',
    }));
    const entities = [
      ...repositories,
      ...portfolioEntities,
      ...projectEntities,
      ...customPropertyEntities,
    ];

    const repositoryPolicies: DiscoveredPolicyItem[] = allRepoNodes.map(
      (node) => ({
        repositoryName: node.name,
        branchProtectionRules: (node.branchProtectionRules?.nodes ?? []).map(
          (bp) => ({
            pattern: bp.pattern,
            requiresApprovingReviews: bp.requiresApprovingReviews ?? null,
            requiredApprovingReviewCount:
              bp.requiredApprovingReviewCount ?? null,
            requiresStatusChecks: bp.requiresStatusChecks ?? null,
            requiresStrictStatusChecks: bp.requiresStrictStatusChecks ?? null,
          }),
        ),
        rulesets: (node.rulesets?.nodes ?? []).map((rs) => ({
          name: rs.name,
          enforcement: rs.enforcement,
          target: rs.target ?? null,
        })),
      }),
    );

    return {
      execution: {
        id: context.executionId,
        module: 'repos',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'graphql',
            operation: 'graphql.org.repositories',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: [],
        errors: [],
        coverage: {
          state: 'complete',
          observed: entities.length,
          expected: entities.length,
          reason: null,
        },
      },
      entities,
      organizations: [],
      repositoryPolicies,
    };
  },
};
