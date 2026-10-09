import type { CollectorExecution, Entity } from '@ghec/contracts';
import type { GraphQLResponse } from '@ghec/github-client';
import type { CollectorContext, CollectorResult } from '../types.js';

export const ORG_TEAMS_DEEP_QUERY = `query OrgTeamsDeep($login: String!, $cursor: String) {
  rateLimit {
    cost
    remaining
    resetAt
  }
  organization(login: $login) {
    teams(first: 100, after: $cursor, rootTeamsOnly: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
      nodes {
        id
        slug
        name
        description
        members {
          totalCount
        }
        childTeams(first: 20) {
          nodes {
            id
            slug
            name
            members {
              totalCount
            }
          }
        }
        repositories(first: 100) {
          edges {
            permission
            node {
              id
              name
            }
          }
        }
      }
    }
  }
}`;

export interface DeepTeamChildNode {
  id: string;
  slug: string;
  name: string;
  members?: {
    totalCount?: number;
  } | null;
}

export interface DeepTeamNode {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  members?: {
    totalCount?: number;
  } | null;
  childTeams?: {
    nodes?: DeepTeamChildNode[];
  } | null;
  repositories?: {
    edges?: Array<{
      permission?: string | null;
      node?: {
        id: string;
        name: string;
      } | null;
    }>;
  } | null;
}

export interface OrgTeamsDeepData {
  organization?: {
    teams?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount?: number;
      nodes?: DeepTeamNode[];
    };
  };
}

export interface TeamHierarchyAndAccessResult extends CollectorResult {
  coveredModules: ['teams'];
}

function normalizePermission(
  perm?: string | null,
): 'read' | 'triage' | 'write' | 'maintain' | 'admin' | 'custom' | 'unknown' {
  switch (perm?.toUpperCase()) {
    case 'READ':
    case 'PULL':
      return 'read';
    case 'TRIAGE':
      return 'triage';
    case 'WRITE':
    case 'PUSH':
      return 'write';
    case 'MAINTAIN':
      return 'maintain';
    case 'ADMIN':
      return 'admin';
    default:
      return 'unknown';
  }
}

export class TeamHierarchyAndAccessAggregator {
  readonly id = 'graphql.org.teams-deep';

  async collect(
    context: CollectorContext,
  ): Promise<TeamHierarchyAndAccessResult> {
    const startedAt = new Date().toISOString();
    let cursor: string | null = null;
    let hasNextPage = true;
    const allRootTeams: DeepTeamNode[] = [];
    let lastObservedAt = startedAt;
    let totalCount: number | null = null;

    while (hasNextPage && !context.signal.aborted) {
      const response: GraphQLResponse<OrgTeamsDeepData> =
        await context.adapter.queryGraphQL<OrgTeamsDeepData>(
          ORG_TEAMS_DEEP_QUERY,
          {
            login: context.organizationId,
            cursor,
          },
          context.signal,
        );

      lastObservedAt = response.observedAt;
      const teamsPayload = response.data?.organization?.teams;
      if (totalCount === null && typeof teamsPayload?.totalCount === 'number') {
        totalCount = teamsPayload.totalCount;
      }

      const nodes = teamsPayload?.nodes ?? [];
      allRootTeams.push(...nodes);

      const pageInfo = teamsPayload?.pageInfo;
      hasNextPage = Boolean(pageInfo?.hasNextPage && pageInfo?.endCursor);
      cursor = pageInfo?.endCursor ?? null;
    }

    const completedAt = new Date().toISOString();
    const entities: Entity[] = [];
    const seenTeamSlugs = new Set<string>();
    const knownRepoIds = context.sharedState?.repositories
      ? new Set(context.sharedState.repositories.map((r) => r.id))
      : null;

    for (const rootTeam of allRootTeams) {
      const rootTeamId = `org:${context.organizationId}:team:${rootTeam.slug}`;
      seenTeamSlugs.add(rootTeam.slug);

      const repoAccess = (rootTeam.repositories?.edges ?? [])
        .filter((e) => Boolean(e.node?.name))
        .map((e) => {
          const repoId = `org:${context.organizationId}:repo:${e.node!.name}`;
          if (knownRepoIds && !knownRepoIds.has(repoId)) {
            return null;
          }
          return {
            repositoryId: repoId,
            permission: normalizePermission(e.permission),
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

      entities.push({
        id: rootTeamId,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'graphql',
          operation: 'graphql.org.teams-deep',
          observedAt: lastObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'team',
        name: rootTeam.slug,
        parentTeamId: null,
        membershipCount: {
          value: rootTeam.members?.totalCount ?? 0,
          unit: 'count',
          availability: 'observed',
          reason: null,
        },
        repositoryAccess: repoAccess,
      });

      // Child teams
      if (Array.isArray(rootTeam.childTeams?.nodes)) {
        for (const child of rootTeam.childTeams.nodes) {
          if (!seenTeamSlugs.has(child.slug)) {
            seenTeamSlugs.add(child.slug);
            entities.push({
              id: `org:${context.organizationId}:team:${child.slug}`,
              organizationId: context.organizationId,
              collectorExecutionId: context.executionId,
              provenance: {
                source: 'graphql',
                operation: 'graphql.org.teams-deep',
                observedAt: lastObservedAt,
                apiVersion: '2026-03-10',
              },
              kind: 'team',
              name: child.slug,
              parentTeamId: rootTeamId,
              membershipCount: {
                value: child.members?.totalCount ?? 0,
                unit: 'count',
                availability: 'observed',
                reason: null,
              },
              repositoryAccess: [],
            });
          }
        }
      }
    }

    const execution: CollectorExecution = {
      id: context.executionId,
      module: 'teams',
      organizationId: context.organizationId,
      status: 'complete',
      startedAt,
      completedAt,
      provenance: [
        {
          source: 'graphql',
          operation: 'graphql.org.teams-deep',
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
    };

    return {
      execution,
      entities,
      organizations: [],
      coveredModules: ['teams'],
    };
  }
}

export const teamHierarchyAndAccessAggregator =
  new TeamHierarchyAndAccessAggregator();
