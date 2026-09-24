import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DiscoveryBundle } from '@ghec/contracts';
import { evaluateBundle } from '../src/index.js';

function fixture(name: 'enterprise-v1' | 'organization-v1'): DiscoveryBundle {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/synthetic/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as DiscoveryBundle;
}

test('evaluateBundle on organization fixture produces expected insights', () => {
  const bundle = fixture('organization-v1');
  const insights = evaluateBundle(bundle);

  assert.ok(insights.dimensions.length >= 8);
  assert.equal(insights.collectorSummary.total, 11);
  assert.equal(insights.collectorSummary.complete, 10);
  assert.equal(insights.collectorSummary.partial, 1);
  assert.equal(insights.collectorSummary.failed, 0);

  // Check LFS dimension status - LFS has partial collector coverage
  const lfsDim = insights.dimensions.find((d) => d.id === 'MIG-LFS-001');
  assert.ok(lfsDim);
  // It has a medium severity finding or partial collector coverage -> review_required
  assert.equal(lfsDim.status, 'review_required');

  // Check Actions dimension - has self-hosted runner in org fixture
  const actionsDim = insights.dimensions.find(
    (d) => d.id === 'MIG-ACTIONS-001',
  );
  assert.ok(actionsDim);
  assert.equal(actionsDim.status, 'review_required');
});

test('evaluateBundle on enterprise fixture detects failed security collector and partial enumeration', () => {
  const bundle = fixture('enterprise-v1');
  const insights = evaluateBundle(bundle);

  // Scope limitations should include enterprise enumeration notice
  assert.ok(
    insights.scopeLimitations.some((l) =>
      l.includes('Enterprise enumeration is partial'),
    ),
  );

  // Security collector failed on fictional-south in enterprise-v1.json
  const secDim = insights.dimensions.find((d) => d.id === 'MIG-SECURITY-001');
  assert.ok(secDim);
  assert.equal(secDim.status, 'review_required');
  assert.ok(insights.collectorSummary.failed >= 1);
});

test('rules are pure and deterministic', () => {
  const bundle = fixture('organization-v1');
  const insights1 = evaluateBundle(bundle);
  const insights2 = evaluateBundle(bundle);

  assert.deepEqual(insights1, insights2);
});
