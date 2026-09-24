import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

export const collector: Collector = {
  id: 'lfs',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    const completedAt = new Date().toISOString();

    const entities: Entity[] = repos.map((repo) => ({
      id: `org:${context.organizationId}:lfs:${repo.name}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.repos.get',
        observedAt: startedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'lfs',
      repositoryId: repo.id,
      storage: {
        value: null,
        unit: 'bytes',
        availability: 'unknown',
        reason:
          'Git LFS storage volume is not directly observable through REST repository endpoints',
      },
      objectCount: {
        value: null,
        unit: 'count',
        availability: 'unknown',
        reason:
          'Git LFS object count is not directly observable through REST repository endpoints',
      },
      indicator: 'unknown',
    }));

    return {
      execution: {
        id: context.executionId,
        module: 'lfs',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.repos.get',
            observedAt: startedAt,
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
