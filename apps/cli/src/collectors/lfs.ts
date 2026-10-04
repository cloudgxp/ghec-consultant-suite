import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

export const collector: Collector = {
  id: 'lfs',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    let lastObservedAt = startedAt;

    const entities: Entity[] = [];

    for (const repo of repos) {
      if (context.signal.aborted) {
        throw context.signal.reason ?? new Error('Aborted');
      }

      let indicator: 'detected' | 'not_detected' | 'unknown';
      let observedAt = startedAt;

      if (!repo.archived) {
        try {
          const contentRes = await context.adapter.readSingle<{
            content?: string;
            encoding?: string;
          }>(
            {
              id: 'rest.repos.get-content',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}/contents/{path}',
              pathParams: {
                owner: context.organizationId,
                repo: repo.name,
                path: '.gitattributes',
              },
            },
            context.signal,
          );
          observedAt = contentRes.observedAt;
          lastObservedAt = contentRes.observedAt;

          if (
            contentRes.data?.content &&
            contentRes.data?.encoding === 'base64'
          ) {
            const decoded = Buffer.from(
              contentRes.data.content,
              'base64',
            ).toString('utf-8');
            indicator = decoded.includes('filter=lfs')
              ? 'detected'
              : 'not_detected';
          } else {
            indicator = 'not_detected';
          }
        } catch (err: unknown) {
          if (
            typeof err === 'object' &&
            err !== null &&
            'status' in err &&
            (err as { status: unknown }).status === 404
          ) {
            indicator = 'not_detected';
          } else {
            indicator = 'unknown';
          }
        }
      } else {
        indicator = 'not_detected';
      }

      entities.push({
        id: `org:${context.organizationId}:lfs:${repo.name}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.repos.get-content',
          observedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'lfs',
        repositoryId: repo.id,
        storage: {
          value: null,
          unit: 'bytes',
          availability: 'unknown',
          reason:
            'Git LFS storage volume is not directly observable through REST repository endpoints without pack inspection or billing access',
        },
        objectCount: {
          value: null,
          unit: 'count',
          availability: 'unknown',
          reason:
            'Git LFS object count is not directly observable through REST repository endpoints without pack inspection or billing access',
        },
        indicator,
      });
    }

    const completedAt = new Date().toISOString();

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
            operation: 'rest.repos.get-content',
            observedAt: lastObservedAt,
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
