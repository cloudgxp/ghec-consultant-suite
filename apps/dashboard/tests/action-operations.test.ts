import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBundle } from '@ghec/contracts';
import { workflowInventory } from '../src/lib/action-operations.js';
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
