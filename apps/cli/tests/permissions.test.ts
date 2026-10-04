import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_IDS } from '@ghec/contracts';
import {
  checkModuleClassicScopes,
  hasClassicScope,
} from '../src/permissions/matrix.js';
import {
  PermissionChecker,
  PreflightPermissionError,
} from '../src/permissions/checker.js';
import { parseDiscoveryOptions } from '../src/commands/discover.js';
import { DiscoveryOrchestrator } from '../src/engine/orchestrator.js';
import type {
  EndpointProbeResult,
  GitHubReadAdapter,
  ReadOperation,
} from '../src/github/adapter.js';

function createStubAdapter(
  overrides?: Partial<GitHubReadAdapter>,
): GitHubReadAdapter {
  return {
    async queryGraphQL() {
      return { data: {} as never, observedAt: new Date().toISOString() };
    },
    async readPage() {
      return {
        items: [],
        nextCursor: null,
        observedAt: new Date().toISOString(),
        remainingRequests: 5000,
        resetAt: null,
        status: 200,
      };
    },
    async readSingle() {
      return {
        data: {} as never,
        observedAt: new Date().toISOString(),
        status: 200,
      };
    },
    async fetchAll() {
      return {
        items: [],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
    ...overrides,
  };
}

test('hasClassicScope handles direct scopes and inheritance correctly', () => {
  const granted = new Set([
    'admin:org',
    'repo',
    'admin:repo_hook',
    'admin:enterprise',
  ]);

  assert.ok(hasClassicScope(granted, 'admin:org'));
  assert.ok(hasClassicScope(granted, 'read:org')); // inherited from admin:org
  assert.ok(hasClassicScope(granted, 'repo'));
  assert.ok(hasClassicScope(granted, 'public_repo')); // inherited from repo
  assert.ok(hasClassicScope(granted, 'admin:repo_hook'));
  assert.ok(hasClassicScope(granted, 'read:repo_hook')); // inherited from admin:repo_hook
  assert.ok(hasClassicScope(granted, 'write:repo_hook')); // inherited from admin:repo_hook
  assert.ok(hasClassicScope(granted, 'manage_runners:enterprise')); // inherited from admin:enterprise
  assert.ok(hasClassicScope(granted, 'read:enterprise')); // inherited from admin:enterprise

  assert.ok(!hasClassicScope(granted, 'security_events'));
  assert.ok(!hasClassicScope(granted, 'read:packages'));
});

test('checkModuleClassicScopes validates each module correctly', () => {
  // 1. Full union of scopes
  const fullUnion = new Set([
    'repo',
    'admin:org',
    'admin:repo_hook',
    'security_events',
    'read:packages',
  ]);

  for (const mod of MODULE_IDS) {
    const res = checkModuleClassicScopes(mod, fullUnion);
    assert.ok(res.satisfied, `Module ${mod} should be satisfied by full union`);
    assert.deepEqual(res.missingRecommendations, []);
  }

  // 2. Token lacking security_events
  const withoutSecurity = new Set([
    'repo',
    'admin:org',
    'admin:repo_hook',
    'read:packages',
  ]);
  const secRes = checkModuleClassicScopes('security', withoutSecurity);
  assert.ok(!secRes.satisfied);
  assert.ok(secRes.missingRecommendations.includes('security_events'));

  // 3. Token lacking admin:repo_hook
  const withoutHooks = new Set([
    'repo',
    'admin:org',
    'security_events',
    'read:packages',
  ]);
  const integRes = checkModuleClassicScopes('integrations', withoutHooks);
  assert.ok(!integRes.satisfied);
  assert.ok(integRes.missingRecommendations.includes('admin:repo_hook'));

  // 4. Token lacking read:packages
  const withoutPackages = new Set([
    'repo',
    'admin:org',
    'admin:repo_hook',
    'security_events',
  ]);
  const pkgRes = checkModuleClassicScopes('packages', withoutPackages);
  assert.ok(!pkgRes.satisfied);
  assert.ok(pkgRes.missingRecommendations.includes('read:packages'));
});

test('PermissionChecker detects SAML SSO requirement and stops', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'acme-corp',
    '--modules',
    'repos',
  ]);

  const mockAdapter = createStubAdapter({
    async probeEndpoint(): Promise<EndpointProbeResult> {
      return {
        status: 403,
        ssoRequired: true,
        ssoUrl: 'https://github.com/orgs/acme-corp/sso',
      };
    },
  });

  const checker = new PermissionChecker(
    plan,
    {
      token: 'ghp_' + 'A'.repeat(36),
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
    },
    mockAdapter,
  );

  const res = await checker.verify(new AbortController().signal);
  assert.ok(!res.success);
  assert.ok(res.ssoRequired);
  assert.equal(res.ssoUrl, 'https://github.com/orgs/acme-corp/sso');
  assert.ok(res.recommendations.some((r) => r.includes('SAML Single Sign-On')));

  const report = PermissionChecker.formatReport(res);
  assert.match(report, /SAML SINGLE SIGN-ON \(SSO\) AUTHORIZATION REQUIRED/);
  const ssoLine = report
    .split('\n')
    .find((line) => line.includes('SSO Authorization URL'));
  assert.ok(ssoLine, 'Report should include SAML SSO authorization URL');
  assert.equal(ssoLine.trim(), `↳ SSO Authorization URL: ${res.ssoUrl}`);
});

