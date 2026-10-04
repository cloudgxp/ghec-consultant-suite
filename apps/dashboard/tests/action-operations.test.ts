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

const specializedParsed = validateBundle(
  JSON.parse(
    readFileSync(
      join(here, '../../../fixtures/synthetic/specialized-v1.json'),
      'utf8',
    ),
  ),
);
assert.equal(specializedParsed.success, true);
if (!specializedParsed.success) throw new Error(specializedParsed.message);

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

test('runnersInventory extracts runners and runner groups', () => {
  const runners = runnersInventory(specializedParsed.data);
  assert.equal(runners.length, 3);
  assert.ok(
    runners.every(
      (item) =>
        item.kind === 'action-runner' || item.kind === 'action-runner-group',
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
});

test('operationsInventory extracts caches and artifacts', () => {
  const operations = operationsInventory(specializedParsed.data);
  assert.equal(operations.length, 2);
  assert.ok(
    operations.every(
      (item) => item.kind === 'action-cache' || item.kind === 'action-artifact',
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
});
