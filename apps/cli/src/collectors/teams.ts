import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubTeamItem {
  id: number;
  slug: string;
  name: string;
  parent?: { slug: string } | null;
  members_count?: number;
}

export const collector: Collector = {
  id: 'teams',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.teams.list',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/teams',
      pathParams: { org: context.organizationId },
      queryParams: { per_page: 100 },
    };

    const res = await context.adapter.fetchAll<GitHubTeamItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();

    const entities: Entity[] = res.items.map((t) => ({
      id: `org:${context.organizationId}:team:${t.slug}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.teams.list',
        observedAt: res.observedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'team',
      name: t.slug,
      parentTeamId: t.parent
        ? `org:${context.organizationId}:team:${t.parent.slug}`
        : null,
      membershipCount: {
        value: typeof t.members_count === 'number' ? t.members_count : 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      repositoryAccess: [],
    }));

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
            source: 'rest',
            operation: 'rest.teams.list',
            observedAt: res.observedAt,
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
