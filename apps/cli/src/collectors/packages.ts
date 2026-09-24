import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubPackageItem {
  id: number;
  name: string;
  package_type?: string;
}

export const collector: Collector = {
  id: 'packages',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    const operation = {
      id: 'rest.packages.list-packages-for-organization',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/packages',
      pathParams: { org: context.organizationId },
      queryParams: { package_type: 'npm' },
    };

    const res = await context.adapter.fetchAll<GitHubPackageItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();

    const entities: Entity[] = [];
    if (repos.length > 0 && res.items.length > 0) {
      const defaultRepo = repos[0]!;
      for (const p of res.items) {
        entities.push({
          id: `org:${context.organizationId}:asset:${p.name}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.packages.list-packages-for-organization',
            observedAt: res.observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'asset',
          repositoryId: defaultRepo.id,
          assetKind: 'package',
          name: p.name,
          size: {
            value: null,
            unit: 'bytes',
            availability: 'unknown',
            reason: 'Package size requires individual version asset inspection',
          },
        });
      }
    }

    return {
      execution: {
        id: context.executionId,
        module: 'packages',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.packages.list-packages-for-organization',
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
