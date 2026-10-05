import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  GitHubReadAdapter,
  EndpointProbeResult,
  ReadOperation,
} from '@ghec/github-client';
import { SourceCredentialInspector } from '../../src/preflight/credential-inspector.js';
import { PreflightEvaluator } from '../../src/preflight/evaluator.js';
import type { MigrationScope } from '@ghec/contracts';

function createMockAdapter(options: {
  probeResult?: EndpointProbeResult | undefined;
  membership?: {
    state?: string;
    role?: string;
    user?: { login?: string };
  } | null;
}): GitHubReadAdapter {
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
    async readSingle(operation: ReadOperation) {
      if (operation.id === 'rest.orgs.getMembershipForAuthenticatedUser') {
        if (options.membership === null) {
          return {
            data: null as never,
            observedAt: new Date().toISOString(),
            status: 404,
          };
        }
        return {
          data: options.membership ?? {
            state: 'active',
            role: 'admin',
            user: { login: 'admin-user' },
          },
          observedAt: new Date().toISOString(),
          status: 200,
        };
      }
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
    async probeEndpoint() {
      return (
        options.probeResult ?? {
          status: 200,
          oauthScopes: ['repo', 'admin:org'],
        }
      );
    },
  };
}

describe('SourceCredentialInspector', () => {
  it('passes cleanly for classic PAT with repo and admin:org on admin user', async () => {
    const adapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: ['repo', 'admin:org'],
      },
      membership: {
        state: 'active',
        role: 'admin',
        user: { login: 'org-admin' },
      },
    });

    const inspector = new SourceCredentialInspector({
      adapter,
      sourceOrg: 'demogxp',
    });

    const assessment = await inspector.inspect();
    assert.equal(assessment.valid, true);
    assert.equal(assessment.tokenModel, 'classic_pat');
    assert.equal(assessment.blockers.length, 0);
    assert.equal(assessment.ssoRequired, false);
    assert.equal(assessment.orgRole, 'admin');
  });

  it('fails with blocker if repo scope is missing', async () => {
    const adapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: ['admin:org'],
      },
    });

    const inspector = new SourceCredentialInspector({
      adapter,
      sourceOrg: 'demogxp',
    });

    const assessment = await inspector.inspect();
    assert.equal(assessment.valid, false);
    assert.match(
      assessment.blockers[0]!,
      /missing required OAuth scope "repo"/,
    );
  });

  it('fails with blocker if admin:org and read:org are missing', async () => {
    const adapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: ['repo'],
      },
    });

    const inspector = new SourceCredentialInspector({
      adapter,
      sourceOrg: 'demogxp',
    });

    const assessment = await inspector.inspect();
    assert.equal(assessment.valid, false);
    assert.match(
      assessment.blockers[0]!,
      /missing required organization scope "admin:org" or "read:org"/,
    );
  });

  it('fails with blocker when fine-grained PAT is detected (no oauthScopes)', async () => {
    const adapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: undefined,
      },
    });

    const inspector = new SourceCredentialInspector({
      adapter,
      sourceOrg: 'demogxp',
    });

    const assessment = await inspector.inspect();
    assert.equal(assessment.valid, false);
    assert.equal(assessment.tokenModel, 'fine_grained_pat');
    assert.match(assessment.blockers[0]!, /Fine-Grained Personal Access Token/);
  });

  it('fails with blocker when SAML SSO authorization is required', async () => {
    const adapter = createMockAdapter({
      probeResult: {
        status: 403,
        oauthScopes: ['repo', 'admin:org'],
        ssoRequired: true,
        ssoUrl: 'https://github.com/orgs/demogxp/sso',
      },
    });

    const inspector = new SourceCredentialInspector({
      adapter,
      sourceOrg: 'demogxp',
    });

    const assessment = await inspector.inspect();
    assert.equal(assessment.valid, false);
    assert.equal(assessment.ssoRequired, true);
    assert.match(
      assessment.blockers[0]!,
      /requires SAML Single Sign-On \(SSO\) authorization/,
    );
    assert.match(
      assessment.blockers[0]!,
      /https:\/\/github.com\/orgs\/demogxp\/sso/,
    );
  });

  it('warns operator with migrator role grant instructions when user is not admin', async () => {
    const adapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: ['repo', 'admin:org'],
      },
      membership: {
        state: 'active',
        role: 'member',
        user: { login: 'regular-member' },
      },
    });

    const inspector = new SourceCredentialInspector({
      adapter,
      sourceOrg: 'demogxp',
    });

    const assessment = await inspector.inspect();
    assert.equal(assessment.valid, true); // Still valid if owner granted migrator role
    assert.equal(assessment.warnings.length, 1);
    assert.match(
      assessment.warnings[0]!,
      /gh gei grant-migrator-role --github-org demogxp --actor regular-member/,
    );
  });

  it('integrates into PreflightEvaluator and blocks all repositories if credentials fail', async () => {
    const sourceAdapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: ['repo'], // Missing admin:org
      },
    });

    const targetAdapter = createMockAdapter({
      probeResult: {
        status: 200,
        oauthScopes: ['repo', 'admin:org'],
      },
    });

    const scope: MigrationScope = {
      name: 'demogxp-to-target',
      organizations: [
        {
          source: 'demogxp',
          target: 'antigravity-migration-test',
          modules: ['all'],
        },
      ],
      repositories: [
        {
          sourceOrg: 'demogxp',
          sourceRepo: 'repo-alpha',
          targetOrg: 'antigravity-migration-test',
          targetRepo: 'repo-alpha',
          modules: ['all'],
        },
      ],
    };

    const evaluator = new PreflightEvaluator({
      scope,
      sourceAdapter,
      targetAdapter,
    });

    const report = await evaluator.evaluate();
    assert.equal(report.repositoryAssessments.length, 1);
    const repoAssessment = report.repositoryAssessments[0]!;
    assert.equal(repoAssessment.status, 'blocked');
    assert.ok(
      repoAssessment.blockers.some((b) =>
        b.includes(
          'missing required organization scope "admin:org" or "read:org"',
        ),
      ),
    );
  });
});
