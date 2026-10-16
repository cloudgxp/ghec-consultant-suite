import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SeederGitHubClient,
  createDefaultOrchestrator,
} from '../src/commands/seeder/index.js';

describe('Seed Demo Provisioning (US1)', () => {
  it('auto-creates repository when missing and provisions items', async () => {
    const recordedCalls: Array<{
      url: string;
      method: string;
      body?: unknown;
    }> = [];

    // Mock fetch implementation simulating GitHub REST API
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      let body: unknown;
      if (init?.body && typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      recordedCalls.push({ url, method, body });

      // Simulate 404 for initial check of target repo (only repo root URL, not sub-resources)
      if (url.endsWith('/repos/mock-org/new-demo-repo') && method === 'GET') {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Simulate public key endpoints
      if (url.includes('/actions/secrets/public-key')) {
        return new Response(
          JSON.stringify({
            key_id: 'mock-key-1',
            key: 'uXwgvs+0okYPSrjMcMbDs2TQ18PszEa1LTaQ546C0BA=',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Simulate main ref
      if (url.includes('/git/ref/heads/main')) {
        return new Response(
          JSON.stringify({
            object: { sha: 'abcdef1234567890abcdef1234567890abcdef12' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Default mock success response
      return new Response(
        JSON.stringify({ id: 123, status: 'ok', success: true }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const client = new SeederGitHubClient({
      token: 'mock-token',
      fetchImpl: mockFetch,
      dryRun: false,
    });

    const orchestrator = createDefaultOrchestrator();
    const summary = await orchestrator.run(
      {
        organization: 'mock-org',
        repository: 'new-demo-repo',
        scopeLevel: 'both',
        contentType: 'all',
        patSecretName: 'GHEC_SOURCE_TOKEN',
        dryRun: false,
        cleanupExisting: false,
        resourcePrefix: 'demo-',
      },
      { client, logger: () => {} },
    );

    assert.equal(summary.organization, 'mock-org');
    assert.equal(summary.repository, 'new-demo-repo');
    assert.equal(summary.counts.total, 33);
    assert.equal(summary.counts.failed, 0);
    assert.equal(summary.errors.length, 0);

    // Verify repo was created via POST /orgs/mock-org/repos
    const repoCreateCall = recordedCalls.find(
      (c) => c.url.includes('/orgs/mock-org/repos') && c.method === 'POST',
    );
    assert.ok(
      repoCreateCall,
      'Expected POST call to create missing repository',
    );
    assert.equal(
      (repoCreateCall?.body as { name: string })?.name,
      'new-demo-repo',
    );

    // Verify organization ruleset was created via POST /orgs/mock-org/rulesets
    const orgRulesetCall = recordedCalls.find(
      (c) => c.url.endsWith('/orgs/mock-org/rulesets') && c.method === 'POST',
    );
    assert.ok(orgRulesetCall, 'Expected POST call to create org ruleset');
    assert.equal(
      (orgRulesetCall?.body as { name: string })?.name,
      'demo-Org-Default-Branch-Ruleset',
    );

    // Verify repository branch and tag rulesets were created via POST /repos/mock-org/new-demo-repo/rulesets
    const repoRulesetCalls = recordedCalls.filter(
      (c) =>
        c.url.endsWith('/repos/mock-org/new-demo-repo/rulesets') &&
        c.method === 'POST',
    );
    assert.equal(
      repoRulesetCalls.length,
      2,
      'Expected 2 repo ruleset POST calls (branch and tag)',
    );
  });
});
