import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultModuleRegistry,
  CustomRolesMigrationModule,
  type CustomOrganizationRoleDefinition,
  type CustomRepositoryRoleDefinition,
  type CustomRolesMigrationData,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly repoRoles: unknown[];
  private readonly orgRoles: unknown[];

  constructor(repoRoles: unknown[] = [], orgRoles: unknown[] = []) {
    this.repoRoles = repoRoles;
    this.orgRoles = orgRoles;
  }

  async readSingle<T>(op: {
    path: string;
    pathParams?: Record<string, string>;
  }): Promise<{ data: T; status: number; observedAt: string }> {
    let resolvedPath = op.path;
    if (op.pathParams) {
      for (const [k, v] of Object.entries(op.pathParams)) {
        resolvedPath = resolvedPath.replace(`{${k}}`, v);
      }
    }

    if (resolvedPath.includes('/custom-repository-roles')) {
      return {
        data: {
          total_count: this.repoRoles.length,
          custom_roles: this.repoRoles,
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    if (resolvedPath.includes('/organization-roles')) {
      return {
        data: {
          total_count: this.orgRoles.length,
          roles: this.orgRoles,
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    return {
      data: {} as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    throw new Error('Not implemented');
  }

  async fetchAll<T>(): Promise<{
    items: T[];
    totalCount?: number;
    observedAt: string;
  }> {
    throw new Error('Not implemented');
  }

  async graphql<T>(): Promise<GraphQLResponse<T>> {
    throw new Error('Not implemented');
  }

  async checkEndpoint(): Promise<never> {
    throw new Error('Not implemented');
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  async mutate<T>(
    op: TargetWriteOperation,
  ): Promise<{ data: T; status: number; headers: Record<string, string> }> {
    this.calls.push(op);
    return {
      data: { id: 123 } as unknown as T,
      status: 201,
      headers: {},
    };
  }
}

test('CustomRolesMigrationModule metadata and registry integration', () => {
  const module = new CustomRolesMigrationModule();
  assert.equal(module.id, 'custom-roles');
  assert.equal(module.scopeLevel, 'organization');
  assert.equal(module.displayName, 'Custom Organization & Repository Roles');
  assert.deepEqual(module.dependencies, []);

  const registry = createDefaultModuleRegistry();
  assert.ok(registry.has('custom-roles'));
  assert.equal(registry.get('custom-roles')?.id, 'custom-roles');
});

test('CustomRolesMigrationModule discover parses repo and org roles accurately', async () => {
  const module = new CustomRolesMigrationModule();
  const sourceRepoRoles = [
    {
      id: 1,
      name: 'triage-plus',
      description: 'Triage with extra PR permissions',
      base_role: 'triage',
      permissions: ['reopen_issue', 'close_issue'],
    },
  ];
  const sourceOrgRoles = [
    {
      id: 10,
      name: 'security-auditor',
      description: 'Audit logs reviewer',
      permissions: ['read_audit_log'],
    },
  ];

  const ctx = {
    scope: {
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      level: 'organization' as const,
    },
    sourceClient: new MockReadAdapter(sourceRepoRoles, sourceOrgRoles),
    targetClient: new MockReadAdapter([], []),
    signal: new AbortController().signal,
  } as unknown as MigrationContext;

  const data = await module.discover(ctx);
  assert.equal(data.organization, 'src-org');
  assert.equal(data.repositoryRoles.length, 1);
  assert.equal(data.repositoryRoles[0]?.name, 'triage-plus');
  assert.equal(data.repositoryRoles[0]?.baseRole, 'triage');
  assert.deepEqual(data.repositoryRoles[0]?.permissions, [
    'close_issue',
    'reopen_issue',
  ]);

  assert.equal(data.organizationRoles.length, 1);
  assert.equal(data.organizationRoles[0]?.name, 'security-auditor');
  assert.deepEqual(data.organizationRoles[0]?.permissions, ['read_audit_log']);
});

test('CustomRolesMigrationModule plan computes create, update, and noop operations', async () => {
  const module = new CustomRolesMigrationModule();

  const sourceData: CustomRolesMigrationData = {
    organization: 'src-org',
    repositoryRoles: [
      {
        name: 'new-repo-role',
        description: 'New role',
        baseRole: 'write',
        permissions: ['delete_alert'],
      },
      {
        name: 'matching-repo-role',
        description: 'Matching role',
        baseRole: 'read',
        permissions: ['view_code'],
      },
      {
        name: 'drifted-repo-role',
        description: 'Needs update',
        baseRole: 'write',
        permissions: ['push_branch'],
      },
    ],
    organizationRoles: [
      {
        name: 'new-org-role',
        description: 'New org role',
        permissions: ['manage_runners'],
      },
      {
        name: 'matching-org-role',
        description: 'Matching org role',
        permissions: ['read_audit_log'],
      },
    ],
  };

  const targetRepoRoles = [
    {
      id: 2,
      name: 'matching-repo-role',
      description: 'Matching role',
      base_role: 'read',
      permissions: ['view_code'],
    },
    {
      id: 3,
      name: 'drifted-repo-role',
      description: 'Old description',
      base_role: 'triage',
      permissions: ['view_code'],
    },
  ];

  const targetOrgRoles = [
    {
      id: 20,
      name: 'matching-org-role',
      description: 'Matching org role',
      permissions: ['read_audit_log'],
    },
  ];

  const ctx = {
    scope: {
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      level: 'organization' as const,
    },
    sourceClient: new MockReadAdapter(),
    targetClient: new MockReadAdapter(targetRepoRoles, targetOrgRoles),
    signal: new AbortController().signal,
  } as unknown as MigrationContext;

  const plan = await module.plan(ctx, sourceData);
  assert.equal(plan.moduleId, 'custom-roles');

  const createOps = plan.operations.filter((op) => op.operation === 'create');
  assert.equal(createOps.length, 2);
  assert.ok(createOps.some((op) => op.resourceName === 'new-repo-role'));
  assert.ok(createOps.some((op) => op.resourceName === 'new-org-role'));

  const updateOps = plan.operations.filter((op) => op.operation === 'update');
  assert.equal(updateOps.length, 1);
  assert.equal(updateOps[0]?.resourceName, 'drifted-repo-role');

  const noopOps = plan.operations.filter((op) => op.operation === 'noop');
  assert.equal(noopOps.length, 2);
  assert.ok(noopOps.some((op) => op.resourceName === 'matching-repo-role'));
  assert.ok(noopOps.some((op) => op.resourceName === 'matching-org-role'));
});

test('CustomRolesMigrationModule apply executes dry-run and real mutations', async () => {
  const module = new CustomRolesMigrationModule();
  const writeClient = new MockWriteClient();

  const repoRole: CustomRepositoryRoleDefinition = {
    name: 'custom-repo-role',
    description: 'Custom repository role',
    baseRole: 'write',
    permissions: ['write_code'],
  };

  const orgRole: CustomOrganizationRoleDefinition = {
    name: 'custom-org-role',
    description: 'Custom org role',
    permissions: ['read_audit_log'],
  };

  const plan = {
    moduleId: 'custom-roles',
    scopeLevel: 'organization' as const,
    targetIdentifier: 'dst-org',
    operations: [
      {
        id: 'op-repo-create',
        resourceType: 'custom-repository-role',
        resourceName: 'custom-repo-role',
        operation: 'create' as const,
        sourceState: repoRole,
      },
      {
        id: 'op-org-create',
        resourceType: 'custom-organization-role',
        resourceName: 'custom-org-role',
        operation: 'create' as const,
        sourceState: orgRole,
      },
      {
        id: 'op-noop',
        resourceType: 'custom-repository-role',
        resourceName: 'noop-role',
        operation: 'noop' as const,
      },
    ],
    warnings: [],
  };

  // 1. Dry run
  const dryRunCtx = {
    scope: {
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      level: 'organization' as const,
    },
    dryRun: true,
    targetWriteClient: writeClient,
  } as unknown as MigrationContext;

  const dryResult = await module.apply(dryRunCtx, plan);
  assert.equal(dryResult.status, 'complete');
  assert.equal(writeClient.calls.length, 0);

  // 2. Real run
  const liveCtx = {
    scope: {
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      level: 'organization' as const,
    },
    dryRun: false,
    targetWriteClient: writeClient,
  } as unknown as MigrationContext;

  const liveResult = await module.apply(liveCtx, plan);
  assert.equal(liveResult.status, 'complete');
  assert.equal(writeClient.calls.length, 2);

  const repoCall = writeClient.calls.find(
    (c) => c.path === '/orgs/{org}/custom-repository-roles',
  );
  assert.ok(repoCall);
  assert.equal(repoCall.method, 'POST');
  assert.equal(
    (repoCall.body as Record<string, unknown>).name,
    'custom-repo-role',
  );

  const orgCall = writeClient.calls.find(
    (c) => c.path === '/orgs/{org}/organization-roles',
  );
  assert.ok(orgCall);
  assert.equal(orgCall.method, 'POST');
  assert.equal(
    (orgCall.body as Record<string, unknown>).name,
    'custom-org-role',
  );
});

test('CustomRolesMigrationModule verify detects missing roles and mismatches', async () => {
  const module = new CustomRolesMigrationModule();

  const plan = {
    moduleId: 'custom-roles',
    scopeLevel: 'organization' as const,
    targetIdentifier: 'dst-org',
    operations: [
      {
        id: 'op-1',
        resourceType: 'custom-repository-role',
        resourceName: 'matched-role',
        operation: 'create' as const,
        sourceState: {
          name: 'matched-role',
          baseRole: 'read',
          permissions: ['view_code'],
        },
      },
      {
        id: 'op-2',
        resourceType: 'custom-repository-role',
        resourceName: 'mismatched-role',
        operation: 'create' as const,
        sourceState: {
          name: 'mismatched-role',
          baseRole: 'write',
          permissions: ['push_branch'],
        },
      },
      {
        id: 'op-3',
        resourceType: 'custom-organization-role',
        resourceName: 'missing-org-role',
        operation: 'create' as const,
        sourceState: {
          name: 'missing-org-role',
          permissions: ['read_audit_log'],
        },
      },
    ],
    warnings: [],
  };

  const targetRepoRoles = [
    {
      id: 1,
      name: 'matched-role',
      base_role: 'read',
      permissions: ['view_code'],
    },
    {
      id: 2,
      name: 'mismatched-role',
      base_role: 'triage', // mismatch
      permissions: ['view_code'], // mismatch
    },
  ];

  const targetOrgRoles: unknown[] = []; // missing-org-role missing

  const ctx = {
    scope: {
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
      level: 'organization' as const,
    },
    targetClient: new MockReadAdapter(targetRepoRoles, targetOrgRoles),
    signal: new AbortController().signal,
  } as unknown as MigrationContext;

  const result = await module.verify(ctx, plan);
  assert.equal(result.verified, false);
  assert.equal(result.discrepancies.length, 3); // base_role mismatch, permissions mismatch, missing org role

  assert.ok(
    result.discrepancies.some((d) => d.resourceName.includes('base_role')),
  );
  assert.ok(
    result.discrepancies.some((d) => d.resourceName.includes('permissions')),
  );
  assert.ok(
    result.discrepancies.some((d) =>
      d.resourceName.includes('missing-org-role'),
    ),
  );
});