test('PermissionChecker identifies missing Classic PAT scopes for requested modules', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'acme-corp',
    '--modules',
    'repos,actions-secrets,security,integrations',
  ]);

  const mockAdapter = createStubAdapter({
    async probeEndpoint(): Promise<EndpointProbeResult> {
      return {
        status: 200,
        oauthScopes: ['repo', 'read:org'], // Missing admin:org, security_events, admin:repo_hook
      };
    },
  });

  const checker = new PermissionChecker(
    plan,
    {
      token: 'ghp_' + 'B'.repeat(36),
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
    },
    mockAdapter,
  );

  const res = await checker.verify(new AbortController().signal);
  assert.ok(!res.success);
  assert.equal(res.tokenModel, 'classic_pat');

  const reposCheck = res.moduleChecks.find((c) => c.moduleId === 'repos');
  assert.equal(reposCheck?.status, 'passed');

  const secretsCheck = res.moduleChecks.find(
    (c) => c.moduleId === 'actions-secrets',
  );
  assert.equal(secretsCheck?.status, 'failed');
  assert.ok(secretsCheck?.missingScopes?.includes('admin:org'));

  const secCheck = res.moduleChecks.find((c) => c.moduleId === 'security');
  assert.equal(secCheck?.status, 'failed');
  assert.ok(secCheck?.missingScopes?.includes('security_events'));

  const integCheck = res.moduleChecks.find(
    (c) => c.moduleId === 'integrations',
  );
  assert.equal(integCheck?.status, 'failed');
  assert.ok(integCheck?.missingScopes?.includes('admin:org'));
  assert.ok(integCheck?.missingScopes?.includes('admin:repo_hook'));

  const report = PermissionChecker.formatReport(res);
  assert.match(report, /✔ repos: PASSED/);
  assert.match(report, /✖ actions-secrets: FAILED/);
  assert.match(report, /✖ security: FAILED/);
  assert.match(report, /✖ integrations: FAILED/);
});

test('PermissionChecker rejects Fine-Grained PAT on enterprise scope', async () => {
  const plan = parseDiscoveryOptions([
    '--enterprise',
    'mega-corp',
    '--modules',
    'repos',
  ]);

  const mockAdapter = createStubAdapter();

  const checker = new PermissionChecker(
    plan,
    {
      token: 'github_pat_' + 'C'.repeat(82),
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
    },
    mockAdapter,
  );

  const res = await checker.verify(new AbortController().signal);
  assert.ok(!res.success);
  assert.equal(res.tokenModel, 'fine_grained_pat');
  assert.ok(
    res.recommendations[0]?.includes(
      'Enterprise scans (--enterprise) require a Classic PAT',
    ),
  );
});

