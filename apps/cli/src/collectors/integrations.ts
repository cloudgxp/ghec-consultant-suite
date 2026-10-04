import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubInstallationItem {
  id: number;
  app_slug?: string;
  suspended_at?: string | null;
}

interface GitHubWebhookItem {
  id: number;
  name?: string;
  active?: boolean;
}

export const collector: Collector = {
  id: 'integrations',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const entities: Entity[] = [];
    let lastObservedAt = startedAt;

    // 1. Collect GitHub App Installations
    const installOp = {
      id: 'rest.orgs.list-app-installations',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/installations',
      pathParams: { org: context.organizationId },
    };

    try {
      const res = await context.adapter.fetchAll<GitHubInstallationItem>(
        installOp,
        context.signal,
      );
      lastObservedAt = res.observedAt;

      for (const inst of res.items) {
        entities.push({
          id: `org:${context.organizationId}:integration:app:${inst.id}`,
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
        });
      }
    } catch {
      // Continue if installations list is unavailable or fails
    }

    // 2. Collect Organization Webhooks (strictly omitting secret/token configs)
    const hooksOp = {
      id: 'rest.orgs.list-webhooks',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/hooks',
      pathParams: { org: context.organizationId },
    };

    try {
      const hooksRes = await context.adapter.fetchAll<GitHubWebhookItem>(
        hooksOp,
        context.signal,
      );
      lastObservedAt = hooksRes.observedAt;

      for (const hook of hooksRes.items) {
        entities.push({
          id: `org:${context.organizationId}:integration:hook:${hook.id}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.orgs.list-webhooks',
            observedAt: hooksRes.observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'integration',
          repositoryId: null,
          integrationKind: 'webhook',
          label: hook.name ?? `webhook-${hook.id}`,
          active: Boolean(hook.active),
        });
      }
    } catch {
      // Continue if hooks list is unavailable or fails
    }

    // 3. Collect Repository Deploy Keys and Webhooks
    const repos = context.sharedState?.repositories ?? [];
    for (const repo of repos) {
      if (context.signal.aborted) {
        throw context.signal.reason ?? new Error('Aborted');
      }
      if (repo.archived) continue;

      // Deploy Keys (metadata only: title, read_only, verified; no private keys)
      try {
        const keysRes = await context.adapter.fetchAll<{
          id: number;
          title?: string;
          read_only?: boolean;
          verified?: boolean;
          created_at?: string;
        }>(
          {
            id: 'rest.repos.list-deploy-keys',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/keys',
            pathParams: {
              owner: context.organizationId,
              repo: repo.name,
            },
          },
          context.signal,
        );
        lastObservedAt = keysRes.observedAt;

        for (const key of keysRes.items) {
          entities.push({
            id: `org:${context.organizationId}:repo:${repo.name}:deploy-key:${key.id}`,
            organizationId: context.organizationId,
            collectorExecutionId: context.executionId,
            provenance: {
              source: 'rest',
              operation: 'rest.repos.list-deploy-keys',
              observedAt: keysRes.observedAt,
              apiVersion: '2026-03-10',
            },
            kind: 'integration',
            repositoryId: repo.id,
            integrationKind: 'deploy_key',
            label: key.title ?? `deploy-key-${key.id}`,
            active: true,
          });
        }
      } catch {
        // Deploy keys not accessible or enabled
      }

      // Repository Webhooks (redacting any secret configurations)
      try {
        const repoHooksRes = await context.adapter.fetchAll<GitHubWebhookItem>(
          {
            id: 'rest.repos.list-webhooks',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/hooks',
            pathParams: {
              owner: context.organizationId,
              repo: repo.name,
            },
          },
          context.signal,
        );
        lastObservedAt = repoHooksRes.observedAt;

        for (const hook of repoHooksRes.items) {
          entities.push({
            id: `org:${context.organizationId}:repo:${repo.name}:hook:${hook.id}`,
            organizationId: context.organizationId,
            collectorExecutionId: context.executionId,
            provenance: {
              source: 'rest',
              operation: 'rest.repos.list-webhooks',
              observedAt: repoHooksRes.observedAt,
              apiVersion: '2026-03-10',
            },
            kind: 'integration',
            repositoryId: repo.id,
            integrationKind: 'webhook',
            label: hook.name ?? `webhook-${hook.id}`,
            active: Boolean(hook.active),
          });
        }
      } catch {
        // Repository hooks not accessible or enabled
      }
    }

    const completedAt = new Date().toISOString();

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
