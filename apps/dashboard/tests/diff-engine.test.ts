import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateBundle, type EvaluatedInsights } from '@ghec/analysis';
import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';
import {
  diffScans,
  generateRemediationCsv,
  scopesMatch,
} from '../src/lib/diff-engine.js';

async function fixture(): Promise<DiscoveryBundle> {
  const raw = await readFile(
    new URL(
      '../../../fixtures/synthetic/organization-v1.json',
      import.meta.url,
    ),
    'utf8',
  );
  const validation = validateBundle(JSON.parse(raw) as unknown);
  assert.equal(validation.success, true);
  if (!validation.success) throw new Error(validation.message);
  return validation.data;
}

test('diff engine classifies resolved, persistent, and new findings', async () => {
  const baselineBundle = await fixture();
  const baselineInsights = evaluateBundle(baselineBundle);
  assert.ok(baselineInsights.findings.length >= 2);
  const persistent = baselineInsights.findings[0];
  const resolved = baselineInsights.findings[1];
  assert.ok(persistent && resolved);
  const introduced = {
    ...resolved,
    id: 'finding:new-regression',
    ruleId: 'MIG-NEW-001',
    title: 'New regression',
    entityIds: [resolved.entityIds[0] ?? 'entity:new'],
  };
  const currentInsights: EvaluatedInsights = {
    ...baselineInsights,
    findings: [persistent, introduced],
  };
  const currentBundle: DiscoveryBundle = {
    ...baselineBundle,
    scan: { ...baselineBundle.scan, id: 'follow-up-scan' },
  };
  const result = diffScans(
    baselineBundle,
    { ...baselineInsights, findings: [persistent, resolved] },
    currentBundle,
    currentInsights,
  );
  assert.equal(result.resolved, 1);
  assert.equal(result.persistent, 1);
  assert.equal(result.new, 1);
  assert.equal(result.baselineScanId, baselineBundle.scan.id);
  assert.equal(result.currentScanId, 'follow-up-scan');
});

test('scope mismatch is rejected clearly', async () => {
  const baseline = await fixture();
  const current = {
    ...baseline,
    scope: { kind: 'organization' as const, organizationId: 'org:other' },
  };
  assert.equal(scopesMatch(baseline, current), false);
  assert.throws(
    () =>
      diffScans(
        baseline,
        evaluateBundle(baseline),
        current,
        evaluateBundle(current),
      ),
    /scopes do not match/i,
  );
});

test('remediation CSV neutralizes spreadsheet formulas', async () => {
  const bundle = await fixture();
  const insights = evaluateBundle(bundle);
  const finding = insights.findings[0];
  assert.ok(finding);
  const dangerous: EvaluatedInsights = {
    ...insights,
    findings: [{ ...finding, title: '=HYPERLINK("bad")' }],
  };
  const diff = diffScans(
    bundle,
    { ...insights, findings: [] },
    { ...bundle, scan: { ...bundle.scan, id: 'current' } },
    dangerous,
  );
  assert.match(generateRemediationCsv(diff), /'=HYPERLINK/);
});