test('PermissionChecker evaluates GitHub App permissions map', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'acme-corp',
    '--modules',
    'repos,actions,actions-secrets',
  ]);

  const mockAdapter = {
    ...createStubAdapter(),
    getAuthProvider() {
      return {
        getPermissions() {
          return {
            metadata: 'read',
            actions: 'read',
            // Missing secrets:read and organization_administration:read
          };
        },
      };
    },
  };

  const checker = new PermissionChecker(
    plan,
    {
      app: { appId: '123', privateKey: 'key', installationId: '456' },
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
    },
    mockAdapter,
  );

  const res = await checker.verify(new AbortController().signal);
  assert.ok(!res.success);
  assert.equal(res.tokenModel, 'github_app');

  const reposCheck = res.moduleChecks.find((c) => c.moduleId === 'repos');
  assert.equal(reposCheck?.status, 'passed');

  const actionsCheck = res.moduleChecks.find((c) => c.moduleId === 'actions');
  assert.equal(actionsCheck?.status, 'passed');

  const secretsCheck = res.moduleChecks.find(
    (c) => c.moduleId === 'actions-secrets',
  );
  assert.equal(secretsCheck?.status, 'failed');
});

test('DiscoveryOrchestrator fails immediately when permissions are missing and continueOnError is false', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'acme-corp',
    '--modules',
    'security',
  ]);

  const mockAdapter = createStubAdapter({
    async probeEndpoint(): Promise<EndpointProbeResult> {
      return {
        status: 200,
        oauthScopes: ['repo'], // Missing security_events and admin:org
      };
    },
  });

  const orchestrator = new DiscoveryOrchestrator(
    plan,
    {
      token: 'ghp_' + 'D'.repeat(36),
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
    },
    mockAdapter,
  );

  await assert.rejects(
    () => orchestrator.run(new AbortController().signal),
    (err: Error) => {
      assert.ok(err instanceof PreflightPermissionError);
      assert.match(err.message, /Preflight permission verification failed/);
      assert.ok(!err.auditResult.success);
      return true;
    },
  );
});

test('DiscoveryOrchestrator proceeds when continueOnError is true even if permissions are missing', async () => {
  const plan = parseDiscoveryOptions([
    '--organization',
    'acme-corp',
    '--modules',
    'repos',
    '--continue-on-error',
  ]);

  const now = new Date().toISOString();
  const mockAdapter = createStubAdapter({
    async queryGraphQL() {
      return {
        data: {
          rateLimit: { cost: 1, remaining: 4999, resetAt: now },
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: 1,
              nodes: [
                {
                  id: 'R_1',
                  name: 'test-repo',
                  visibility: 'PUBLIC',
                  isArchived: false,
                  isFork: false,
                  diskUsage: 100,
                  defaultBranchRef: { name: 'main' },
                  branchProtectionRules: { nodes: [] },
                  rulesets: { nodes: [] },
                },
              ],
            },
          },
        } as never,
        observedAt: now,
      };
    },
    async readSingle(op: ReadOperation) {
      if (op.id === 'rest.orgs.get') {
        return {
          data: { id: 1, login: 'acme-corp', name: 'Acme Corp' } as never,
          observedAt: now,
          status: 200,
        };
      }
      return { data: {} as never, observedAt: now, status: 200 };
    },
    async probeEndpoint(): Promise<EndpointProbeResult> {
      // Simulate permission failure in preflight probe
      return {
        status: 200,
        oauthScopes: ['read:org'], // Missing repo
      };
    },
  });

  const orchestrator = new DiscoveryOrchestrator(
    plan,
    {
      token: 'ghp_' + 'E'.repeat(36),
      baseUrl: 'https://api.github.com',
      apiVersion: '2026-03-10',
    },
    mockAdapter,
  );

  // Does NOT throw PreflightPermissionError because continueOnError is true!
  const res = await orchestrator.run(new AbortController().signal);
  assert.ok(res.bundle);
  assert.equal(res.bundle.scan.status, 'complete');
});
