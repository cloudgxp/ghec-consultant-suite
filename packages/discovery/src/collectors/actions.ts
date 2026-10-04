import type { Entity, Provenance } from '@ghec/contracts';
import type { Collector, CollectorContext, CollectorResult } from './types.js';

interface ActionsPermissionsResponse {
  enabled?: boolean;
}

interface WorkflowsResponse {
  total_count?: number;
  workflows?: Array<{
    id?: number;
    name?: string;
    path?: string;
    state?: string;
    created_at?: string;
    updated_at?: string;
  }>;
}

interface RunnerGroupsResponse {
  total_count?: number;
  runner_groups?: Array<{
    id: number;
    name: string;
    visibility?: string;
    allows_public_repositories?: boolean;
    default?: boolean;
    runners_url?: string;
    inherited?: boolean;
  }>;
}

interface RunnersResponse {
  total_count?: number;
  runners?: Array<{
    id: number;
    name: string;
    os?: string;
    status?: string;
    busy?: boolean;
    labels?: Array<{ id?: number; name?: string; type?: string }>;
  }>;
}

interface WorkflowPermissionsResponse {
  default_workflow_permissions?: string;
  can_approve_pull_request_reviews?: boolean;
}

export const collector: Collector = {
  id: 'actions',
  implementation: 'implemented',
  async collect(context: CollectorContext): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const repos = context.sharedState?.repositories ?? [];
    let lastObservedAt = startedAt;
    const provenanceList: Provenance[] = [];

    const entities: Entity[] = [];

    // 1. Collect repository-level Actions permissions & workflows first (retaining entities[0] stability)
    for (const repo of repos) {
      if (context.signal.aborted) {
        throw context.signal.reason ?? new Error('Aborted');
      }

      let enabled = false;
      let workflowCount = 0;
      let workflowNames: string[] = [];
      let workflows: NonNullable<WorkflowsResponse['workflows']> = [];
      let repoObservedAt = startedAt;

      if (!repo.archived) {
        try {
          const permRes =
            await context.adapter.readSingle<ActionsPermissionsResponse>(
              {
                id: 'rest.actions.get-github-actions-permissions-repository',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/repos/{owner}/{repo}/actions/permissions',
                pathParams: {
                  owner: context.organizationId,
                  repo: repo.name,
                },
              },
              context.signal,
            );
          enabled = Boolean(permRes.data?.enabled ?? true);
          repoObservedAt = permRes.observedAt;
          lastObservedAt = permRes.observedAt;
        } catch {
          enabled = false;
        }

        try {
          const wfRes = await context.adapter.readSingle<
            WorkflowsResponse | Array<{ name?: string }>
          >(
            {
              id: 'rest.actions.list-repo-workflows',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}/actions/workflows',
              pathParams: {
                owner: context.organizationId,
                repo: repo.name,
              },
            },
            context.signal,
          );
          if (Array.isArray(wfRes.data)) {
            workflows = wfRes.data;
            workflowNames = workflows
              .map((w) => w.name)
              .filter((n): n is string => Boolean(n));
            workflowCount = workflowNames.length;
          } else if (wfRes.data && Array.isArray(wfRes.data.workflows)) {
            workflows = wfRes.data.workflows;
            workflowNames = workflows
              .map((w) => w.name)
              .filter((n): n is string => Boolean(n));
            workflowCount = wfRes.data.total_count ?? workflowNames.length;
          }
          lastObservedAt = wfRes.observedAt;
        } catch {
          // Workflows could be empty or disabled
        }
      }

      entities.push({
        id: `org:${context.organizationId}:actions:${repo.name}`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.actions.get-github-actions-permissions-repository',
          observedAt: repoObservedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'actions',
        repositoryId: repo.id,
        enabled,
        workflowCount: {
          value: workflowCount,
          unit: 'count',
          availability: 'observed',
          reason: null,
        },
        runnerCount: {
          value: null,
          unit: 'count',
          availability: 'unknown',
          reason: 'Runner inventory was not collected for this repository',
        },
        usage: {
          value: null,
          unit: 'minutes',
          availability: 'unknown',
          reason: 'Actions usage was not returned by workflow metadata',
        },
        workflowNames,
        runnerTypes: ['unknown'],
      });

      workflows.forEach((workflow, index) => {
        const workflowId = workflow.id ?? index;
        entities.push({
          id: `org:${context.organizationId}:workflow:${repo.name}:${workflowId}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.actions.list-repo-workflows',
            observedAt: lastObservedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'action-workflow',
          repositoryId: repo.id,
          name: workflow.name ?? `workflow-${workflowId}`,
          path: workflow.path ?? null,
          state:
            workflow.state === 'active'
              ? 'active'
              : workflow.state?.startsWith('disabled')
                ? 'disabled'
                : 'unknown',
          reusable: workflow.path?.includes('workflow_call') ? true : null,
          createdAt: workflow.created_at ?? null,
          updatedAt: workflow.updated_at ?? null,
          lastRunAt: null,
          runCount: {
            value: null,
            unit: 'count',
            availability: 'unknown',
            reason: 'Run activity was not collected by the metadata request',
          },
        });
      });
    }

    // 2. Organization Default Workflow Permissions Policy
    try {
      const polRes =
        await context.adapter.readSingle<WorkflowPermissionsResponse>(
          {
            id: 'rest.actions.get-default-workflow-permissions',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/permissions/workflow',
            pathParams: { org: context.organizationId },
          },
          context.signal,
        );
      lastObservedAt = polRes.observedAt;
      provenanceList.push({
        source: 'rest',
        operation: 'rest.actions.get-default-workflow-permissions',
        observedAt: polRes.observedAt,
        apiVersion: '2026-03-10',
      });

      const rawPerm = polRes.data?.default_workflow_permissions?.toLowerCase();
      const defaultTokenPermission =
        rawPerm === 'write' ? 'write' : rawPerm === 'read' ? 'read' : 'unknown';

      entities.push({
        id: `org:${context.organizationId}:action-policy:default-workflow-permissions`,
        organizationId: context.organizationId,
        collectorExecutionId: context.executionId,
        provenance: {
          source: 'rest',
          operation: 'rest.actions.get-default-workflow-permissions',
          observedAt: polRes.observedAt,
          apiVersion: '2026-03-10',
        },
        kind: 'action-policy',
        repositoryId: null,
        allowedActions: 'all',
        defaultTokenPermission,
        canApprovePullRequests:
          polRes.data?.can_approve_pull_request_reviews ?? null,
        forkPolicy: 'unknown',
      });
    } catch {
      // Default workflow permissions not accessible or not available
    }

    // 3. Organization Self-Hosted Runner Groups
    try {
      const rgRes = await context.adapter.readSingle<
        | RunnerGroupsResponse
        | Array<{ id: number; name: string; visibility?: string }>
      >(
        {
          id: 'rest.actions.list-self-hosted-runner-groups-for-org',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/actions/runner-groups',
          pathParams: { org: context.organizationId },
        },
        context.signal,
      );
      lastObservedAt = rgRes.observedAt;
      provenanceList.push({
        source: 'rest',
        operation: 'rest.actions.list-self-hosted-runner-groups-for-org',
        observedAt: rgRes.observedAt,
        apiVersion: '2026-03-10',
      });

      const runnerGroups = Array.isArray(rgRes.data)
        ? rgRes.data
        : (rgRes.data?.runner_groups ?? []);

      for (const rg of runnerGroups) {
        const rawVis = rg.visibility?.toLowerCase();
        const visibility =
          rawVis === 'all'
            ? 'all'
            : rawVis === 'selected'
              ? 'selected'
              : rawVis === 'private'
                ? 'private'
                : 'unknown';

        entities.push({
          id: `org:${context.organizationId}:runner-group:${rg.id}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.actions.list-self-hosted-runner-groups-for-org',
            observedAt: rgRes.observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'action-runner-group',
          name: rg.name,
          scope: 'organization',
          visibility,
          runnerCount: {
            value: null,
            unit: 'count',
            availability: 'unknown',
            reason:
              'Runner count per group requires individual runner inspection',
          },
          repositoryCount: {
            value: null,
            unit: 'count',
            availability: 'unknown',
            reason:
              'Repository count per group requires group repository listing',
          },
        });
      }
    } catch {
      // Runner groups not accessible or not configured
    }

    // 4. Organization Self-Hosted Runners
    try {
      const rRes = await context.adapter.readSingle<
        | RunnersResponse
        | Array<{
            id: number;
            name: string;
            os?: string;
            status?: string;
            busy?: boolean;
            labels?: Array<{ name?: string }>;
          }>
      >(
        {
          id: 'rest.actions.list-self-hosted-runners-for-org',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/actions/runners',
          pathParams: { org: context.organizationId },
        },
        context.signal,
      );
      lastObservedAt = rRes.observedAt;
      provenanceList.push({
        source: 'rest',
        operation: 'rest.actions.list-self-hosted-runners-for-org',
        observedAt: rRes.observedAt,
        apiVersion: '2026-03-10',
      });

      const runners = Array.isArray(rRes.data)
        ? rRes.data
        : (rRes.data?.runners ?? []);

      for (const r of runners) {
        const rawStatus = r.status?.toLowerCase();
        const status =
          rawStatus === 'online'
            ? 'online'
            : rawStatus === 'offline'
              ? 'offline'
              : 'unknown';

        const labels = (r.labels ?? [])
          .map((l) => l.name ?? '')
          .filter(Boolean);

        entities.push({
          id: `org:${context.organizationId}:runner:${r.id}`,
          organizationId: context.organizationId,
          collectorExecutionId: context.executionId,
          provenance: {
            source: 'rest',
            operation: 'rest.actions.list-self-hosted-runners-for-org',
            observedAt: rRes.observedAt,
            apiVersion: '2026-03-10',
          },
          kind: 'action-runner',
          repositoryId: null,
          runnerGroupId: null,
          name: r.name,
          runnerType: 'self-hosted',
          operatingSystem: r.os ?? null,
          labels,
          status,
          busy: Boolean(r.busy),
          customImage: null,
        });
      }
    } catch {
      // Self-hosted runners not accessible or not configured
    }

    const completedAt = new Date().toISOString();

    return {
      execution: {
        id: context.executionId,
        module: 'actions',
        organizationId: context.organizationId,
        status: 'complete',
        startedAt,
        completedAt,
        provenance:
          provenanceList.length > 0
            ? provenanceList
            : [
                {
                  source: 'rest',
                  operation:
                    'rest.actions.get-github-actions-permissions-repository',
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
