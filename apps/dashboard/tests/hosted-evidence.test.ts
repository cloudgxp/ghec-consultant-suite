import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { probeHostedEvidence } from '../src/lib/importer.js';
import { SAMPLE_ORGANIZATION_BUNDLE } from '../src/lib/samples.js';
import { sampleDiscrepantVerificationReport } from '../src/lib/verification-diff.js';

describe('TASK-075: Hosted Private GitHub Pages Evidence Auto-Hydration', () => {
  it('hydrates discovery bundle and verification report when ./evidence/*.json endpoints return 200 JSON', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('discovery-bundle.json')) {
        return new Response(JSON.stringify(SAMPLE_ORGANIZATION_BUNDLE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('verification-report.json')) {
        return new Response(
          JSON.stringify(sampleDiscrepantVerificationReport),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const result = await probeHostedEvidence({ fetchFn: mockFetch });
    assert.equal(result.found, true);
    assert.equal(result.bundleResult?.success, true);
    if (result.bundleResult?.success) {
      assert.equal(
        result.bundleResult.bundle.organizations.length,
        SAMPLE_ORGANIZATION_BUNDLE.organizations.length,
      );
    }
    assert.ok(result.verificationReport);
    assert.equal(
      result.verificationReport?.reportId,
      sampleDiscrepantVerificationReport.reportId,
    );
  });

  it('falls back silently (found: false) when endpoints return 404 or Vite SPA HTML fallback', async () => {
    const mockSpaFallbackFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('discovery-bundle.json')) {
        return new Response('<!doctype html><html><body>SPA</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const result = await probeHostedEvidence({ fetchFn: mockSpaFallbackFetch });
    assert.equal(result.found, false);
    assert.equal(result.bundleResult, undefined);
    assert.equal(result.verificationReport, undefined);
  });
});
