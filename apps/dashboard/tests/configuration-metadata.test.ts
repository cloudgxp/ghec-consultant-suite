import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EntitySchema, validateBundle } from '@ghec/contracts';
import { configurationInventory } from '../src/lib/configuration-metadata.js';
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
