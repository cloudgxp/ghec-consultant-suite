import type { CollectorExecution, Entity, ModuleId } from '@ghec/contracts';
import type { GraphQLResponse } from '../../github/adapter.js';
import type {
  CollectorContext,
  CollectorResult,
  DiscoveredPolicyItem,
} from '../types.js';

export const ORG_REPOSITORIES_DEEP_QUERY = `query OrgRepositoriesDeep($login: String!, $cursor: String) {
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
        diskUsage
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
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges {
            size
            node {
              name
            }
          }
        }
        releases(first: 5) {
          nodes {
            name
            releaseAssets(first: 10) {
              nodes {
                name
                size
                downloadCount
              }
            }
          }
        }
        packages(first: 10) {
          nodes {
            name
            packageType
          }
        }
      }
    }
  }
}`;

export interface DeepRepoNode {
  id: string;
  name: string;
  visibility?: string | null;
  isArchived?: boolean | null;
  isFork?: boolean | null;
  diskUsage?: number | null;
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
  languages?: {
    edges?: Array<{
      size: number;
      node?: { name: string };
    }>;
  } | null;
  releases?: {
    nodes?: Array<{
      name: string;
      releaseAssets?: {
        nodes?: Array<{
          name: string;
          size: number;
          downloadCount?: number;
        }>;
      };
    }>;
  } | null;
  packages?: {
    nodes?: Array<{
      name: string;
      packageType?: string;
    }>;
  } | null;
}

export interface OrgRepositoriesDeepData {
  organization?: {
    repositories?: {
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      totalCount?: number;
      nodes?: DeepRepoNode[];
    };
  };
}

export interface RepositoryDeepDiscoveryResult extends CollectorResult {
  coveredModules: ModuleId[];
  executions: CollectorExecution[];
}

export class RepositoryDeepDiscoveryAggregator {
  readonly id = 'graphql.org.repositories-deep';

