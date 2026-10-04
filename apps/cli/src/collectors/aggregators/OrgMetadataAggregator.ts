import type {
  CollectorExecution,
  DiscoveryBundle,
  Entity,
} from '@ghec/contracts';
import type { GraphQLResponse } from '../../github/adapter.js';
import type { CollectorContext, CollectorResult } from '../types.js';

export const ORG_DEEP_METADATA_QUERY = `query OrgDeepMetadata($login: String!) {
  rateLimit {
    cost
    remaining
    resetAt
  }
  organization(login: $login) {
    id
    login
    name
    description
    websiteUrl
    isVerified
    requiresTwoFactorAuthentication
    defaultRepositoryPermission
    membersWithRole {
      totalCount
    }
    pendingMembers {
      totalCount
    }
    securityManagers(first: 20) {
      nodes {
        slug
        name
      }
    }
  }
}`;

export interface OrgDeepMetadataData {
  organization?: {
    id?: string;
    login?: string;
    name?: string | null;
    description?: string | null;
    websiteUrl?: string | null;
    isVerified?: boolean;
    requiresTwoFactorAuthentication?: boolean | null;
    defaultRepositoryPermission?: string | null;
    membersWithRole?: {
      totalCount?: number;
    };
    pendingMembers?: {
      totalCount?: number;
    };
    securityManagers?: {
      nodes?: Array<{
        slug: string;
        name?: string | null;
      }>;
    };
  } | null;
}

export interface OrgMetadataAggregatorResult extends CollectorResult {
  coveredModules: ['orgs'];
}

export class OrgMetadataAggregator {
  readonly id = 'graphql.org.metadata-deep';

  async collect(
    context: CollectorContext,
  ): Promise<OrgMetadataAggregatorResult> {
    const startedAt = new Date().toISOString();

    const response: GraphQLResponse<OrgDeepMetadataData> =
      await context.adapter.queryGraphQL<OrgDeepMetadataData>(
        ORG_DEEP_METADATA_QUERY,
        {
          login: context.organizationId,
        },
        context.signal,
      );

    const completedAt = new Date().toISOString();
    const orgData = response.data?.organization;

    if (!orgData) {
      const error = new Error(
        `Failed to retrieve organization "${context.organizationId}" via GraphQL.`,
      );
      (error as unknown as { status: number }).status = 404;
      throw error;
    }

    const orgLogin = orgData.login || context.organizationId;
    const orgId = context.organizationId;
    const displayName = orgData.name || null;

    const entities: Entity[] = [];

    const execution: CollectorExecution = {
      id: context.executionId,
      module: 'orgs',
      organizationId: orgId,
      status: 'complete',
      startedAt,
      completedAt,
      provenance: [
        {
          source: 'graphql',
          operation: 'graphql.org.metadata-deep',
          observedAt: response.observedAt,
          apiVersion: '2026-03-10',
        },
      ],
      warnings: [],
      errors: [],
      coverage: {
        state: 'complete',
        observed: 1,
        expected: 1,
        reason: null,
      },
    };

    const organizations: DiscoveryBundle['organizations'] = [
      {
        id: orgId,
        login: orgLogin,
        displayName,
      },
    ];

    return {
      execution,
      entities,
      organizations,
      coveredModules: ['orgs'],
    };
  }
}

export const orgMetadataAggregator = new OrgMetadataAggregator();
