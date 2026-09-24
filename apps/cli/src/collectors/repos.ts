import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubRepoItem {
  id: number;
  node_id?: string;
  name: string;
  visibility?: string;
  private?: boolean;
  archived?: boolean;
  default_branch?: string;
  size?: number;
  fork?: boolean;
}

export const collector: Collector = {
  id: 'repos',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.repos.list-for-org',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/repos',
      pathParams: { org: context.organizationId },
      queryParams: { per_page: 100 },
    };

    const res = await context.adapter.fetchAll<GitHubRepoItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();

    const entities: Entity[] = res.items.map((r) => {
      const repoId = `org:${context.organizationId}:repo:${r.name}`;
      const sizeValue = typeof r.size === 'number' ? r.size * 1024 : null;
      return {
        id: repoId,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.repos.list-for-org',
          observedAt: res.observedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'repository',
        name: r.name,
        visibility:
          r.visibility === 'public'
            ? 'public'
            : r.visibility === 'internal'
              ? 'internal'
              : 'private',
        archived: Boolean(r.archived),
        defaultBranch: r.default_branch ?? 'main',
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
        fork: Boolean(r.fork),
      };
    });

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
            source: 'rest',
            operation: 'rest.repos.list-for-org',
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
