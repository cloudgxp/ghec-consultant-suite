import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EntitySchema, validateBundle } from '@ghec/contracts';
import { configurationInventory, configurationCoverage, freshness } from '../src/lib/configuration-metadata.js';
import { generateConfigurationMetadataCsv } from '../src/lib/export-csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const parsed = validateBundle(
  JSON.parse(
    readFileSync(
      join(here, '../../../fixtures/synthetic/organization-v1.json'),
      'utf8',
    ),
  ),
);
assert.equal(parsed.success, true);
if (!parsed.success) throw new Error(parsed.message);

test('normalizes v1 actions-secret records into Actions metadata', () => {
  const records = configurationInventory(parsed.data);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.domain, 'actions');
  assert.equal(records[0]?.compatibility, 'v1-actions');
  assert.equal(records[0]?.selectedRepositoryCount, null);
});

test('configurationCoverage extracts configuration-coverage entities from the bundle', () => {
  const coverageEntities = configurationCoverage(parsed.data);
  // Based on the fixture we don't have configuration-coverage yet
  // but we should test the filter logic anyway
  assert.equal(Array.isArray(coverageEntities), true);

  // Construct a dummy bundle
  const dummyBundle: any = {
    entities: [
      { kind: 'configuration-metadata', id: '1' },
      { kind: 'configuration-coverage', id: '2', domain: 'actions', configurationKind: 'secret', totalLocations: 10, configuredLocations: 5 },
      { kind: 'actions-secret', id: '3' },
      { kind: 'configuration-coverage', id: '4', domain: 'dependabot', configurationKind: 'variable', totalLocations: 20, configuredLocations: 20 }
    ]
  };

  const extracted = configurationCoverage(dummyBundle);
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0]?.id, '2');
  assert.equal(extracted[1]?.id, '4');
});

test('metadata CSV declares zero values and contains no value-bearing columns', () => {
  const csv = generateConfigurationMetadataCsv(
    parsed.data,
    configurationInventory(parsed.data),
  );
  assert.match(csv, /ZERO VALUES/);
  assert.doesNotMatch(
    csv.split('\r\n')[2] ?? '',
    /Encrypted|Ciphertext|Value|Hash|Length/,
  );
});

test('freshness correctly classifies configuration records based on updatedAt', () => {
  const now = new Date('2024-01-01T00:00:00.000Z');

  const dummyRecord: any = {};

  // Test unknown when updatedAt is missing
  assert.equal(freshness({ ...dummyRecord, updatedAt: null }, now), 'unknown');
  assert.equal(freshness(dummyRecord, now), 'unknown');

  // Test current when updatedAt is within the last 365 days
  // Just under 365 days ago
  const currentDaysAgo = new Date(now.getTime() - (364 * 24 * 60 * 60 * 1000)).toISOString();
  assert.equal(freshness({ ...dummyRecord, updatedAt: currentDaysAgo }, now), 'current');

  // Test stale when updatedAt is older than 365 days
  // Just over 365 days ago
  const staleDaysAgo = new Date(now.getTime() - (366 * 24 * 60 * 60 * 1000)).toISOString();
  assert.equal(freshness({ ...dummyRecord, updatedAt: staleDaysAgo }, now), 'stale');
});

test('strict contract rejects secret value fields', () => {
  const legacy = parsed.data.entities.find(
    (entity) => entity.kind === 'actions-secret',
  );
  assert.ok(legacy);
  assert.equal(
    EntitySchema.safeParse({ ...legacy, value: 'must-not-exist' }).success,
    false,
  );
  assert.equal(
    EntitySchema.safeParse({ ...legacy, encrypted_value: 'must-not-exist' })
      .success,
    false,
  );
});
