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
    const warnings: string[] = [];
    const provenanceList: Array<{
      source: 'rest';
      operation: string;
      observedAt: string;
      apiVersion: string;
    }> = [];

    const memberOperation = {
      id: 'rest.orgs.list-members',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}/members',
      pathParams: { org: context.organizationId },
    };

    const res = await context.adapter.fetchAll<GitHubMemberItem>(
      memberOperation,
      context.signal,
    );
    provenanceList.push({
      source: 'rest',
      operation: 'rest.orgs.list-members',
      observedAt: res.observedAt,
      apiVersion: '2026-03-10',
    });

    const salt = context.salt ?? 'default-salt';
    const entities: Entity[] = [];
    const seenPseudonyms = new Set<string>();

    for (const m of res.items) {
      const pseudonym = pseudonymizeUsername(salt, m.login);
      seenPseudonyms.add(pseudonym);
      entities.push({
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
      });
    }

    // Query outside collaborators
    try {
      const outsideOperation = {
        id: 'rest.orgs.list-outside-collaborators',
        transport: 'rest' as const,
        verifiedReadOnly: true as const,
        path: '/orgs/{org}/outside_collaborators',
        pathParams: { org: context.organizationId },
      };

      const outsideRes = await context.adapter.fetchAll<GitHubMemberItem>(
        outsideOperation,
        context.signal,
      );
      provenanceList.push({
        source: 'rest',
        operation: 'rest.orgs.list-outside-collaborators',
        observedAt: outsideRes.observedAt,
        apiVersion: '2026-03-10',
      });

      for (const m of outsideRes.items) {
        const pseudonym = pseudonymizeUsername(salt, m.login);
        if (!seenPseudonyms.has(pseudonym)) {
          seenPseudonyms.add(pseudonym);
          entities.push({
            id: `org:${context.organizationId}:identity:${pseudonym}`,
            organizationId: context.organizationId,
            collectorExecutionId: context.executionId,
            provenance: {
              source: 'rest',
              operation: 'rest.orgs.list-outside-collaborators',
              observedAt: outsideRes.observedAt,
              apiVersion: '2026-03-10',
            },
            kind: 'identity',
            pseudonym,
            outsideCollaborator: true,
            ssoStatus: 'unknown',
            membership: 'outside',
          });
        }
      }
    } catch (err) {
      warnings.push(
        `Failed to fetch outside collaborators for org ${context.organizationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const completedAt = new Date().toISOString();

    return {
      execution: {
        id: context.executionId,
        module: 'users',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: provenanceList,
        warnings,
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
