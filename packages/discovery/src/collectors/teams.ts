import type { Entity } from '@ghec/contracts';
import type { GraphQLResponse } from '@ghec/github-client';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

export const ORG_TEAMS_QUERY = `query OrgTeams($login: String!, $cursor: String) {
  rateLimit {
    cost
    remaining
    resetAt
  }
  organization(login: $login) {
    teams(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        slug
        name
        parentTeam {
          slug
        }
        members {
          totalCount
        }
        repositories(first: 100) {
          edges {
            permission
            node {
              name
            }
          }
        }
      }
    }
  }
}`;

interface GraphQLTeamNode {
  slug: string;
  name: string;
  parentTeam?: { slug: string } | null;
  members?: { totalCount?: number | null } | null;
  repositories?: {
    edges?: Array<{
      permission: string;
      node: {
        name: string;
      };
    }>;
  } | null;
}

interface OrgTeamsData {
  organization?: {
    teams?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes?: GraphQLTeamNode[];
    };
  };
}

function mapPermission(
  raw: string | undefined,
): 'read' | 'triage' | 'write' | 'maintain' | 'admin' | 'custom' | 'unknown' {
  const p = raw?.toLowerCase();
  switch (p) {
    case 'admin':
      return 'admin';
    case 'maintain':
      return 'maintain';
    case 'write':
      return 'write';
    case 'triage':
      return 'triage';
    case 'read':
      return 'read';
    default:
      return 'custom';
  }
}

export const collector: Collector = {
  id: 'teams',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    let cursor: string | null = null;
    let hasNextPage = true;
    const allTeamNodes: GraphQLTeamNode[] = [];
    let lastObservedAt = startedAt;

    while (hasNextPage && !context.signal.aborted) {
      const response: GraphQLResponse<OrgTeamsData> =
        await context.adapter.queryGraphQL<OrgTeamsData>(
          ORG_TEAMS_QUERY,
          {
            login: context.organizationId,
            cursor,
          },
          context.signal,
        );

      lastObservedAt = response.observedAt;
      const teamsPayload = response.data?.organization?.teams;
      const nodes = teamsPayload?.nodes ?? [];
      allTeamNodes.push(...nodes);

      const pageInfo = teamsPayload?.pageInfo;
      hasNextPage = Boolean(pageInfo?.hasNextPage && pageInfo?.endCursor);
      cursor = pageInfo?.endCursor ?? null;
    }

    const completedAt = new Date().toISOString();

    const knownTeamSlugs = new Set(allTeamNodes.map((t) => t.slug));
    const knownRepoIds = context.sharedState?.repositories
      ? new Set(context.sharedState.repositories.map((r) => r.id))
      : null;

    const entities: Entity[] = allTeamNodes.map((t) => {
      const parentTeamId =
        t.parentTeam?.slug && knownTeamSlugs.has(t.parentTeam.slug)
          ? `org:${context.organizationId}:team:${t.parentTeam.slug}`
          : null;

      const repositoryAccess = (t.repositories?.edges ?? [])
        .map((edge) => {
          const repoId = `org:${context.organizationId}:repo:${edge.node.name}`;
          if (knownRepoIds && !knownRepoIds.has(repoId)) {
            return null;
          }
          return {
            repositoryId: repoId,
            permission: mapPermission(edge.permission),
          };
        })
        .filter(
          (
            a,
          ): a is {
            repositoryId: string;
            permission:
              | 'read'
              | 'triage'
              | 'write'
              | 'maintain'
              | 'admin'
              | 'custom'
              | 'unknown';
          } => a !== null,
        );

      return {
        id: `org:${context.organizationId}:team:${t.slug}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'graphql',
          operation: 'graphql.org.teams',
          observedAt: lastObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'team',
        name: t.slug,
        parentTeamId,
        membershipCount: {
          value:
            typeof t.members?.totalCount === 'number'
              ? t.members.totalCount
              : 0,
          unit: 'count',
          availability: 'observed',
          reason: null,
        },
        repositoryAccess,
      };
    });

    return {
      execution: {
        id: context.executionId,
        module: 'teams',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'graphql',
            operation: 'graphql.org.teams',
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
    };
  },
};
