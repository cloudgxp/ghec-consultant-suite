import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMigrationPlan } from '../src/index.js';

const plan = {
  schemaVersion: '1.0.0',
  planId: 'plan-001',
  createdAt: '2026-10-04T12:00:00Z',
  scopeName: 'acme-to-contoso',
  summary: { create: 1, update: 1, noop: 0, skip: 0, warn: 0 },
  modules: [
    {
      moduleId: 'repo-variables',
      scopeLevel: 'repository',
      targetIdentifier: 'contoso-engineering/api',
      operations: [
        {
          id: 'variable-1',
          resourceType: 'actions-variable',
          resourceName: 'DEPLOY_REGION',
          operation: 'create',
          payload: { name: 'DEPLOY_REGION', value: 'us-east-1' },
        },
        {
          id: 'variable-2',
          resourceType: 'actions-variable',
          resourceName: 'FEATURE_FLAG',
          operation: 'update',
          sourceState: { value: 'enabled' },
          destinationCurrentState: { value: 'disabled' },
        },
      ],
      warnings: [],
    },
  ],
};

test('migration plan accepts a strict immutable operation plan', () => {
  assert.equal(validateMigrationPlan(plan).success, true);
});

test('migration plan rejects version drift, unknown fields, and mismatched summaries', () => {
  assert.equal(
    validateMigrationPlan({ ...plan, schemaVersion: '1.0.1' }).success,
    false,
  );
  assert.equal(
    validateMigrationPlan({ ...plan, summary: { ...plan.summary, create: 2 } })
      .success,
    false,
  );
  assert.equal(
    validateMigrationPlan({
      ...plan,
      modules: [{ ...plan.modules[0], unexpected: 'field' }],
    }).success,
    false,
  );
});
