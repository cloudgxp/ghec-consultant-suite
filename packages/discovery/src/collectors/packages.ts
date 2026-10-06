import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubPackageItem {
  id: number;
  name: string;
  package_type?: string;
  visibility?: string;
  version_count?: number;
  created_at?: string;
  updated_at?: string;
  owner?: { login?: string } | null;
  repository?: { id?: number; name?: string } | null;
}

const packageTypes = [
  'container',
  'npm',
  'maven',
  'rubygems',
  'nuget',
] as const;

export const collector: Collector = {
  id: 'packages',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    const responses = [];
    for (const packageType of packageTypes) {
      if (context.signal.aborted) break;
      responses.push(
        await context.adapter.fetchAll<GitHubPackageItem>(
          {
            id: 'rest.packages.list-packages-for-organization',
            transport: 'rest' as const,
            verifiedReadOnly: true as const,
            path: '/orgs/{org}/packages',
            pathParams: { org: context.organizationId },
            queryParams: { package_type: packageType },
          },
          context.signal,
        ),
      );
    }
    const completedAt = new Date().toISOString();

    // ⚡ Bolt: Optimize repository lookup from O(n^2) to O(n)
    // Pre-compute repository map for O(1) lookups during package processing
    const repoMap = new Map(repos.map((repo) => [repo.name, repo]));

    const projectedEntities: Entity[] = responses.flatMap((response) =>
      response.items.map((p) => {
        const repository = p.repository?.name
          ? repoMap.get(p.repository.name)
          : undefined;
        const ecosystem = packageTypes.includes(
          p.package_type as (typeof packageTypes)[number],
        )
          ? (p.package_type as (typeof packageTypes)[number])
          : 'unknown';
        const visibility = ['public', 'private', 'internal'].includes(
          p.visibility ?? '',
        )
          ? (p.visibility as 'public' | 'private' | 'internal')
          : 'unknown';
        return {
          id: `org:${context.organizationId}:package:${ecosystem}:${p.id}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.packages.list-packages-for-organization',
            observedAt: response.observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'package',
          name: p.name,
          ecosystem,
          visibility,
          owner: p.owner?.login ?? null,
          repositoryId: repository?.id ?? null,
          versionCount:
            typeof p.version_count === 'number'
              ? {
                  value: p.version_count,
                  unit: 'count',
                  availability: 'observed',
                  reason: null,
                }
              : {
                  value: null,
                  unit: 'count',
                  availability: 'unknown',
                  reason: 'Package version count was not returned by the API',
                },
          size: {
            value: null,
            unit: 'bytes',
            availability: 'unknown',
            reason:
              'Package content is never downloaded; total size was not reported',
          },
          createdAt: p.created_at ?? null,
          updatedAt: p.updated_at ?? null,
          disposition: 'unknown',
        } satisfies Entity;
      }),
    );
    // Defensive de-duplication protects against API/mirror responses that
    // return the same package from more than one registry-filtered request.
    const entities = [
      ...new Map(
        projectedEntities.map((entity) => [entity.id, entity]),
      ).values(),
    ];

    const observedAt = responses.at(-1)?.observedAt ?? startedAt;

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
            observedAt,
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