  async collect(
    context: CollectorContext,
  ): Promise<RepositoryDeepDiscoveryResult> {
    const startedAt = new Date().toISOString();
    let cursor: string | null = null;
    let hasNextPage = true;
    const allRepoNodes: DeepRepoNode[] = [];
    let lastObservedAt = startedAt;
    let totalCount: number | null = null;

    while (hasNextPage && !context.signal.aborted) {
      const response: GraphQLResponse<OrgRepositoriesDeepData> =
        await context.adapter.queryGraphQL<OrgRepositoriesDeepData>(
          ORG_REPOSITORIES_DEEP_QUERY,
          {
            login: context.organizationId,
            cursor,
          },
          context.signal,
        );

      lastObservedAt = response.observedAt;
      const reposPayload = response.data?.organization?.repositories;
      if (totalCount === null && typeof reposPayload?.totalCount === 'number') {
        totalCount = reposPayload.totalCount;
      }

      const nodes = reposPayload?.nodes ?? [];
      allRepoNodes.push(...nodes);

      const pageInfo = reposPayload?.pageInfo;
      hasNextPage = Boolean(pageInfo?.hasNextPage && pageInfo?.endCursor);
      cursor = pageInfo?.endCursor ?? null;
    }

    const completedAt = new Date().toISOString();
    const runIdSuffix = context.executionId.split(':').pop() || '1';
    const reposExecId = `exec:${context.organizationId}:repos:${runIdSuffix}`;
    const policiesExecId = `exec:${context.organizationId}:policies:${runIdSuffix}`;
    const packagesExecId = `exec:${context.organizationId}:packages:${runIdSuffix}`;

    const entities: Entity[] = [];
    const discoveredPolicies: DiscoveredPolicyItem[] = [];

    let repoCount = 0;
    let policyCount = 0;
    let assetCount = 0;

    for (const node of allRepoNodes) {
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

      // 1. Repository Entity
      entities.push({
        id: repoId,
        organizationId: context.organizationId,
        collectorExecutionId: reposExecId,
        provenance: {
          source: 'graphql',
          operation: 'graphql.org.repositories-deep',
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
                reason: 'Repository size is unavailable in GraphQL response.',
              },
        fork: Boolean(node.isFork),
      });
      repoCount++;

      // 2. Policy Entities (Branch Protection Rules & Rulesets)
      const bpNodes = node.branchProtectionRules?.nodes ?? [];
      for (const bp of bpNodes) {
        entities.push({
          id: `org:${context.organizationId}:repo:${node.name}:bp:${bp.pattern}`,
          organizationId: context.organizationId,
          collectorExecutionId: policiesExecId,
          provenance: {
            source: 'graphql',
            operation: 'graphql.org.repositories-deep',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'policy',
          repositoryId: repoId,
          policyKind: 'branch_protection',
          name: bp.pattern,
          enforcement: 'active',
        });
        policyCount++;
      }

      const rsNodes = node.rulesets?.nodes ?? [];
      for (const rs of rsNodes) {
        const enforcement =
          rs.enforcement.toLowerCase() === 'active'
            ? 'active'
            : rs.enforcement.toLowerCase() === 'evaluate'
              ? 'evaluate'
              : rs.enforcement.toLowerCase() === 'disabled'
                ? 'disabled'
                : 'unknown';

        entities.push({
          id: `org:${context.organizationId}:repo:${node.name}:ruleset:${rs.name}`,
          organizationId: context.organizationId,
          collectorExecutionId: policiesExecId,
          provenance: {
            source: 'graphql',
            operation: 'graphql.org.repositories-deep',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'policy',
          repositoryId: repoId,
          policyKind: 'ruleset',
          name: rs.name,
          enforcement,
        });
        policyCount++;
      }

      discoveredPolicies.push({
        repositoryName: node.name,
        branchProtectionRules: bpNodes.map((bp) => ({
          pattern: bp.pattern,
          requiresApprovingReviews: bp.requiresApprovingReviews ?? null,
          requiredApprovingReviewCount: bp.requiredApprovingReviewCount ?? null,
          requiresStatusChecks: bp.requiresStatusChecks ?? null,
          requiresStrictStatusChecks: bp.requiresStrictStatusChecks ?? null,
        })),
        rulesets: rsNodes.map((rs) => ({
          name: rs.name,
          enforcement: rs.enforcement,
          target: rs.target ?? null,
        })),
      });

      // 3. Asset Entities (Release Assets & Packages)
      if (Array.isArray(node.releases?.nodes)) {
        for (const rel of node.releases.nodes) {
          if (Array.isArray(rel.releaseAssets?.nodes)) {
            for (const asset of rel.releaseAssets.nodes) {
              entities.push({
                id: `org:${context.organizationId}:repo:${node.name}:asset:release:${asset.name}`,
                organizationId: context.organizationId,
                collectorExecutionId: packagesExecId,
                provenance: {
                  source: 'graphql',
                  operation: 'graphql.org.repositories-deep',
                  observedAt: lastObservedAt,
                  apiVersion: '2026-03-10',
                },
                kind: 'asset',
                repositoryId: repoId,
                assetKind: 'release',
                name: asset.name,
                size: {
                  value: asset.size ?? 0,
                  unit: 'bytes',
                  availability: 'observed',
                  reason: null,
                },
              });
              assetCount++;
            }
          }
        }
      }

      if (Array.isArray(node.packages?.nodes)) {
        for (const pkg of node.packages.nodes) {
          entities.push({
            id: `org:${context.organizationId}:repo:${node.name}:asset:pkg:${pkg.name}`,
            organizationId: context.organizationId,
            collectorExecutionId: packagesExecId,
            provenance: {
              source: 'graphql',
              operation: 'graphql.org.repositories-deep',
              observedAt: lastObservedAt,
              apiVersion: '2026-03-10',
            },
            kind: 'asset',
            repositoryId: repoId,
            assetKind: 'package',
            name: pkg.name,
            size: {
              value: null,
              unit: 'bytes',
              availability: 'unknown',
              reason: 'Package size requires package version detail query.',
            },
          });
          assetCount++;
        }
      }
    }

    // Build executions for covered modules
    const coveredModules: ModuleId[] = ['repos', 'policies', 'packages'];
    const executions: CollectorExecution[] = [
      {
        id: reposExecId,
        module: 'repos',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'graphql',
            operation: 'graphql.org.repositories-deep',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: [],
        errors: [],
        coverage: {
          state: 'complete',
          observed: repoCount,
          expected: totalCount ?? repoCount,
          reason: null,
        },
      },
      {
        id: policiesExecId,
        module: 'policies',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'graphql',
            operation: 'graphql.org.repositories-deep',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: [],
        errors: [],
        coverage: {
          state: 'complete',
          observed: policyCount,
          expected: policyCount,
          reason: null,
        },
      },
      {
        id: packagesExecId,
        module: 'packages',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'graphql',
            operation: 'graphql.org.repositories-deep',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: [],
        errors: [],
        coverage: {
          state: 'complete',
          observed: assetCount,
          expected: assetCount,
          reason: null,
        },
      },
    ];

    return {
      execution: executions[0]!,
      executions,
      entities,
      organizations: [],
      repositoryPolicies: discoveredPolicies,
      coveredModules,
    };
  }
}

export const repositoryDeepDiscoveryAggregator =
  new RepositoryDeepDiscoveryAggregator();
