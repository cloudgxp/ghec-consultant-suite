import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  ANALYSIS_PRESETS,
  DEFAULT_ANALYSIS_OPTIONS,
  evaluateBundle,
} from '../src/index.js';

function fixture(): DiscoveryBundle {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/synthetic/organization-v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as DiscoveryBundle;
}

test('custom repository thresholds change finding severity', () => {
  const insights = evaluateBundle(fixture(), {
    repoSizeWarningBytes: 256 * 1024,
    repoSizeCriticalBytes: 512 * 1024,
  });
  const sizeFinding = insights.findings.find(
    (finding) => finding.ruleId === 'MIG-SIZE-001',
  );
  assert.ok(sizeFinding);
  assert.equal(sizeFinding.severity, 'high');
  assert.match(sizeFinding.title, /0\.0 GB/);
});

test('LFS strictness controls unmeasured storage severity', () => {
  const strict = evaluateBundle(fixture(), {
    lfsCutoverStrictness: 'block_unmeasured',
  });
  const warning = evaluateBundle(fixture(), {
    lfsCutoverStrictness: 'warn_only',
  });
  const severity = (insights: typeof strict) =>
    insights.findings.find(
      (finding) =>
        finding.ruleId === 'MIG-LFS-001' &&
        finding.title.includes('unmeasured'),
    )?.severity;
  assert.equal(severity(strict), 'high');
  assert.equal(severity(warning), 'medium');
});

test('built-in profiles are complete and thresholds remain valid', () => {
  assert.equal(ANALYSIS_PRESETS.ghec_emu.options, DEFAULT_ANALYSIS_OPTIONS);
  for (const preset of Object.values(ANALYSIS_PRESETS)) {
    assert.ok(
      preset.options.repoSizeCriticalBytes >
        preset.options.repoSizeWarningBytes,
    );
    assert.doesNotThrow(() => evaluateBundle(fixture(), preset.options));
  }
});
