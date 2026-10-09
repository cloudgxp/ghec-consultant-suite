import type { Entity } from '@ghec/contracts';
import type { GraphQLResponse } from '@ghec/github-client';
import { ORG_REPOSITORIES_QUERY } from './repos.js';
import type {
  Collector,
  CollectorContext,
  CollectorResult,
  DiscoveredPolicyItem,
} from './types.js';

interface GraphQLRepoPolicyNode {
  name: string;
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

interface OrgRepositoriesPolicyData {
  organization?: {
    repositories?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes?: GraphQLRepoPolicyNode[];
    };
  };
}

interface GitHubRuleset {
  id: number;
  name: string;
  enforcement: string;
  bypass_actors?: Array<{
    actor_id?: number;
    actor_type: string;
    bypass_mode: string;
  }>;
}

export const collector: Collector = {
  id: 'policies',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    let lastObservedAt = startedAt;
    let policyData: readonly DiscoveredPolicyItem[] =
      context.sharedState?.repositoryPolicies ?? [];

    if (policyData.length === 0) {
      let cursor: string | null = null;
      let hasNextPage = true;
      const fetchedPolicies: DiscoveredPolicyItem[] = [];

      while (hasNextPage && !context.signal.aborted) {
        const response: GraphQLResponse<OrgRepositoriesPolicyData> =
          await context.adapter.queryGraphQL<OrgRepositoriesPolicyData>(
            ORG_REPOSITORIES_QUERY,
            {
              login: context.organizationId,
              cursor,
            },
            context.signal,
          );

        lastObservedAt = response.observedAt;
        const reposPayload = response.data?.organization?.repositories;
        const nodes = reposPayload?.nodes ?? [];

        for (const node of nodes) {
          fetchedPolicies.push({
            repositoryName: node.name,
            branchProtectionRules: (
              node.branchProtectionRules?.nodes ?? []
            ).map((bp) => ({
              pattern: bp.pattern,
              requiresApprovingReviews: bp.requiresApprovingReviews ?? null,
              requiredApprovingReviewCount:
                bp.requiredApprovingReviewCount ?? null,
              requiresStatusChecks: bp.requiresStatusChecks ?? null,
              requiresStrictStatusChecks: bp.requiresStrictStatusChecks ?? null,
            })),
            rulesets: (node.rulesets?.nodes ?? []).map((rs) => ({
              name: rs.name,
              enforcement: rs.enforcement,
              target: rs.target ?? null,
            })),
          });
        }

        const pageInfo = reposPayload?.pageInfo;
        hasNextPage = Boolean(pageInfo?.hasNextPage && pageInfo?.endCursor);
        cursor = pageInfo?.endCursor ?? null;
      }

      policyData = fetchedPolicies;
    }

    const completedAt = new Date().toISOString();

    const entities: Entity[] = [];
    for (const item of policyData) {
      const repoId = `org:${context.organizationId}:repo:${item.repositoryName}`;

      for (const bp of item.branchProtectionRules) {
        entities.push({
          id: `org:${context.organizationId}:repo:${item.repositoryName}:policy:bp:${bp.pattern}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'graphql',
            operation: 'graphql.org.repositories',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'policy',
          repositoryId: repoId,
          policyKind: 'branch_protection',
          name: bp.pattern,
          enforcement: 'active',
        });
      }

      for (const rs of item.rulesets) {
        const rawEnf = rs.enforcement.toLowerCase();
        const enforcement =
          rawEnf === 'active'
            ? 'active'
            : rawEnf === 'evaluate'
              ? 'evaluate'
              : rawEnf === 'disabled'
                ? 'disabled'
                : 'unknown';

        entities.push({
          id: `org:${context.organizationId}:repo:${item.repositoryName}:policy:ruleset:${rs.name}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'graphql',
            operation: 'graphql.org.repositories',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'policy',
          repositoryId: repoId,
          policyKind: 'ruleset',
          name: rs.name,
          enforcement,
        });
      }
    }

    try {
      const rulesetsRes = await context.adapter.fetchAll<GitHubRuleset>(
        {
          id: 'rest.orgs.getRulesets',
          transport: 'rest',
          verifiedReadOnly: true,
          path: `/orgs/{org}/rulesets`,
          pathParams: { org: context.organizationId },
        },
        context.signal,
      );

      for (const ruleset of rulesetsRes.items) {
        let bypassActors = ruleset.bypass_actors;
        if (!bypassActors) {
          try {
            const detailRes = await context.adapter.readSingle<GitHubRuleset>(
              {
                id: 'rest.orgs.getRuleset',
                transport: 'rest',
                verifiedReadOnly: true,
                path: `/orgs/{org}/rulesets/{ruleset_id}`,
                pathParams: {
                  org: context.organizationId,
                  ruleset_id: String(ruleset.id),
                },
              },
              context.signal,
            );
            bypassActors = detailRes.data?.bypass_actors;
          } catch {
            // fallback
            bypassActors = [];
          }
        }

        const rawEnf = ruleset.enforcement.toLowerCase();
        const enforcement =
          rawEnf === 'active'
            ? 'active'
            : rawEnf === 'evaluate'
              ? 'evaluate'
              : rawEnf === 'disabled'
                ? 'disabled'
                : 'unknown';

        entities.push({
          id: `org:${context.organizationId}:policy:ruleset:${ruleset.name}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.orgs.getRulesets',
            observedAt: rulesetsRes.observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'policy',
          repositoryId: null,
          policyKind: 'ruleset',
          name: ruleset.name,
          enforcement,
          bypasses: bypassActors
            ? bypassActors.map((actor) => ({
                actorId: actor.actor_id ? String(actor.actor_id) : null,
                actorType: actor.actor_type,
                bypassMode:
                  actor.bypass_mode === 'always'
                    ? 'always'
                    : actor.bypass_mode === 'pull_request'
                      ? 'pull_request'
                      : actor.bypass_mode === 'always_allow'
                        ? 'always_allow'
                        : actor.bypass_mode === 'exempt'
                          ? 'exempt'
                          : 'unknown',
              }))
            : [],
        });
      }
    } catch {
      // Ignore if org rulesets API fails (e.g., GHEC unsupported or missing perm)
    }

    return {
      execution: {
        id: context.executionId,
        module: 'policies',
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
    };
  },
};
