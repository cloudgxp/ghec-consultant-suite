import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  GAP_LEDGER_CATALOG,
  generateGapLedgerManifest,
  validateRoadmapWaveOrdering,
  DEFAULT_ROADMAP_WAVES,
} from '../src/index.js';

test('gap ledger inventory contains exactly 42 platform resources', () => {
  assert.equal(GAP_LEDGER_CATALOG.length, 42);
});

test('every docsRef in gap ledger catalog points to a real documentation file', () => {
  const repoRoot = process.cwd();
  for (const entry of GAP_LEDGER_CATALOG) {
    const fullPath = join(repoRoot, entry.docsRef);
    assert.equal(
      existsSync(fullPath),
      true,
      `Documentation reference "${entry.docsRef}" for resource "${entry.id}" must exist on disk.`,
    );
  }
});

test('generateGapLedgerManifest computes accurate summary and passes validation', () => {
  const manifest = generateGapLedgerManifest();
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.summary.totalResources, 42);
  assert.equal(
    manifest.summary.implementedCount +
      manifest.summary.partialCount +
      manifest.summary.missingCount,
    42,
  );
  assert.equal(manifest.resources.length, 42);
  assert.equal(manifest.waves.length, 3);
  assert.equal(validateRoadmapWaveOrdering(manifest.waves), true);
});

test('all EMU constraints declare non-empty description and actionable mitigation', () => {
  for (const entry of GAP_LEDGER_CATALOG) {
    for (const constraint of entry.emuConstraints) {
      assert.ok(constraint.description.length > 0);
      assert.ok(constraint.mitigation.length > 0);
    }
  }
});

test('roadmap wave ordering validates sequential wave numbers', () => {
  assert.equal(validateRoadmapWaveOrdering(DEFAULT_ROADMAP_WAVES), true);

  const brokenWaves = [
    {
      wave: 2,
      name: 'Wave 2',
      priority: 'P2' as const,
      moduleIds: ['m2'],
      rationale: 'r',
    },
    {
      wave: 1,
      name: 'Wave 1',
      priority: 'P1' as const,
      moduleIds: ['m1'],
      rationale: 'r',
    },
  ];
  assert.equal(validateRoadmapWaveOrdering(brokenWaves), false);
});
