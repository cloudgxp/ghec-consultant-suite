import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubSecretItem {
  name: string;
  created_at?: string;
  updated_at?: string;
  visibility?: string;
}

export const collector: Collector = {
  id: 'actions-secrets',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.actions.list-org-secrets',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/actions/secrets',
      pathParams: { org: context.organizationId },
    };

    const res = await context.adapter.fetchAll<GitHubSecretItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();

    const entities: Entity[] = res.items.map((s) => ({
      id: `org:${context.organizationId}:secret:${s.name}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.actions.list-org-secrets',
        observedAt: res.observedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'actions-secret',
      repositoryId: null,
      name: s.name,
      configurationKind: 'secret',
      level: 'organization',
      updatedAt: s.updated_at ?? null,
    }));

    return {
      execution: {
        id: context.executionId,
        module: 'actions-secrets',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.actions.list-org-secrets',
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
