import type { Entity } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';
import { pseudonymizeUsername } from '../output/sanitizer.js';

interface GitHubMemberItem {
  id: number;
  login: string;
  role?: string;
}

export const collector: Collector = {
  id: 'users',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.orgs.list-members',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/members',
      pathParams: { org: context.organizationId },
    };

    const res = await context.adapter.fetchAll<GitHubMemberItem>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();
    const salt = context.salt ?? 'default-salt';

    const entities: Entity[] = res.items.map((m) => {
      const pseudonym = pseudonymizeUsername(salt, m.login);

      return {
        id: `org:${context.organizationId}:identity:${pseudonym}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.orgs.list-members',
          observedAt: res.observedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'identity',
        pseudonym,
        outsideCollaborator: false,
        ssoStatus: 'unknown',
        membership: m.role === 'admin' ? 'owner' : 'member',
      };
    });

    return {
      execution: {
        id: context.executionId,
        module: 'users',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.orgs.list-members',
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
