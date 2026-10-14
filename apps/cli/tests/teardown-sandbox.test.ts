import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  executeTeardownSandbox,
  validatePrefixFilter,
} from '../src/commands/teardown-sandbox.js';

describe('Sandbox Teardown Safety & Prefix Validation (US4)', () => {
  it('accepts valid prefix filters (e.g. dummy-, demo-)', () => {
    assert.doesNotThrow(() => validatePrefixFilter('dummy-'));
    assert.doesNotThrow(() => validatePrefixFilter('demo-migration-'));
    assert.doesNotThrow(() => validatePrefixFilter('test-wave1-'));
  });

  it('rejects short prefix filters (<3 characters)', () => {
    assert.throws(
      () => validatePrefixFilter(''),
      /prefixFilter "" is too short/,
    );
    assert.throws(
      () => validatePrefixFilter('d-'),
      /prefixFilter "d-" is too short/,
    );
  });

  it('rejects dangerous wildcard and generic filters (*, all, org, repo)', () => {
    assert.throws(
      () => validatePrefixFilter('*'),
      /Safety Violation.*wildcard/,
    );
    assert.throws(
      () => validatePrefixFilter('dummy*'),
      /Safety Violation.*wildcard/,
    );
    assert.throws(
      () => validatePrefixFilter('all'),
      /Safety Violation.*generic/,
    );
    assert.throws(
      () => validatePrefixFilter('test'),
      /Safety Violation.*generic/,
    );
  });

  it('rejects live teardown without explicit confirmation flag', async () => {
    await assert.rejects(async () => {
      await executeTeardownSandbox({
        org: 'test-sandbox-org',
        prefix: 'dummy-',
        dryRun: false,
        confirm: false,
      });
    }, /Live target sandbox teardown requires explicit --confirm flag/);
  });

  it('executes in dry-run mode safely without requiring token or confirm flag', async () => {
    const manifest = await executeTeardownSandbox({
      org: 'test-sandbox-org',
      prefix: 'dummy-',
      dryRun: true,
      confirm: false,
    });

    assert.equal(manifest.targetOrg, 'test-sandbox-org');
    assert.equal(manifest.prefixFilter, 'dummy-');
    assert.equal(manifest.dryRun, true);
    assert.equal(manifest.totalPurged, 0);
  });
});
