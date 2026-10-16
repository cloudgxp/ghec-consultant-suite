import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTeamRepoPermission,
  exportIdpGroupSyncBlueprint,
  IdentityMappingEngine,
  sanitizeCsvCell,
  sortTeamsTopologically,
  TeamsMigrationModule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
  type TeamDefinition,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly teams: unknown[];
  private readonly repoPerms: Map<string, unknown>;
  private readonly customHandlers: Map<string, unknown>;

  constructor(
    teams: unknown[] = [],
    repoPerms: Map<string, unknown> = new Map(),
    customHandlers: Map<string, unknown> = new Map(),
  ) {
    this.teams = teams;
    this.repoPerms = repoPerms;
    this.customHandlers = customHandlers;
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
    const handlers = Array.from(this.customHandlers.entries()).sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [pattern, val] of handlers) {
      if (resolvedPath.includes(pattern)) {
        return {
          data: val as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
    }
    for (const [key, perm] of this.repoPerms.entries()) {
      if (resolvedPath.includes(key)) {
        return {
          data: perm as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
    }
    return {
      data: {} as T,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(op: {
    path: string;
    pathParams?: Record<string, string>;
  }): Promise<ReadPage<T>> {
    let resolvedPath = op.path;
    if (op.pathParams) {
      for (const [k, v] of Object.entries(op.pathParams)) {
        resolvedPath = resolvedPath.replace(`{${k}}`, v);
      }
    }
    const handlers = Array.from(this.customHandlers.entries()).sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [pattern, val] of handlers) {
      if (resolvedPath.includes(pattern)) {
        return {
          items: (Array.isArray(val) ? val : [val]) as T[],
          nextCursor: null,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
    }
    if (op.path.endsWith('/repos') || resolvedPath.endsWith('/repos')) {
      return {
        items: [
          {
            name: 'frontend-app',
            role_name: 'admin',
          },
        ] as unknown as T[],
        nextCursor: null,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }
    return {
      items: this.teams as T[],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(op: {
    path: string;
    pathParams?: Record<string, string>;
  }): Promise<{ items: T[]; totalCount?: number; observedAt: string }> {
    const page = await this.readPage<T>(op);
    return {
      items: page.items,
      totalCount: page.items.length,
      observedAt: new Date().toISOString(),
    };
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
  private nextId = 100;

  async mutate<T>(
    operation: TargetWriteOperation,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    this.calls.push(operation);
    const id = this.nextId++;
    const slug =
      (operation.body as { name?: string })?.name
        ?.toLowerCase()
        .replace(/\s+/g, '-') ?? `team-${id}`;
    return {
      data: { id, slug } as unknown as T,
      status: 201,
      observedAt: new Date().toISOString(),
    };
  }
}

test('IdentityMappingEngine: transformations, dictionary overrides, and status tracking', () => {
  // 1. Pass-through
  const passThrough = new IdentityMappingEngine({ strategy: 'pass-through' });
  const ptRes = passThrough.mapLogin('octocat');
  assert.equal(ptRes.mappedLogin, 'octocat');
  assert.equal(ptRes.status, 'pass-through');

  // 2. EMU SAML with suffix
  const emuSaml = new IdentityMappingEngine({
    strategy: 'emu-saml',
    suffix: '_enterprise',
  });
  const emuRes = emuSaml.mapLogin('octocat');
  assert.equal(emuRes.mappedLogin, 'octocat_enterprise');
  assert.equal(emuRes.status, 'mapped');

  // Prefix handling: suffix provided without underscore
  const emuNoLeading = new IdentityMappingEngine({
    strategy: 'emu-saml',
    suffix: 'acme',
  });
  assert.equal(emuNoLeading.mapLogin('alice').mappedLogin, 'alice_acme');

  // 3. Explicit dictionary override takes priority over suffix
  const withDict = new IdentityMappingEngine({
    strategy: 'emu-saml',
    suffix: '_acme',
    mappings: {
      octocat: 'monalisa_custom',
    },
  });
  const customRes = withDict.mapLogin('octocat');
  assert.equal(customRes.mappedLogin, 'monalisa_custom');
  assert.equal(customRes.status, 'mapped');

  const normalRes = withDict.mapLogin('bob');
  assert.equal(normalRes.mappedLogin, 'bob_acme');

  // 4. Manual strategy with unmapped identity
  const manual = new IdentityMappingEngine({
    strategy: 'manual',
    mappings: { alice: 'alice_target' },
  });
  const mappedAlice = manual.mapLogin('alice');
  assert.equal(mappedAlice.status, 'mapped');
  assert.equal(mappedAlice.mappedLogin, 'alice_target');

  const unmappedBob = manual.mapLogin('bob');
  assert.equal(unmappedBob.status, 'unmapped');
  assert.match(
    unmappedBob.warning ?? '',
    /Explicit EMU dictionary mapping missing/,
  );

  // 5. Batch mapping and unmapped check
  const batch = manual.mapLogins(['alice', 'bob']);
  assert.equal(manual.hasUnmappedIdentities(batch), true);
});

test('sortTeamsTopologically: guarantees parent teams appear before child teams', () => {
  const teams: TeamDefinition[] = [
    {
      slug: 'grandchild-team',
      name: 'Grandchild Team',
      privacy: 'closed',
      parentSlug: 'child-team',
      membershipCount: 2,
      repositoryAccess: [],
    },
    {
      slug: 'child-team',
      name: 'Child Team',
      privacy: 'closed',
      parentSlug: 'root-team',
      membershipCount: 5,
      repositoryAccess: [],
    },
    {
      slug: 'root-team',
      name: 'Root Team',
      privacy: 'closed',
      membershipCount: 10,
      repositoryAccess: [],
    },
    {
      slug: 'standalone-team',
      name: 'Standalone Team',
      privacy: 'closed',
      membershipCount: 3,
      repositoryAccess: [],
    },
  ];

  const sorted = sortTeamsTopologically(teams);
  const slugs = sorted.map((t) => t.slug);

  assert.ok(slugs.indexOf('root-team') < slugs.indexOf('child-team'));
  assert.ok(slugs.indexOf('child-team') < slugs.indexOf('grandchild-team'));
});

test('IdP Group Sync Blueprint and CSV Sanitization', () => {
  // Formula injection sanitization
  assert.equal(sanitizeCsvCell('=1+1'), "'=1+1");
  assert.equal(sanitizeCsvCell('+cmd'), "'+cmd");
  assert.equal(sanitizeCsvCell('@alert'), "'@alert");
  assert.equal(sanitizeCsvCell('normal-text'), 'normal-text');
  assert.equal(sanitizeCsvCell('text, with comma'), '"text, with comma"');

  const teams: TeamDefinition[] = [
    {
      slug: 'security-team',
      name: 'Security & Compliance',
      privacy: 'closed',
      membershipCount: 12,
      repositoryAccess: [
        { repositoryName: 'core-backend', permission: 'admin' },
        { repositoryName: 'frontend-app', permission: 'pull' },
      ],
    },
  ];

  const csv = exportIdpGroupSyncBlueprint(teams, 'target-org');
  assert.match(csv, /Team Slug,Team Name,Parent Team Slug/);
  assert.match(csv, /security-team/);
  assert.match(csv, /Security & Compliance/);
  assert.match(csv, /gh-target-org-security-team/);
  assert.match(csv, /core-backend:admin; frontend-app:pull/);
});

test('deriveTeamRepoPermission maps roles and permission objects accurately', () => {
  assert.equal(
    deriveTeamRepoPermission({ name: 'r1', role_name: 'admin' }),
    'admin',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r2', role_name: 'maintain' }),
    'maintain',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r3', role_name: 'push' }),
    'push',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r4', role_name: 'triage' }),
    'triage',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r5', role_name: 'pull' }),
    'pull',
  );

  assert.equal(
    deriveTeamRepoPermission({ name: 'r6', permissions: { admin: true } }),
    'admin',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r7', permissions: { push: true } }),
    'push',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r8', permissions: { pull: true } }),
    'pull',
  );

  // Custom repository roles are preserved verbatim
  assert.equal(
    deriveTeamRepoPermission({ name: 'r9', role_name: 'triage-plus' }),
    'triage-plus',
  );
  assert.equal(
    deriveTeamRepoPermission({ name: 'r10', role_name: 'custom-ci-runner' }),
    'custom-ci-runner',
  );
});

test('TeamsMigrationModule lifecycle: discover, plan, apply, verify', async () => {
  const module = new TeamsMigrationModule();
  const writeClient = new MockWriteClient();

  const sourceTeams = [
    {
      id: 1,
      slug: 'parent-eng',
      name: 'Engineering',
      privacy: 'closed',
      description: 'Engineering parent organization',
      members_count: 20,
    },
    {
      id: 2,
      slug: 'frontend-team',
      name: 'Frontend Team',
      privacy: 'closed',
      description: 'Frontend developers',
      parent: { id: 1, slug: 'parent-eng' },
      members_count: 8,
    },
  ];

  const repoPermMap = new Map<string, unknown>();
  repoPermMap.set('frontend-team/repos/dst-org/frontend-app', {
    name: 'frontend-app',
    role_name: 'admin',
  });
  repoPermMap.set('parent-eng/repos/dst-org/frontend-app', {
    name: 'frontend-app',
    role_name: 'admin',
  });

  const ctx: MigrationContext = {
    runId: 'teams-run-1',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockReadAdapter(sourceTeams),
    targetClient: new MockReadAdapter([], repoPermMap),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  // 1. Discover
  const discovered = await module.discover(ctx);
  assert.equal(discovered.teams.length, 2);
  assert.equal(discovered.teams[0]!.slug, 'parent-eng');
  assert.equal(discovered.teams[1]!.slug, 'frontend-team');
  assert.equal(discovered.teamSlugMap['frontend-team'], 'frontend-team');

  // 2. Plan
  const plan = await module.plan(ctx, discovered);
  assert.equal(plan.moduleId, 'teams');

  // Verify parent team is planned for creation BEFORE child team
  const createOps = plan.operations.filter(
    (op) => op.resourceType === 'team' && op.operation === 'create',
  );
  assert.equal(createOps.length, 2);
  assert.equal(createOps[0]!.resourceName, 'parent-eng');
  assert.equal(createOps[1]!.resourceName, 'frontend-team');

  // Verify permission bindings are planned
  const permOps = plan.operations.filter(
    (op) => op.resourceType === 'team-repo-permission',
  );
  assert.ok(permOps.length > 0);

  // 3. Apply (simulated dry run first)
  const dryCtx: MigrationContext = { ...ctx, dryRun: true };
  const dryExecution = await module.apply(dryCtx, plan);
  assert.equal(dryExecution.status, 'complete');
  assert.equal(writeClient.calls.length, 0);

  // Live apply
  const execution = await module.apply(ctx, plan);
  assert.equal(execution.status, 'complete');
  assert.ok(writeClient.calls.length >= 2);

  // Verify POST /orgs/{org}/teams calls were made
  const postTeamCalls = writeClient.calls.filter(
    (c) => c.method === 'POST' && c.path === '/orgs/{org}/teams',
  );
  assert.equal(postTeamCalls.length, 2);

  // 4. Verify post-apply against matching state
  const targetVerifiedAdapter = new MockReadAdapter(sourceTeams, repoPermMap);
  const ctxVerified: MigrationContext = {
    ...ctx,
    targetClient: targetVerifiedAdapter,
  };

  const verification = await module.verify(ctxVerified, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});

test('TeamsMigrationModule: preserves and migrates custom repository roles on teams', async () => {
  const module = new TeamsMigrationModule();
  const writeClient = new MockWriteClient();

  const sourceTeams = [
    {
      id: 10,
      slug: 'release-managers',
      name: 'Release Managers',
      privacy: 'closed',
      description: 'Release coordinators',
      members_count: 3,
    },
  ];

  const sourceHandlers = new Map<string, unknown>();
  sourceHandlers.set('release-managers/repos', [
    {
      name: 'backend-service',
      role_name: 'deployment-approver',
    },
  ]);

  const targetRepoPerms = new Map<string, unknown>();
  targetRepoPerms.set('release-managers/repos/dst-org/backend-service', {
    name: 'backend-service',
    role_name: 'deployment-approver',
  });

  const ctx: MigrationContext = {
    runId: 'teams-custom-roles-run',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockReadAdapter(sourceTeams, new Map(), sourceHandlers),
    targetClient: new MockReadAdapter([], targetRepoPerms),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  // 1. Discover
  const discovered = await module.discover(ctx);
  assert.equal(discovered.teams.length, 1);
  assert.equal(discovered.teams[0]!.slug, 'release-managers');
  assert.equal(discovered.teams[0]!.repositoryAccess.length, 1);
  assert.equal(
    discovered.teams[0]!.repositoryAccess[0]!.permission,
    'deployment-approver',
  );

  // 2. Plan
  const plan = await module.plan(ctx, discovered);
  const permOp = plan.operations.find(
    (op) => op.resourceType === 'team-repo-permission',
  );
  assert.ok(permOp);
  assert.equal(permOp.resourceName, 'release-managers:backend-service');
  assert.equal(
    (permOp.sourceState as { permission: string }).permission,
    'deployment-approver',
  );

  // 3. Apply
  const execution = await module.apply(ctx, plan);
  assert.equal(execution.status, 'complete');

  const permMutate = writeClient.calls.find(
    (c) =>
      c.path === '/orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}' &&
      c.pathParams?.team_slug === 'release-managers',
  );
  assert.ok(permMutate);
  assert.equal(
    (permMutate.body as { permission: string }).permission,
    'deployment-approver',
  );

  // 4. Verify
  const targetVerifiedAdapter = new MockReadAdapter(
    sourceTeams,
    targetRepoPerms,
  );
  const ctxVerified: MigrationContext = {
    ...ctx,
    targetClient: targetVerifiedAdapter,
  };
  const verification = await module.verify(ctxVerified, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});

test('TeamsMigrationModule: migrates team organization roles (Security Manager & Custom Org Roles)', async () => {
  const module = new TeamsMigrationModule();
  const writeClient = new MockWriteClient();

  const sourceTeams = [
    {
      id: 20,
      slug: 'sec-ops',
      name: 'Security Operations',
      privacy: 'closed',
      description: 'SecOps team',
      members_count: 4,
    },
    {
      id: 21,
      slug: 'auditors',
      name: 'Compliance Auditors',
      privacy: 'closed',
      description: 'Auditor team',
      members_count: 2,
    },
  ];

  const sourceHandlers = new Map<string, unknown>();
  // Source Organization Roles list (predefined security_manager + custom role)
  sourceHandlers.set('/organization-roles/500/teams', [{ slug: 'sec-ops' }]);
  sourceHandlers.set('/organization-roles/501/teams', [{ slug: 'auditors' }]);
  sourceHandlers.set('/organization-roles', {
    roles: [
      {
        id: 500,
        name: 'security_manager',
        teams_url:
          'https://api.github.com/orgs/src-org/organization-roles/500/teams',
      },
      {
        id: 501,
        name: 'compliance-auditor',
        teams_url:
          'https://api.github.com/orgs/src-org/organization-roles/501/teams',
      },
    ],
  });
  sourceHandlers.set('sec-ops/repos', []);
  sourceHandlers.set('auditors/repos', []);

  const targetHandlers = new Map<string, unknown>();
  // Target Organization Roles list (role IDs 700 and 701 on target)
  targetHandlers.set('/organization-roles/700/teams', [{ slug: 'sec-ops' }]);
  targetHandlers.set('/organization-roles/701/teams', [{ slug: 'auditors' }]);
  targetHandlers.set('/organization-roles', {
    roles: [
      {
        id: 700,
        name: 'security_manager',
      },
      {
        id: 701,
        name: 'compliance-auditor',
      },
    ],
  });

  const ctx: MigrationContext = {
    runId: 'teams-org-roles-run',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockReadAdapter(sourceTeams, new Map(), sourceHandlers),
    targetClient: new MockReadAdapter([], new Map(), targetHandlers),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  // 1. Discover
  const discovered = await module.discover(ctx);
  const secTeam = discovered.teams.find((t) => t.slug === 'sec-ops');
  assert.ok(secTeam);
  assert.ok(secTeam.orgRoles?.some((r) => r.roleType === 'security_manager'));

  const auditTeam = discovered.teams.find((t) => t.slug === 'auditors');
  assert.ok(auditTeam);
  assert.ok(
    auditTeam.orgRoles?.some(
      (r) =>
        r.roleType === 'custom_org_role' && r.roleName === 'compliance-auditor',
    ),
  );

  // 2. Plan
  const plan = await module.plan(ctx, discovered);
  const secOp = plan.operations.find(
    (op) =>
      op.resourceType === 'team-org-role' &&
      op.resourceName === 'sec-ops:security_manager',
  );
  assert.ok(secOp);

  const customRoleOp = plan.operations.find(
    (op) =>
      op.resourceType === 'team-org-role' &&
      op.resourceName === 'auditors:compliance-auditor',
  );
  assert.ok(customRoleOp);

  // 3. Apply
  const execution = await module.apply(ctx, plan);
  assert.equal(execution.status, 'complete');

  const secMutate = writeClient.calls.find(
    (c) =>
      c.path === '/orgs/{org}/organization-roles/teams/{team_slug}/{role_id}' &&
      c.pathParams?.team_slug === 'sec-ops' &&
      c.pathParams?.role_id === '700',
  );
  assert.ok(secMutate);

  const customOrgRoleMutate = writeClient.calls.find(
    (c) =>
      c.path === '/orgs/{org}/organization-roles/teams/{team_slug}/{role_id}' &&
      c.pathParams?.team_slug === 'auditors' &&
      c.pathParams?.role_id === '701',
  );
  assert.ok(customOrgRoleMutate);

  // 4. Verify
  const targetVerifiedAdapter = new MockReadAdapter(
    sourceTeams,
    new Map(),
    targetHandlers,
  );
  const ctxVerified: MigrationContext = {
    ...ctx,
    targetClient: targetVerifiedAdapter,
  };
  const verification = await module.verify(ctxVerified, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});

test('TeamsMigrationModule: migrates non-IdP team memberships with EMU identity mapping', async () => {
  const module = new TeamsMigrationModule({
    identityMappingConfig: {
      strategy: 'emu-saml',
      suffix: '_enterprise',
    },
    teamManagement: {
      defaultMode: 'native',
    },
  });
  const writeClient = new MockWriteClient();

  const sourceTeams = [
    {
      id: 30,
      slug: 'devs',
      name: 'Developers',
      privacy: 'closed',
      description: 'Dev team',
      members_count: 2,
    },
  ];

  const sourceHandlers = new Map<string, unknown>();
  // Source team members
  sourceHandlers.set('devs/repos', []);
  sourceHandlers.set('devs/members', [
    { login: 'alice', role: 'maintainer' },
    { login: 'bob', role: 'member' },
  ]);
  // Source individual member roles
  sourceHandlers.set('devs/memberships/alice', { role: 'maintainer' });
  sourceHandlers.set('devs/memberships/bob', { role: 'member' });

  const targetHandlers = new Map<string, unknown>();
  // Target individual member roles for verify
  targetHandlers.set('devs/memberships/alice_enterprise', {
    role: 'maintainer',
  });
  targetHandlers.set('devs/memberships/bob_enterprise', {
    role: 'member',
  });

  const ctx: MigrationContext = {
    runId: 'teams-members-run',
    scope: {
      level: 'organization',
      sourceOrg: 'src-org',
      targetOrg: 'dst-org',
    },
    sourceClient: new MockReadAdapter(sourceTeams, new Map(), sourceHandlers),
    targetClient: new MockReadAdapter([], new Map(), targetHandlers),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  // 1. Discover
  const discovered = await module.discover(ctx);
  const devs = discovered.teams.find((t) => t.slug === 'devs');
  assert.ok(devs);
  assert.equal(devs.members?.length, 2);
  assert.ok(
    devs.members?.some((m) => m.login === 'alice' && m.role === 'maintainer'),
  );
  assert.ok(
    devs.members?.some((m) => m.login === 'bob' && m.role === 'member'),
  );

  // 2. Plan (verifying EMU login mapping)
  const plan = await module.plan(ctx, discovered);
  const aliceOp = plan.operations.find(
    (op) =>
      op.resourceType === 'team-member' &&
      op.resourceName === 'devs:alice_enterprise',
  );
  assert.ok(aliceOp);
  assert.equal((aliceOp.sourceState as { role: string }).role, 'maintainer');

  const bobOp = plan.operations.find(
    (op) =>
      op.resourceType === 'team-member' &&
      op.resourceName === 'devs:bob_enterprise',
  );
  assert.ok(bobOp);
  assert.equal((bobOp.sourceState as { role: string }).role, 'member');

  // 3. Apply
  const execution = await module.apply(ctx, plan);
  assert.equal(execution.status, 'complete');

  const aliceMutate = writeClient.calls.find(
    (c) =>
      c.path === '/orgs/{org}/teams/{team_slug}/memberships/{username}' &&
      c.pathParams?.username === 'alice_enterprise',
  );
  assert.ok(aliceMutate);
  assert.equal((aliceMutate.body as { role: string }).role, 'maintainer');

  const bobMutate = writeClient.calls.find(
    (c) =>
      c.path === '/orgs/{org}/teams/{team_slug}/memberships/{username}' &&
      c.pathParams?.username === 'bob_enterprise',
  );
  assert.ok(bobMutate);
  assert.equal((bobMutate.body as { role: string }).role, 'member');

  // 4. Verify
  const targetVerifiedAdapter = new MockReadAdapter(
    sourceTeams,
    new Map(),
    targetHandlers,
  );
  const ctxVerified: MigrationContext = {
    ...ctx,
    targetClient: targetVerifiedAdapter,
  };
  const verification = await module.verify(ctxVerified, plan);
  assert.equal(verification.verified, true);
  assert.equal(verification.discrepancies.length, 0);
});
