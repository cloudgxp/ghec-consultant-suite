import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCHEMA_VERSION,
  validateBundle,
  type DiscoveryBundle,
} from '../src/index.js';

const fixtureNames = [
  'enterprise-v1',
  'organization-v1',
  'specialized-v1',
  'partial-denied-v1',
] as const;

function fixture(name: (typeof fixtureNames)[number]): DiscoveryBundle {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/synthetic/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as DiscoveryBundle;
}

test('the current release contract is frozen at v1.0.0', () => {
  assert.equal(SCHEMA_VERSION, '1.0.0');
  for (const name of fixtureNames) {
    const bundle = fixture(name);
    assert.equal(bundle.schemaVersion, SCHEMA_VERSION);
    assert.equal(validateBundle(bundle).success, true);
  }
});

test('v2 remains incompatible until an exact reader is registered', () => {
  const result = validateBundle({
    ...fixture('enterprise-v1'),
    schemaVersion: '2.0.0',
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'incompatible_version');
});
