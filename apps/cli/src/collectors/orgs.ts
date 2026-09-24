import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface GitHubOrgResponse {
  id?: number;
  node_id?: string;
  login?: string;
  name?: string | null;
}

export const collector: Collector = {
  id: 'orgs',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const operation = {
      id: 'rest.orgs.get',
      transport: 'rest' as const,
      verifiedReadOnly: true as const,
      path: '/orgs/{org}',
      pathParams: { org: context.organizationId },
    };

    const res = await context.adapter.readSingle<GitHubOrgResponse>(
      operation,
      context.signal,
    );
    const completedAt = new Date().toISOString();
    const orgData = res.data ?? {};
    const orgLogin = orgData.login ?? context.organizationId;
    const orgId = context.organizationId;

    return {
      execution: {
        id: context.executionId,
        module: 'orgs',
        organizationId: orgId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance: [
          {
            source: 'rest',
            operation: 'rest.orgs.get',
            observedAt: res.observedAt,
            apiVersion: '2026-03-10',
          },
        ],
        warnings: [],
        errors: [],
        coverage: {
          state: 'complete',
          observed: 1,
          expected: 1,
          reason: null,
        },
      },
      entities: [],
      organizations: [
        {
          id: orgId,
          login: orgLogin,
          displayName: orgData.name ?? null,
        },
      ],
    };
  },
};
