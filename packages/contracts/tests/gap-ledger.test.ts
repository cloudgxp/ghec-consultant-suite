import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateGapLedger,
  validateModuleBlueprint,
  validateCapabilityGapEntry,
} from '../src/index.js';

test('gap ledger validates conforming synthetic manifest', () => {
  const fixturePath = join(
    process.cwd(),
    'fixtures/synthetic/gap-ledger/valid-manifest.json',
  );
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const result = validateGapLedger(raw);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.schemaVersion, '1.0.0');
    assert.equal(result.data.summary.totalResources, 2);
    assert.equal(result.data.resources.length, 2);
    assert.equal(result.data.waves.length, 1);
  }
});

test('gap ledger rejects invalid manifest with malformed enums and mismatched summary', () => {
  const fixturePath = join(
    process.cwd(),
    'fixtures/synthetic/gap-ledger/invalid-manifest.json',
  );
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const result = validateGapLedger(raw);
  assert.equal(result.success, false);
});

test('gap ledger rejects duplicate resource IDs', () => {
  const duplicatePayload = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-10-12T12:00:00Z',
    summary: {
      totalResources: 2,
      implementedCount: 2,
      partialCount: 0,
      missingCount: 0,
      categoryCounts: { repository: 2 },
    },
    resources: [
      {
        id: 'repo-rulesets',
        name: 'Rulesets 1',
        category: 'repository',
        docsRef: 'references/github-docs/rulesets.md',
        mechanism: 'rest_rehydration',
        status: 'implemented',
        secretHandling: 'none',
        emuConstraints: [],
        notes: 'First ruleset entry',
      },
      {
        id: 'repo-rulesets',
        name: 'Rulesets 2 (Duplicate)',
        category: 'repository',
        docsRef: 'references/github-docs/rulesets.md',
        mechanism: 'rest_rehydration',
        status: 'implemented',
        secretHandling: 'none',
        emuConstraints: [],
        notes: 'Duplicate ruleset entry',
      },
    ],
    waves: [],
  };
  const result = validateGapLedger(duplicatePayload);
  assert.equal(result.success, false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    assert.ok(
      messages.some((m) =>
        m.includes(
          'Duplicate resource ID "repo-rulesets" found in gap ledger.',
        ),
      ),
    );
  }
});

test('module blueprint validates conforming 4-stage lifecycle specification', () => {
  const blueprint = {
    moduleId: 'org-settings',
    targetResource: 'Organization Settings',
    dependencies: [],
    discoverStage: {
      clientMethod: 'getOrgSettings',
      payloadType: 'OrgSettingsState',
      queryPattern: 'GET /orgs/{org}',
    },
    planStage: {
      diffStrategy: 'shallowKeyDiff',
      actionTypes: ['UPDATE_ORG_SETTING'],
      idempotencyKey: 'org-settings-{key}',
    },
    applyStage: {
      clientMethod: 'updateOrgSettings',
      dryRunSupported: true,
      rateLimitBucket: 'core',
      mutationEndpoint: 'PATCH /orgs/{org}',
    },
    verifyStage: {
      verificationQuery: 'GET /orgs/{org}',
      comparisonKeys: [
        'default_repository_permission',
        'has_organization_projects',
      ],
      discrepancySeverity: 'HIGH',
    },
  };

  const result = validateModuleBlueprint(blueprint);
  assert.equal(result.success, true);
});

test('capability gap entry validates compliant secret handling and rejects plaintext secrets', () => {
  const validEntry = {
    id: 'repo-secrets',
    name: 'Repository Secrets',
    category: 'repository',
    docsRef:
      'references/github-docs/content/actions/concepts/security/secrets.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'repo-secrets',
    secretHandling: 'sealed_box_blank',
    emuConstraints: [],
    notes: 'Source secrets write-only; target defaults to sealed blank string.',
  };
  assert.equal(validateCapabilityGapEntry(validEntry).success, true);

  const invalidEntry = {
    ...validEntry,
    secretHandling: 'unencrypted_plaintext',
  };
  assert.equal(validateCapabilityGapEntry(invalidEntry).success, false);
});
