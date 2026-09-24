import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubInstallationItem {
  id: number;
  app_slug?: string;
  suspended_at?: string | null;
}

export const collector: Collector = {
  id: 'integrations',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.orgs.list-app-installations',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/installations',
      pathParams: { org: context.organizationId },
    };

    const res = await context.adapter.fetchAll<GitHubInstallationItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();

    const entities: Entity[] = res.items.map((inst) => ({
      id: `org:${context.organizationId}:integration:${inst.id}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.orgs.list-app-installations',
        observedAt: res.observedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'integration',
      repositoryId: null,
      integrationKind: 'github_app',
      label: inst.app_slug ?? String(inst.id),
      active: !inst.suspended_at,
    }));

    return {
      execution: {
        id: context.executionId,
        module: 'integrations',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.orgs.list-app-installations',
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
