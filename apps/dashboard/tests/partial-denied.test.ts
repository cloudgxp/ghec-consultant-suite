import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBundle } from '@ghec/contracts';
import {
  workflowInventory,
  runnersInventory,
  operationsInventory,
} from '../src/lib/action-operations.js';
import {
  configurationInventory,
  configurationCoverage,
} from '../src/lib/configuration-metadata.js';
import { packageInventory } from '../src/lib/supply-chain.js';
import {
  generateActionsOperationsCsv,
  generateConfigurationMetadataCsv,
  generatePackagesCsv,
} from '../src/lib/export-csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  '../../../fixtures/synthetic/partial-denied-v1.json',
);
const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
const parsed = validateBundle(raw);

assert.equal(parsed.success, true);
if (!parsed.success) throw new Error(parsed.message);
const bundle = parsed.data;

test('partial fixture preserves honest unknown metrics across Actions and Security', () => {
  const actions = bundle.entities.find((e) => e.kind === 'actions');
  assert.ok(actions && actions.kind === 'actions');
  assert.equal(actions.runnerCount.availability, 'unknown');
  assert.equal(actions.runnerCount.value, null);
  assert.match(actions.runnerCount.reason ?? '', /403/);
  assert.equal(actions.usage.availability, 'unknown');
  assert.equal(actions.usage.value, null);

  const security = bundle.entities.find((e) => e.kind === 'security');
  assert.ok(security && security.kind === 'security');
  assert.equal(security.openAlertCount.availability, 'unknown');
  assert.equal(security.openAlertCount.value, null);
  assert.match(security.openAlertCount.reason ?? '', /403/);
});

test('workflowInventory handles denied run counts without inventing values', () => {
  const workflows = workflowInventory(bundle);
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0]?.name, 'Continuous Integration');
  assert.equal(workflows[0]?.runCount, null);
  assert.equal(workflows[0]?.compatibility, 'native');
});

test('runnersInventory and operationsInventory return empty arrays when endpoints were denied', () => {
  const runners = runnersInventory(bundle);
  assert.equal(runners.length, 0);

  const ops = operationsInventory(bundle);
  assert.equal(ops.length, 0);
});

test('configurationCoverage reflects HTTP 403 denied state', () => {
  const coverage = configurationCoverage(bundle);
  assert.equal(coverage.length, 1);
  assert.equal(coverage[0]?.domain, 'actions');
  assert.equal(coverage[0]?.state, 'denied');
  assert.match(coverage[0]?.reason ?? '', /403/);

  // Repository-level config was collected even though org config was denied
  const records = configurationInventory(bundle);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.name, 'APP_KEY');
  assert.equal(records[0]?.level, 'repository');
});

test('supply-chain inventory preserves unknown package size for denied metadata', () => {
  const packages = packageInventory(bundle);
  assert.equal(packages.length, 1);
  assert.equal(packages[0]?.name, 'restricted-app');
  assert.equal(packages[0]?.sizeBytes, null);
  assert.equal(packages[0]?.sizeAvailability, 'unknown');
});

test('CSV exports preserve unknown placeholders without fabricating zero', () => {
  const actionsCsv = generateActionsOperationsCsv(bundle);
  assert.match(actionsCsv, /Continuous Integration/);

  const configCsv = generateConfigurationMetadataCsv(
    bundle,
    configurationInventory(bundle),
  );
  assert.match(configCsv, /APP_KEY/);
  assert.match(configCsv, /ZERO VALUES/);

  const packagesCsv = generatePackagesCsv(bundle, packageInventory(bundle));
  assert.match(packagesCsv, /restricted-app/);
  assert.match(packagesCsv, /unknown/);
});
