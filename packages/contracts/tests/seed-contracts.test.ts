import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SEEDER_SCHEMA_VERSION,
  validateSeedDispatchRequest,
  validateSeedManifest,
  validateSeedExecutionSummary,
} from '../src/index.js';

describe('Seed Contracts Validation', () => {
  describe('SeedDispatchRequest', () => {
    it('accepts valid dispatch request with defaults', () => {
      const parsed = validateSeedDispatchRequest({
        organization: 'octodemo-migration',
      });
      assert.equal(parsed.organization, 'octodemo-migration');
      assert.equal(parsed.scopeLevel, 'both');
      assert.equal(parsed.contentType, 'all');
      assert.equal(parsed.patSecretName, 'GHEC_SOURCE_TOKEN');
      assert.equal(parsed.dryRun, false);
      assert.equal(parsed.cleanupExisting, false);
      assert.equal(parsed.resourcePrefix, 'demo-');
      assert.equal(parsed.repository, undefined);
    });

    it('accepts fully specified dispatch request', () => {
      const parsed = validateSeedDispatchRequest({
        organization: 'my-org_123',
        repository: 'demo-repo.name',
        scopeLevel: 'repository',
        contentType: 'core-governance',
        patSecretName: 'CUSTOM_PAT',
        dryRun: true,
        cleanupExisting: true,
        resourcePrefix: 'test-',
      });
      assert.equal(parsed.organization, 'my-org_123');
      assert.equal(parsed.repository, 'demo-repo.name');
      assert.equal(parsed.scopeLevel, 'repository');
      assert.equal(parsed.contentType, 'core-governance');
      assert.equal(parsed.patSecretName, 'CUSTOM_PAT');
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.cleanupExisting, true);
      assert.equal(parsed.resourcePrefix, 'test-');
    });

    it('rejects invalid organization names', () => {
      assert.throws(
        () => validateSeedDispatchRequest({ organization: '' }),
        /Organization name is required/,
      );
      assert.throws(
        () => validateSeedDispatchRequest({ organization: 'invalid org!' }),
        /Organization must contain only alphanumeric/,
      );
    });

    it('rejects invalid scopeLevel', () => {
      assert.throws(() =>
        validateSeedDispatchRequest({
          organization: 'valid-org',
          scopeLevel: 'invalid-scope',
        }),
      );
    });
  });

  describe('SeedManifest', () => {
    it('accepts valid manifest with items', () => {
      const parsed = validateSeedManifest({
        schemaVersion: SEEDER_SCHEMA_VERSION,
        items: [
          {
            id: 'org-settings',
            name: 'Organization Settings',
            scopeLevel: 'organization',
            category: 'core-governance',
            dependencies: [],
            enterpriseOnly: false,
            description: 'General policies',
          },
          {
            id: 'rulesets',
            name: 'Repository Rulesets',
            scopeLevel: 'repository',
            category: 'actions-and-security',
            dependencies: ['gei-repo'],
            enterpriseOnly: false,
          },
        ],
      });
      assert.equal(parsed.schemaVersion, '1.0.0');
      assert.equal(parsed.items.length, 2);
      assert.equal(parsed.items[0]?.id, 'org-settings');
      assert.equal(parsed.items[1]?.dependencies[0], 'gei-repo');
    });

    it('rejects manifest with invalid schema version', () => {
      assert.throws(() =>
        validateSeedManifest({
          schemaVersion: '2.0.0',
          items: [],
        }),
      );
    });
  });

  describe('SeedExecutionSummary', () => {
    it('accepts valid execution summary', () => {
      const summary = {
        schemaVersion: SEEDER_SCHEMA_VERSION,
        runId: 'seed-run-12345',
        organization: 'octodemo',
        repository: 'demo-repo',
        scopeLevel: 'both' as const,
        contentType: 'all',
        dryRun: false,
        cleanupExisting: false,
        startedAt: new Date(Date.now() - 5000).toISOString(),
        completedAt: new Date().toISOString(),
        totalDurationMs: 4890,
        counts: {
          total: 2,
          created: 1,
          updated: 1,
          skipped: 0,
          deleted: 0,
          failed: 0,
        },
        items: [
          {
            itemId: 'teams',
            itemName: 'Teams Hierarchy',
            scope: 'organization' as const,
            action: 'created' as const,
            durationMs: 1200,
            resourceIdentifier: 'demo-engineering',
            details: 'Created parent and 2 child teams',
          },
          {
            itemId: 'gei-repo',
            itemName: 'Base Repository',
            scope: 'repository' as const,
            action: 'updated' as const,
            durationMs: 800,
            resourceIdentifier: 'octodemo/demo-repo',
          },
        ],
        warnings: [],
        errors: [],
      };
      const parsed = validateSeedExecutionSummary(summary);
      assert.equal(parsed.runId, 'seed-run-12345');
      assert.equal(parsed.counts.total, 2);
      assert.equal(parsed.items.length, 2);
    });

    it('rejects summary with negative duration', () => {
      assert.throws(() =>
        validateSeedExecutionSummary({
          schemaVersion: SEEDER_SCHEMA_VERSION,
          runId: 'seed-run-12345',
          organization: 'octodemo',
          scopeLevel: 'organization',
          contentType: 'all',
          dryRun: false,
          cleanupExisting: false,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          totalDurationMs: -10,
          counts: {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            deleted: 0,
            failed: 0,
          },
          items: [],
          warnings: [],
          errors: [],
        }),
      );
    });
  });
});
