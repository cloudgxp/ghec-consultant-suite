import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface ConfigurationItem {
  name: string;
  created_at?: string;
  updated_at?: string;
  visibility?: string;
}

function extractItems(items: readonly unknown[]): ConfigurationItem[] {
  return items.flatMap((item): ConfigurationItem[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.secrets))
      return record.secrets as ConfigurationItem[];
    if (Array.isArray(record.variables))
      return record.variables as ConfigurationItem[];
    return typeof record.name === 'string' ? [item as ConfigurationItem] : [];
  });
}

export const collector: Collector = {
  id: 'actions-secrets',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const entities: Entity[] = [];
    const errors: Array<{
      code: 'permission_denied';
      message: string;
      retryable: boolean;
    }> = [];
    let lastObservedAt = startedAt;
    let partial = false;
    const partialDomains = new Set<string>();

    const append = (
      domain: 'actions' | 'dependabot' | 'codespaces',
      items: readonly ConfigurationItem[],
      configurationKind: 'secret' | 'variable',
      level: 'organization' | 'repository',
      repositoryId: string | null,
      operation: string,
      observedAt: string,
    ) => {
      for (const item of items) {
        const accessMode =
          level === 'repository'
            ? ('inherited' as const)
            : item.visibility === 'all'
              ? ('all_repositories' as const)
              : item.visibility === 'private'
                ? ('private_repositories' as const)
                : item.visibility === 'selected'
                  ? ('selected_repositories' as const)
                  : ('unknown' as const);
        entities.push({
          id: `org:${context.organizationId}:configuration:${domain}:${level}:${repositoryId ?? 'org'}:${configurationKind}:${item.name}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation,
            observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'configuration-metadata',
          domain,
          configurationKind,
          name: item.name,
          level,
          repositoryId,
          environmentName: null,
          parentId: repositoryId,
          accessMode,
          selectedRepositoryIds: [],
          selectedRepositoryCount: {
            value: null,
            unit: 'count',
            availability: 'unknown',
            reason:
              'Selected repository membership was not returned by the list endpoint',
          },
          createdAt: item.created_at ?? null,
          updatedAt: item.updated_at ?? null,
        });
      }
    };
    const collectScope = async (
      domain: 'actions' | 'dependabot' | 'codespaces',
      kind: 'secret' | 'variable',
      level: 'organization' | 'repository',
      repository: Extract<Entity, { kind: 'repository' }> | null,
    ) => {
      const suffix = kind === 'secret' ? 'secrets' : 'variables';
      const operation = `rest.${domain}.list-${level === 'organization' ? 'org' : 'repo'}-${suffix}`;
      try {
        const result = await context.adapter.fetchAll<ConfigurationItem>(
          {
            id: operation,
            transport: 'rest',
            verifiedReadOnly: true,
            path:
              level === 'organization'
                ? `/orgs/{org}/${domain}/${suffix}`
                : `/repos/{owner}/{repo}/${domain}/${suffix}`,
            pathParams:
              level === 'organization'
                ? { org: context.organizationId }
                : { owner: context.organizationId, repo: repository!.name },
          },
          context.signal,
        );
        lastObservedAt = result.observedAt;
        append(
          domain,
          extractItems(result.items),
          kind,
          level,
          repository?.id ?? null,
          operation,
          result.observedAt,
        );
      } catch (err) {
        if (!context.configuration.continueOnError) {
          throw err;
        }
        partial = true;
        partialDomains.add(domain);
        errors.push({
          code: 'permission_denied',
          message: `Configuration metadata scope for ${domain} was inaccessible`,
          retryable: false,
        });
      }
    };
    await collectScope('actions', 'secret', 'organization', null);
    await collectScope('actions', 'variable', 'organization', null);
    await collectScope('dependabot', 'secret', 'organization', null);
    await collectScope('codespaces', 'secret', 'organization', null);
    for (const repo of context.sharedState?.repositories ?? []) {
      if (context.signal.aborted)
        throw context.signal.reason ?? new Error('Aborted');
      if (repo.archived) continue;
      await collectScope('actions', 'secret', 'repository', repo);
      await collectScope('actions', 'variable', 'repository', repo);
      await collectScope('dependabot', 'secret', 'repository', repo);
      await collectScope('codespaces', 'secret', 'repository', repo);
    }

    const domainCoverage = [
      [
        'actions',
        partialDomains.has('actions') ? 'partial' : 'complete',
        partialDomains.has('actions')
          ? 'One or more Actions scopes were inaccessible'
          : 'Actions metadata collection completed',
      ],
      [
        'dependabot',
        partialDomains.has('dependabot') ? 'partial' : 'complete',
        partialDomains.has('dependabot')
          ? 'One or more Dependabot scopes were inaccessible'
          : 'Dependabot metadata collection completed',
      ],
      [
        'codespaces',
        partialDomains.has('codespaces') ? 'partial' : 'complete',
        partialDomains.has('codespaces')
          ? 'One or more Codespaces scopes were inaccessible'
          : 'Codespaces metadata collection completed',
      ],
      [
        'environment',
        partialDomains.has('environment') ? 'partial' : 'complete',
        partialDomains.has('environment')
          ? 'One or more Environment scopes were inaccessible'
          : 'Environment metadata collection completed',
      ],
      [
        'copilot',
        'unsupported',
        'No verified agent secret API and permission model is enabled',
      ],
    ] as const;
    for (const [domain, state, reason] of domainCoverage)
      entities.push({
        id: `org:${context.organizationId}:configuration-coverage:${domain}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'configuration-domain-coverage',
          observedAt: lastObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'configuration-coverage',
        domain,
        state,
        reason,
      });

    const completedAt = new Date().toISOString();
    return {
      execution: {
        id: context.executionId,
        module: 'actions-secrets',
        organizationId: context.organizationId,
        status: partial ? 'partial' : 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'configuration-metadata-only',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: partial
          ? ['Some configuration metadata scopes were inaccessible']
          : [],
        errors,
        coverage: {
          state: partial ? 'partial' : 'complete',
          observed: entities.length,
          expected: partial ? null : entities.length,
          reason: partial
            ? 'One or more metadata scopes were inaccessible'
            : null,
        },
      },
      entities,
      organizations: [],
    };
  },
};
