import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateBundle } from '@ghec/analysis';
import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';
import {
  buildPdfReportScope,
  generateExecutivePdf,
  generateTechnicalPdf,
} from '../src/lib/export-pdf.js';

async function loadFixture(): Promise<DiscoveryBundle> {
  const raw = await readFile(
    new URL('../../../fixtures/synthetic/enterprise-v1.json', import.meta.url),
    'utf8',
  );
  const result = validateBundle(JSON.parse(raw) as unknown);
  assert.equal(result.success, true);
  if (!result.success) throw new Error(result.message);
  return result.data;
}

test('PDF generators produce multi-page documents without network access', async () => {
  const bundle = await loadFixture();
  const insights = evaluateBundle(bundle);
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    networkCalls += 1;
    throw new Error('PDF generation attempted a network call');
  }) as typeof fetch;

  try {
    const executive = generateExecutivePdf(bundle, insights);
    const technical = generateTechnicalPdf(bundle, insights);
    const executiveBytes = new Uint8Array(executive.output('arraybuffer'));
    const technicalBytes = new Uint8Array(technical.output('arraybuffer'));

    assert.equal(new TextDecoder().decode(executiveBytes.slice(0, 4)), '%PDF');
    assert.equal(new TextDecoder().decode(technicalBytes.slice(0, 4)), '%PDF');
    assert.ok(executive.getNumberOfPages() >= 2);
    assert.ok(technical.getNumberOfPages() >= 2);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('organization selection scopes every report evidence collection', async () => {
  const bundle = await loadFixture();
  const insights = evaluateBundle(bundle);
  const organizationId = bundle.organizations[0]?.id;
  assert.ok(organizationId);

  const scope = buildPdfReportScope(bundle, insights, organizationId);
  assert.equal(scope.organizationCount, 1);
  assert.ok(scope.entities.length > 0);
  assert.ok(
    scope.entities.every((entity) => entity.organizationId === organizationId),
  );
  assert.ok(
    scope.collectors.every(
      (collector) => collector.organizationId === organizationId,
    ),
  );
  assert.ok(
    scope.findings.every(
      (finding) => finding.organizationId === organizationId,
    ),
  );

  assert.doesNotThrow(() =>
    generateExecutivePdf(bundle, insights, organizationId),
  );
  assert.doesNotThrow(() =>
    generateTechnicalPdf(bundle, insights, organizationId),
  );
});
