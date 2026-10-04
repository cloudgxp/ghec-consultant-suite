import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateBundle } from '@ghec/contracts';
import {
  packageInventory,
  releaseAssetInventory,
} from '../src/lib/supply-chain.js';
import {
  generatePackagesCsv,
  generateReleaseAssetsCsv,
} from '../src/lib/export-csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(here, '../../../fixtures/synthetic/organization-v1.json'),
    'utf8',
  ),
);
const validation = validateBundle(fixture);
assert.equal(validation.success, true);
if (!validation.success) throw new Error(validation.message);
const bundle = validation.data;

test('projects native packages and legacy v1 assets without inventing values', () => {
  const packages = packageInventory(bundle);
  assert.equal(packages.length, 1);
  assert.equal(packages[0]?.ecosystem, 'npm');
  assert.equal(packages[0]?.sizeBytes, null);

  const releases = releaseAssetInventory(bundle);
  const legacy = releases.find((record) => record.compatibility === 'v1-asset');
  assert.equal(legacy?.kind, 'release');
  assert.equal(
    legacy?.detail,
    'Legacy v1 asset; detailed metadata was not collected',
  );
});

test('filtered supply-chain exports retain evidence and unknown metrics', () => {
  const packagesCsv = generatePackagesCsv(bundle, packageInventory(bundle));
  assert.match(packagesCsv, /fictional-package/);
  assert.match(packagesCsv, /unknown/);
  assert.match(packagesCsv, /fictional-example/);

  const assetsCsv = generateReleaseAssetsCsv(
    bundle,
    releaseAssetInventory(bundle),
  );
  assert.match(assetsCsv, /fictional-release/);
  assert.match(assetsCsv, /v1-asset/);
});
