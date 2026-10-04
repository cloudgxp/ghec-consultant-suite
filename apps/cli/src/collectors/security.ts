import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface CodeScanningDefaultSetupResponse {
  state?: 'configured' | 'not-configured' | string;
}

export const collector: Collector = {
  id: 'security',
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

      let codeScanning: 'enabled' | 'disabled' | 'unknown' = 'disabled';
      let dependabot: 'enabled' | 'disabled' | 'unknown' = 'disabled';
      let alertCount = 0;
      let repoObservedAt = startedAt;

      if (!repo.archived) {
        try {
          const csRes =
            await context.adapter.readSingle<CodeScanningDefaultSetupResponse>(
              {
                id: 'rest.code-scanning.get-default-setup',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/code-scanning/default-setup',
                pathParams: {
                  owner: context.organizationId,
                  repo: repo.name,
                },
              },
              context.signal,
            );
          const state = csRes.data?.state;
          codeScanning =
            state === 'configured' || state === 'enforced'
              ? 'enabled'
              : 'disabled';
          repoObservedAt = csRes.observedAt;
          lastObservedAt = csRes.observedAt;
        } catch {
          codeScanning = 'disabled';
        }

        try {
          const depRes = await context.adapter.readSingle<unknown>(
            {
              id: 'rest.repos.check-vulnerability-alerts',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}/vulnerability-alerts',
              pathParams: {
                owner: context.organizationId,
                repo: repo.name,
              },
            },
            context.signal,
          );
          if (depRes.status === 204 || depRes.status === 200) {
            dependabot = 'enabled';
          }
          lastObservedAt = depRes.observedAt;
        } catch {
          dependabot = 'disabled';
        }

        if (dependabot === 'enabled') {
          try {
            const alertsPage = await context.adapter.readPage<{
              number: number;
            }>(
              {
                id: 'rest.dependabot.list-alerts-for-repo',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/dependabot/alerts',
                pathParams: {
                  owner: context.organizationId,
                  repo: repo.name,
                },
                queryParams: {
                  state: 'open',
                  per_page: '100',
                },
              },
              null,
              context.signal,
            );
            if (alertsPage.status < 400 && Array.isArray(alertsPage.items)) {
              alertCount = alertsPage.items.length;
            }
            lastObservedAt = alertsPage.observedAt;
          } catch {
            // Alerts listing not accessible or disabled
          }
        }
      }

      entities.push({
        id: `org:${context.organizationId}:security:${repo.name}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.code-scanning.get-default-setup',
          observedAt: repoObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'security',
        repositoryId: repo.id,
        codeScanning,
        dependabot,
        openAlertCount: {
          value: alertCount,
          unit: 'count',
          availability: 'observed',
          reason: null,
        },
      });
    }

    const completedAt = new Date().toISOString();

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
