import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefaultModuleRegistry } from '../../src/core/registry.js';
import { GAP_LEDGER_CATALOG } from '@ghec/contracts';

test('every registered migration module is represented in the gap ledger catalog', () => {
  const registry = createDefaultModuleRegistry();
  const registeredIds = new Set(registry.getAll().map((m) => m.id));

  assert.equal(registeredIds.size, 34);

  const ledgerImplementedIds = new Set(
    GAP_LEDGER_CATALOG.filter((e) => e.existingModuleId).map(
      (e) => e.existingModuleId as string,
    ),
  );

  for (const id of registeredIds) {
    assert.equal(
      ledgerImplementedIds.has(id),
      true,
      `Registered module "${id}" must be represented as an existingModuleId in GAP_LEDGER_CATALOG.`,
    );
  }
});

test('every implemented resource in gap ledger corresponds to a registered module', () => {
  const registry = createDefaultModuleRegistry();

  const implementedEntries = GAP_LEDGER_CATALOG.filter(
    (e) => e.status === 'implemented',
  );

  for (const entry of implementedEntries) {
    assert.ok(
      entry.existingModuleId,
      `Implemented resource "${entry.id}" must specify an existingModuleId.`,
    );
    assert.equal(
      registry.has(entry.existingModuleId),
      true,
      `Resource "${entry.id}" specifies existingModuleId "${entry.existingModuleId}" which is not registered in ModuleRegistry.`,
    );
  }
});
