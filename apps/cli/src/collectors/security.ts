import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

export const collector: Collector = {
  id: 'security',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    const completedAt = new Date().toISOString();

    const entities: Entity[] = repos.map((repo) => ({
      id: `org:${context.organizationId}:security:${repo.name}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.code-scanning.get-default-setup',
        observedAt: startedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'security',
      repositoryId: repo.id,
      codeScanning: 'disabled',
      dependabot: 'disabled',
      openAlertCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
    }));

    return {
      execution: {
        id: context.executionId,
        module: 'security',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.code-scanning.get-default-setup',
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
