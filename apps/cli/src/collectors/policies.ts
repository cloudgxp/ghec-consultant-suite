import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubRulesetItem {
  id: number;
  name: string;
  enforcement?: string;
}

export const collector: Collector = {
  id: 'policies',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.repos.get-org-rulesets',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/rulesets',
      pathParams: { org: context.organizationId },
    };

    const res = await context.adapter.fetchAll<GitHubRulesetItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();

    const entities: Entity[] = res.items.map((r) => ({
      id: `org:${context.organizationId}:policy:${r.name}`,
      organizationId: context.organizationId,
      collectorExecutionId: context.executionId,
      provenance: {
        source: 'rest',
        operation: 'rest.repos.get-org-rulesets',
        observedAt: res.observedAt,
        apiVersion: '2026-03-10',
      },
      kind: 'policy',
      repositoryId: null,
      policyKind: 'ruleset',
      name: r.name,
      enforcement:
        r.enforcement === 'active'
          ? 'active'
          : r.enforcement === 'evaluate'
            ? 'evaluate'
            : r.enforcement === 'disabled'
              ? 'disabled'
              : 'unknown',
    }));

    return {
      execution: {
        id: context.executionId,
        module: 'policies',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.repos.get-org-rulesets',
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
