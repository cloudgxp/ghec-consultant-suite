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
  environmentPolicyInventory,
} from '../src/lib/action-operations.js';
import { generateActionsOperationsCsv } from '../src/lib/export-csv.js';

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

const parsedSpecialized = validateBundle(
  JSON.parse(
    readFileSync(
      join(here, '../../../fixtures/synthetic/specialized-v1.json'),
      'utf8',
    ),
  ),
);
assert.equal(parsedSpecialized.success, true);
if (!parsedSpecialized.success) throw new Error(parsedSpecialized.message);

test('normalizes v1 Actions summaries into workflow records', () => {
  const workflows = workflowInventory(parsed.data);
  assert.equal(workflows.length, 2);
  assert.ok(workflows.every((item) => item.compatibility === 'v1-summary'));
  assert.ok(workflows.every((item) => item.runCount === null));
});

test('Actions operations export never contains secret inventory', () => {
  const csv = generateActionsOperationsCsv(parsed.data);
  assert.match(csv, /workflow/);
  assert.doesNotMatch(csv, /Fictional secret/);
  assert.doesNotMatch(csv, /actions-secret/);
});

test('runnersInventory correctly filters runner and runner-group entities', () => {
  const runners = runnersInventory(parsedSpecialized.data);
  assert.equal(runners.length, 3);
  assert.ok(
    runners.every(
      (entity) =>
        entity.kind === 'action-runner' ||
        entity.kind === 'action-runner-group',
    ),
  );
  assert.equal(
    runners.filter((item) => item.kind === 'action-runner').length,
    2,
  );
  assert.equal(
    runners.filter((item) => item.kind === 'action-runner-group').length,
    1,
  );

  // Assert that a bundle without runners returns an empty array
  const noRunners = runnersInventory(parsed.data);
  assert.equal(noRunners.length, 0);
});

test('operationsInventory correctly filters cache and artifact entities', () => {
  const operations = operationsInventory(parsedSpecialized.data);
  assert.equal(operations.length, 2);
  assert.ok(
    operations.every(
      (entity) =>
        entity.kind === 'action-cache' || entity.kind === 'action-artifact',
    ),
  );
  assert.equal(
    operations.filter((item) => item.kind === 'action-cache').length,
    1,
  );
  assert.equal(
    operations.filter((item) => item.kind === 'action-artifact').length,
    1,
  );

  // Assert that a bundle without operations returns an empty array
  const noOperations = operationsInventory(parsed.data);
  assert.equal(noOperations.length, 0);
});

test('environmentPolicyInventory correctly filters environment and policy entities', () => {
  const envPolicies = environmentPolicyInventory(parsedSpecialized.data);
  assert.equal(envPolicies.length, 2);
  assert.ok(
    envPolicies.every(
      (entity) =>
        entity.kind === 'action-environment' || entity.kind === 'action-policy',
    ),
  );

  // Assert that a bundle without these returns empty array (or 0)
  // Actually organization-v1.json has policy (for ruleset) but kind is "policy" not "action-policy"
  const noEnvPolicies = environmentPolicyInventory(parsed.data);
  assert.equal(noEnvPolicies.length, 0);
});
