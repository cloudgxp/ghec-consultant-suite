import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SeederGitHubClient,
  createDefaultOrchestrator,
} from '../src/commands/seeder/index.js';
import { parseSeedDemoOptions } from '../src/commands/seed-demo.js';

describe('Seed Scoped & Preset Filtering (US2)', () => {
  it('parses --modules flag as contentType', () => {
    const parsed = parseSeedDemoOptions([
      '--org',
      'test-org',
      '--modules',
      'teams,rulesets',
    ]);
    assert.equal(parsed.contentType, 'teams,rulesets');
  });

  it('filters orchestrator execution to organization items only when scope is organization', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/secrets/public-key')) {
        return new Response(
          JSON.stringify({
            key_id: '1',
            key: 'uXwgvs+0okYPSrjMcMbDs2TQ18PszEa1LTaQ546C0BA=',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ id: 1, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeederGitHubClient({
      token: 'mock-pat',
      fetchImpl: mockFetch,
    });
    const orchestrator = createDefaultOrchestrator();

    const summary = await orchestrator.run(
      {
        organization: 'test-org',
        scopeLevel: 'organization',
        contentType: 'all',
        patSecretName: 'GHEC_SOURCE_TOKEN',
        dryRun: false,
        cleanupExisting: false,
        resourcePrefix: 'demo-',
      },
      { client, logger: () => {} },
    );

    assert.equal(summary.counts.total, 14);
    assert.ok(summary.items.every((i) => i.scope === 'organization'));
    assert.ok(summary.items.some((i) => i.itemId === 'org-rulesets'));
    assert.ok(!summary.items.some((i) => i.itemId === 'gei-repo'));
    assert.ok(!summary.items.some((i) => i.itemId === 'rulesets'));
  });

  it('filters orchestrator execution when specific preset is requested', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/actions/secrets/public-key')) {
        return new Response(
          JSON.stringify({
            key_id: '1',
            key: 'uXwgvs+0okYPSrjMcMbDs2TQ18PszEa1LTaQ546C0BA=',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ id: 1, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new SeederGitHubClient({
      token: 'mock-pat',
      fetchImpl: mockFetch,
    });
    const orchestrator = createDefaultOrchestrator();

    const summary = await orchestrator.run(
      {
        organization: 'test-org',
        repository: 'demo-repo',
        scopeLevel: 'both',
        contentType: 'core-governance',
        patSecretName: 'GHEC_SOURCE_TOKEN',
        dryRun: false,
        cleanupExisting: false,
        resourcePrefix: 'demo-',
      },
      { client, logger: () => {} },
    );

    assert.equal(summary.counts.total, 8);
    const itemIds = summary.items.map((i) => i.itemId);
    assert.ok(itemIds.includes('org-settings'));
    assert.ok(itemIds.includes('teams'));
    assert.ok(itemIds.includes('gei-repo'));
    assert.ok(!itemIds.includes('rulesets'));
    assert.ok(!itemIds.includes('issues'));
  });

  it('filters orchestrator execution when custom comma-separated list is requested', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ id: 1, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const client = new SeederGitHubClient({
      token: 'mock-pat',
      fetchImpl: mockFetch,
    });
    const orchestrator = createDefaultOrchestrator();

    const summary = await orchestrator.run(
      {
        organization: 'test-org',
        repository: 'demo-repo',
        scopeLevel: 'both',
        contentType: 'teams,autolinks',
        patSecretName: 'GHEC_SOURCE_TOKEN',
        dryRun: false,
        cleanupExisting: false,
        resourcePrefix: 'demo-',
      },
      { client, logger: () => {} },
    );

    const itemIds = summary.items.map((i) => i.itemId);
    // autolinks requires gei-repo, so gei-repo should be auto-included
    assert.ok(itemIds.includes('teams'));
    assert.ok(itemIds.includes('autolinks'));
    assert.ok(itemIds.includes('gei-repo'));
    assert.equal(summary.counts.total, 3);
  });
});
