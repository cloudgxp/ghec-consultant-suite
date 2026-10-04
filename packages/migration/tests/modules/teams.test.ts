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

  constructor(
    teams: unknown[] = [],
    repoPerms: Map<string, unknown> = new Map(),
  ) {
    this.teams = teams;
    this.repoPerms = repoPerms;
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

  async readPage<T>(op: { path: string }): Promise<ReadPage<T>> {
    if (op.path.endsWith('/repos')) {
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
