import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SeederGitHubClient,
  createDefaultOrchestrator,
} from '../src/commands/seeder/index.js';
import { validateTokenPermissions } from '../src/commands/seeder/preflight.js';

describe('Seed Dry-Run Simulation & Permission Validation (US3)', () => {
  it('guarantees zero mutating calls in dry-run mode and marks all actions as dry-run-*', async () => {
    const mutatingCalls: Array<{ method: string; url: string }> = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        mutatingCalls.push({ method, url });
      }

      if (url.includes('/orgs/mock-org')) {
        return new Response(JSON.stringify({ plan: { name: 'enterprise' } }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-oauth-scopes': 'admin:org, repo, delete_repo, workflow',
          },
        });
      }

      return new Response(JSON.stringify({ id: 1, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeederGitHubClient({
      token: 'mock-token',
      dryRun: true,
      fetchImpl: mockFetch,
    });

    const orchestrator = createDefaultOrchestrator();
    const summary = await orchestrator.run(
      {
        organization: 'mock-org',
        repository: 'demo-repo',
        scopeLevel: 'both',
        contentType: 'all',
        patSecretName: 'GHEC_SOURCE_TOKEN',
        dryRun: true,
        cleanupExisting: false,
        resourcePrefix: 'demo-',
      },
      { client, logger: () => {} },
    );

    assert.equal(summary.dryRun, true);
    assert.equal(
      mutatingCalls.length,
      0,
      'Dry run MUST NOT perform mutating HTTP requests',
    );
    assert.ok(
      summary.items.every(
        (i) => i.action.startsWith('dry-run-') || i.action === 'skipped',
      ),
      'All items in dry-run must be marked with dry-run-* or skipped',
    );
    assert.equal(summary.counts.failed, 0);
  });

  describe('validateTokenPermissions', () => {
    it('detects missing OAuth scopes and produces informative warnings', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(JSON.stringify({ plan: { name: 'business' } }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-oauth-scopes': 'repo', // missing admin:org, delete_repo, workflow
          },
        });

      const client = new SeederGitHubClient({
        token: 'mock-token',
        fetchImpl: mockFetch,
      });
      const check = await validateTokenPermissions(client, 'test-org');

      assert.equal(check.valid, true);
      assert.ok(check.missingScopes.includes('admin:org'));
      assert.ok(check.missingScopes.includes('workflow'));
      assert.ok(
        check.warning?.includes('missing recommended administrative scopes'),
      );
      assert.equal(check.isEnterprise, false);
    });

    it('returns error when organization authentication fails (401)', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(JSON.stringify({ message: 'Bad credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });

      const client = new SeederGitHubClient({
        token: 'bad-token',
        fetchImpl: mockFetch,
      });
      const check = await validateTokenPermissions(client, 'test-org');

      assert.equal(check.valid, false);
      assert.ok(check.error?.includes('Authentication failed'));
    });
  });
});
