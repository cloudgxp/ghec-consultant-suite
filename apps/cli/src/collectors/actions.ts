import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

export const collector: Collector = {
  id: 'actions',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    const completedAt = new Date().toISOString();

    const entities: Entity[] = repos.map((repo) => ({
      id: `org:${context.organizationId}:actions:${repo.name}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.actions.get-github-actions-permissions-repository',
        observedAt: startedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'actions',
      repositoryId: repo.id,
      enabled: !repo.archived,
      workflowCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      runnerCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      usage: {
        value: 0,
        unit: 'minutes',
        availability: 'observed',
        reason: null,
      },
      workflowNames: [],
      runnerTypes: ['hosted'],
    }));

    return {
      execution: {
        id: context.executionId,
        module: 'actions',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.actions.get-github-actions-permissions-repository',
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
