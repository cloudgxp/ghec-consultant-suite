import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ProjectsV2MigrationModule,
  type ProjectsV2Data,
  type RawGraphQLOrgProjectsV2Response,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type { MigrationContext } from '../../src/core/types.js';
import type {
  EndpointProbeResult,
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockGraphQLReadAdapter implements GitHubReadAdapter {
  constructor(private readonly graphQLData: unknown) {}

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    if (this.graphQLData instanceof Error) {
      throw this.graphQLData;
    }
    return {
      data: this.graphQLData as T,
      observedAt: new Date().toISOString(),
    };
  }

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented in mock');
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    throw new Error('Not implemented in mock');
  }

  async fetchAll<T>(): Promise<{
    items: T[];
    totalCount?: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented in mock');
  }

  async probeEndpoint(): Promise<EndpointProbeResult> {
    return { status: 200 };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly mutations: TargetWriteOperation[] = [];
  shouldFail = false;

  async mutate(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: unknown }> {
    if (this.shouldFail) {
      throw new Error(`Simulated mutation failure for ${op.id}`);
    }
    this.mutations.push(op);
    if (op.body && typeof op.body === 'object' && 'query' in op.body) {
      const q = (op.body as { query: string }).query;
      if (q.includes('CreateProjectV2(')) {
        return {
          status: 200,
          data: {
            createProjectV2: {
              projectV2: {
                id: 'new_target_proj_id_99',
                number: 1,
                title: 'Product Roadmap 2026',
                url: 'https://github.com/orgs/target-emu-org/projects/1',
              },
            },
          },
        };
      }
      if (q.includes('CreateProjectV2Field(')) {
        return {
          status: 200,
          data: {
            createProjectV2Field: {
              projectV2Field: {
                id: 'new_field_id_101',
                name: 'Priority',
                dataType: 'SINGLE_SELECT',
              },
            },
          },
        };
      }
    }
    return { status: 200, data: {} };
  }
}

