import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ModuleRegistry,
  ModuleRegistrationError,
  type MigrationModule,
  type ModulePlan,
  type ModuleExecutionResult,
  type ModuleVerificationResult,
} from '../src/index.js';

function createMockModule(
  id: string,
  dependencies: string[] = [],
): MigrationModule {
  return {
    id,
    displayName: `Mock Module ${id}`,
    scopeLevel: 'repository',
    dependencies,
    async discover(): Promise<unknown> {
      return { mock: id };
    },
    async plan(): Promise<ModulePlan> {
      return {
        moduleId: id,
        scopeLevel: 'repository',
        targetIdentifier: 'org/repo',
        operations: [],
        warnings: [],
      };
    },
    async apply(): Promise<ModuleExecutionResult> {
      return {
        schemaVersion: '1.0.0',
        moduleId: id,
        status: 'complete',
        results: [],
        durationMs: 10,
      };
    },
    async verify(): Promise<ModuleVerificationResult> {
      return {
        moduleId: id,
        verified: true,
        discrepancies: [],
      };
    },
  };
}

describe('ModuleRegistry', () => {
  it('registers and retrieves modules by id', () => {
    const registry = new ModuleRegistry();
    const modA = createMockModule('module-a');
    const modB = createMockModule('module-b');

    registry.register(modA);
    registry.register(modB);

    assert.equal(registry.size, 2);
    assert.equal(registry.has('module-a'), true);
    assert.equal(registry.has('module-b'), true);
    assert.equal(registry.has('non-existent'), false);

    assert.equal(registry.get('module-a'), modA);
    assert.equal(registry.getOrThrow('module-b'), modB);
    assert.throws(() => registry.getOrThrow('missing'), /not registered/);
  });

  it('rejects duplicate module registration', () => {
    const registry = new ModuleRegistry();
    const mod1 = createMockModule('test-mod');
    const mod2 = createMockModule('test-mod');

    registry.register(mod1);
    assert.throws(
      () => registry.register(mod2),
      (err: unknown) => {
        return (
          err instanceof ModuleRegistrationError &&
          err.moduleId === 'test-mod' &&
          err.message.includes('already registered')
        );
      },
    );
  });

  it('rejects invalid module ids', () => {
    const registry = new ModuleRegistry();
    assert.throws(
      () => registry.register(createMockModule('')),
      ModuleRegistrationError,
    );
  });

  it('getAll returns all registered modules', () => {
    const registry = new ModuleRegistry();
    const m1 = createMockModule('m1');
    const m2 = createMockModule('m2');
    registry.registerAll([m1, m2]);

    const all = registry.getAll();
    assert.equal(all.length, 2);
    assert.deepEqual(
      all.map((m) => m.id),
      ['m1', 'm2'],
    );
  });
});
