import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SeederGitHubClient,
  createDefaultOrchestrator,
} from '../src/commands/seeder/index.js';
import { cleanupDemoResources } from '../src/commands/seeder/cleanup.js';
import type {
  ItemProvisionContext,
  ItemProvisioner,
} from '../src/commands/seeder/types.js';

describe('Seed Teardown & Clean Baseline (US4)', () => {
  it('executes cleanup in reverse topological order', async () => {
    const cleanupOrder: string[] = [];

    const mockProvisioners = new Map<string, ItemProvisioner>([
      [
        'teams',
        {
          id: 'teams',
          provision: async () => ({
            action: 'created',
            resourceIdentifier: 'teams',
          }),
          cleanup: async () => {
            cleanupOrder.push('teams');
          },
        },
      ],
      [
        'collaborators',
        {
          id: 'collaborators',
          provision: async () => ({
            action: 'created',
            resourceIdentifier: 'collaborators',
          }),
          cleanup: async () => {
            cleanupOrder.push('collaborators');
          },
        },
      ],
    ]);

    const ctx: ItemProvisionContext = {
      client: new SeederGitHubClient({ token: 'mock' }),
      organization: 'test-org',
      prefix: 'demo-',
      dryRun: false,
      logger: () => {},
    };

    const items = [
      {
        id: 'teams',
        name: 'Teams',
        scopeLevel: 'organization' as const,
        category: 'core-governance' as const,
        dependencies: [],
        enterpriseOnly: false,
      },
      {
        id: 'collaborators',
        name: 'Collaborators',
        scopeLevel: 'repository' as const,
        category: 'core-governance' as const,
        dependencies: ['teams'],
        enterpriseOnly: false,
      },
    ];

    const result = await cleanupDemoResources(ctx, items, mockProvisioners);
    assert.equal(result.deletedCount, 2);
    // Collaborators depends on teams, so in reverse order collaborators must be cleaned up first!
    assert.deepEqual(cleanupOrder, ['collaborators', 'teams']);
  });

  it('preserves non-demo repositories during cleanup', async () => {
    const deletedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'DELETE') {
        deletedUrls.push(url);
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeederGitHubClient({
      token: 'mock',
      fetchImpl: mockFetch,
    });
    const orchestrator = createDefaultOrchestrator();

    // Run with repository name that does NOT start with demo prefix: "production-repo"
    await orchestrator.run(
      {
        organization: 'customer-org',
        repository: 'production-repo',
        scopeLevel: 'repository',
        contentType: 'gei-repo',
        patSecretName: 'GHEC_SOURCE_TOKEN',
        dryRun: false,
        cleanupExisting: true,
        resourcePrefix: 'demo-',
      },
      { client, logger: () => {} },
    );

    // Assert that DELETE /repos/customer-org/production-repo was NEVER called
    const repoDeleteCall = deletedUrls.find((u) =>
      u.includes('/repos/customer-org/production-repo'),
    );
    assert.equal(
      repoDeleteCall,
      undefined,
      'Must NEVER delete repository that does not match demo prefix',
    );
  });
});