function createContext(
  sourceGraphQL: unknown,
  targetGraphQL: unknown,
  writeClient?: TargetWriteClient,
  dryRun = false,
  continueOnError = false,
): { ctx: MigrationContext; writeClient: MockWriteClient } {
  const writer = (writeClient ?? new MockWriteClient()) as MockWriteClient;
  const ctx: MigrationContext = {
    runId: 'test-run-proj-v2',
    scope: {
      level: 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-emu-org',
    },
    sourceClient: new MockGraphQLReadAdapter(sourceGraphQL),
    targetClient: new MockGraphQLReadAdapter(targetGraphQL),
    targetWriteClient: writer,
    signal: new AbortController().signal,
    dryRun,
    continueOnError,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
  return { ctx, writeClient: writer };
}

const sampleSourceProjectsResponse: RawGraphQLOrgProjectsV2Response = {
  organization: {
    id: 'org_node_source',
    projectsV2: {
      nodes: [
        {
          id: 'proj_source_1',
          number: 1,
          title: 'Product Roadmap 2026',
          shortDescription: 'Core platform roadmap',
          closed: false,
          public: false,
          fields: {
            nodes: [
              {
                id: 'field_title',
                name: 'Title',
                dataType: 'TITLE',
              },
              {
                id: 'field_status',
                name: 'Status',
                dataType: 'SINGLE_SELECT',
                options: [
                  {
                    id: 'opt_1',
                    name: 'Todo',
                    color: 'GRAY',
                    description: 'Not started',
                  },
                  {
                    id: 'opt_2',
                    name: 'In Progress',
                    color: 'BLUE',
                    description: 'Underway',
                  },
                  {
                    id: 'opt_3',
                    name: 'Done',
                    color: 'GREEN',
                    description: 'Finished',
                  },
                ],
              },
              {
                id: 'field_priority',
                name: 'Priority',
                dataType: 'SINGLE_SELECT',
                options: [
                  {
                    id: 'opt_p1',
                    name: 'P0',
                    color: 'RED',
                    description: 'Urgent',
                  },
                  {
                    id: 'opt_p2',
                    name: 'P1',
                    color: 'ORANGE',
                    description: 'High',
                  },
                ],
              },
              {
                id: 'field_target_date',
                name: 'Target Date',
                dataType: 'DATE',
              },
            ],
          },
        },
      ],
    },
  },
};

describe('ProjectsV2MigrationModule', () => {
  it('instantiates and provides valid metadata', () => {
    const mod = new ProjectsV2MigrationModule();
    assert.equal(mod.id, 'projects-v2');
    assert.equal(mod.displayName, 'Projects v2 (Memex)');
    assert.equal(mod.scopeLevel, 'organization');
    assert.deepEqual(mod.dependencies, ['org-settings']);
  });

  it('discover queries GraphQL and parses projects and fields', async () => {
    const mod = new ProjectsV2MigrationModule();
    const { ctx } = createContext(sampleSourceProjectsResponse, {});

    const discovered = await mod.discover(ctx);
    assert.equal(discovered.org, 'source-org');
    assert.equal(discovered.orgNodeId, 'org_node_source');
    assert.equal(discovered.projects.length, 1);

    const project = discovered.projects[0];
    assert.ok(project);
    assert.equal(project.title, 'Product Roadmap 2026');
    assert.equal(project.shortDescription, 'Core platform roadmap');
    assert.equal(project.closed, false);
    assert.equal(project.fields.length, 4);

    const priorityField = project.fields.find((f) => f.name === 'Priority');
    assert.ok(priorityField);
    assert.equal(priorityField.dataType, 'SINGLE_SELECT');
    assert.equal(priorityField.options?.length, 2);
    assert.equal(priorityField.options[0]?.name, 'P0');
  });

  it('discover handles GraphQL failure with descriptive error', async () => {
    const mod = new ProjectsV2MigrationModule();
    const { ctx } = createContext(new Error('GraphQL timeout'), {});

    await assert.rejects(
      async () => mod.discover(ctx),
      (err: Error) => {
        assert.match(err.message, /Failed to discover projects-v2/);
        assert.match(err.message, /GraphQL timeout/);
        return true;
      },
    );
  });

  it('plan generates create operations when destination has no projects', async () => {
    const mod = new ProjectsV2MigrationModule();
    const targetEmptyResponse: RawGraphQLOrgProjectsV2Response = {
      organization: {
        id: 'org_node_target',
        projectsV2: {
          nodes: [],
        },
      },
    };
    const { ctx } = createContext({}, targetEmptyResponse);

    const sourceData: ProjectsV2Data = {
      org: 'source-org',
      orgNodeId: 'org_node_source',
      projects: [
        {
          id: 'proj_source_1',
          number: 1,
          title: 'Product Roadmap 2026',
          shortDescription: 'Core platform roadmap',
          closed: false,
          public: false,
          fields: [
            { id: 'f_title', name: 'Title', dataType: 'TITLE' },
            { id: 'f_status', name: 'Status', dataType: 'SINGLE_SELECT' },
            { id: 'f_prio', name: 'Priority', dataType: 'SINGLE_SELECT' },
            { id: 'f_date', name: 'Target Date', dataType: 'DATE' },
          ],
        },
      ],
    };

    const plan = await mod.plan(ctx, sourceData);
    assert.equal(plan.moduleId, 'projects-v2');
    assert.equal(plan.scopeLevel, 'organization');
    assert.equal(plan.targetIdentifier, 'target-emu-org');

    // Should create project + 2 custom fields (Priority and Target Date; skipping Title and Status which are built-in)
    assert.equal(plan.operations.length, 3);

    const projOp = plan.operations.find(
      (op) => op.resourceType === 'project_v2',
    );
    assert.ok(projOp);
    assert.equal(projOp.operation, 'create');
    assert.equal(projOp.resourceName, 'Product Roadmap 2026');

    const prioFieldOp = plan.operations.find(
      (op) =>
        op.resourceType === 'project_v2_field' &&
        op.resourceName === 'Product Roadmap 2026:Priority',
    );
    assert.ok(prioFieldOp);
    assert.equal(prioFieldOp.operation, 'create');
  });

  it('plan generates noop when destination already has matching project and fields', async () => {
    const mod = new ProjectsV2MigrationModule();
    const targetExistingResponse: RawGraphQLOrgProjectsV2Response = {
      organization: {
        id: 'org_node_target',
        projectsV2: {
          nodes: [
            {
              id: 'target_proj_1',
              number: 1,
              title: 'Product Roadmap 2026',
              closed: false,
              public: false,
              fields: {
                nodes: [
                  { id: 'f_t', name: 'Title', dataType: 'TITLE' },
                  { id: 'f_s', name: 'Status', dataType: 'SINGLE_SELECT' },
                  { id: 'f_p', name: 'Priority', dataType: 'SINGLE_SELECT' },
                  { id: 'f_d', name: 'Target Date', dataType: 'DATE' },
                ],
              },
            },
          ],
        },
      },
    };
    const { ctx } = createContext({}, targetExistingResponse);

    const sourceData: ProjectsV2Data = {
      org: 'source-org',
      projects: [
        {
          id: 'proj_source_1',
          number: 1,
          title: 'Product Roadmap 2026',
          closed: false,
          public: false,
          fields: [
            { id: 'f_t', name: 'Title', dataType: 'TITLE' },
            { id: 'f_s', name: 'Status', dataType: 'SINGLE_SELECT' },
            { id: 'f_p', name: 'Priority', dataType: 'SINGLE_SELECT' },
            { id: 'f_d', name: 'Target Date', dataType: 'DATE' },
          ],
        },
      ],
    };

    const plan = await mod.plan(ctx, sourceData);
    assert.equal(plan.operations.length, 5); // 1 project noop + 4 fields noop
    for (const op of plan.operations) {
      assert.equal(op.operation, 'noop');
    }
  });

  it('apply honors dryRun and does not call mutations', async () => {
    const mod = new ProjectsV2MigrationModule();
    const { ctx, writeClient } = createContext({}, {}, undefined, true);

    const plan = {
      moduleId: 'projects-v2',
      scopeLevel: 'organization' as const,
      targetIdentifier: 'target-emu-org',
      operations: [
        {
          id: 'op-create-project-v2-product-roadmap-2026',
          resourceType: 'project_v2',
          resourceName: 'Product Roadmap 2026',
          operation: 'create' as const,
          payload: {
            org: 'target-emu-org',
            ownerId: 'org_target_id',
            title: 'Product Roadmap 2026',
          },
        },
      ],
      warnings: [],
    };

    const res = await mod.apply(ctx, plan);
    assert.equal(res.status, 'complete');
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]?.status, 'succeeded');
    assert.equal(writeClient.mutations.length, 0);
  });

  it('apply executes mutations in live mode and links field to created project', async () => {
    const mod = new ProjectsV2MigrationModule();
    const { ctx, writeClient } = createContext({}, {}, undefined, false);

    const plan = {
      moduleId: 'projects-v2',
      scopeLevel: 'organization' as const,
      targetIdentifier: 'target-emu-org',
      operations: [
        {
          id: 'op-create-project-v2-product-roadmap-2026',
          resourceType: 'project_v2',
          resourceName: 'Product Roadmap 2026',
          operation: 'create' as const,
          payload: {
            org: 'target-emu-org',
            ownerId: 'org_target_id',
            title: 'Product Roadmap 2026',
          },
        },
        {
          id: 'op-create-project-v2-field-product-roadmap-2026-priority',
          resourceType: 'project_v2_field',
          resourceName: 'Product Roadmap 2026:Priority',
          operation: 'create' as const,
          payload: {
            org: 'target-emu-org',
            projectTitle: 'Product Roadmap 2026',
            name: 'Priority',
            dataType: 'SINGLE_SELECT',
            singleSelectOptions: [
              { name: 'P0', color: 'RED' },
              { name: 'P1', color: 'BLUE' },
            ],
          },
        },
      ],
      warnings: [],
    };

    const res = await mod.apply(ctx, plan);
    assert.equal(res.status, 'complete');
    assert.equal(res.results.length, 2);
    assert.equal(res.results[0]?.status, 'succeeded');
    assert.equal(res.results[1]?.status, 'succeeded');
    assert.equal(writeClient.mutations.length, 2);

    const projMutation = writeClient.mutations[0];
    assert.ok(projMutation);
    const body0 = projMutation.body as {
      variables: { input: { ownerId: string; title: string } };
    };
    assert.equal(body0.variables.input.ownerId, 'org_target_id');
    assert.equal(body0.variables.input.title, 'Product Roadmap 2026');

    const fieldMutation = writeClient.mutations[1];
    assert.ok(fieldMutation);
    const body1 = fieldMutation.body as {
      variables: {
        input: { projectId: string; name: string; dataType: string };
      };
    };
    // Field should have received the newly created project ID 'new_target_proj_id_99'
    assert.equal(body1.variables.input.projectId, 'new_target_proj_id_99');
    assert.equal(body1.variables.input.name, 'Priority');
    assert.equal(body1.variables.input.dataType, 'SINGLE_SELECT');
  });

  it('verify reports verified=true when all expected projects and fields exist', async () => {
    const mod = new ProjectsV2MigrationModule();
    const targetResponse: RawGraphQLOrgProjectsV2Response = {
      organization: {
        id: 'org_target_id',
        projectsV2: {
          nodes: [
            {
              id: 'p1',
              number: 1,
              title: 'Product Roadmap 2026',
              closed: false,
              public: false,
              fields: {
                nodes: [
                  { id: 'f1', name: 'Priority', dataType: 'SINGLE_SELECT' },
                ],
              },
            },
          ],
        },
      },
    };
    const { ctx } = createContext({}, targetResponse);

    const plan = {
      moduleId: 'projects-v2',
      scopeLevel: 'organization' as const,
      targetIdentifier: 'target-emu-org',
      operations: [
        {
          id: 'op1',
          resourceType: 'project_v2',
          resourceName: 'Product Roadmap 2026',
          operation: 'create' as const,
        },
        {
          id: 'op2',
          resourceType: 'project_v2_field',
          resourceName: 'Product Roadmap 2026:Priority',
          operation: 'create' as const,
        },
      ],
      warnings: [],
    };

    const vResult = await mod.verify(ctx, plan);
    assert.equal(vResult.verified, true);
    assert.equal(vResult.discrepancies.length, 0);
  });

  it('verify reports discrepancies when expected projects or fields are missing', async () => {
    const mod = new ProjectsV2MigrationModule();
    const targetEmptyResponse: RawGraphQLOrgProjectsV2Response = {
      organization: {
        id: 'org_target_id',
        projectsV2: {
          nodes: [],
        },
      },
    };
    const { ctx } = createContext({}, targetEmptyResponse);

    const plan = {
      moduleId: 'projects-v2',
      scopeLevel: 'organization' as const,
      targetIdentifier: 'target-emu-org',
      operations: [
        {
          id: 'op1',
          resourceType: 'project_v2',
          resourceName: 'Product Roadmap 2026',
          operation: 'create' as const,
        },
        {
          id: 'op2',
          resourceType: 'project_v2_field',
          resourceName: 'Product Roadmap 2026:Priority',
          operation: 'create' as const,
        },
      ],
      warnings: [],
    };

    const vResult = await mod.verify(ctx, plan);
    assert.equal(vResult.verified, false);
    assert.equal(vResult.discrepancies.length, 2);
    assert.match(
      vResult.discrepancies[0]?.message ?? '',
      /missing on target organization/,
    );
  });
});
