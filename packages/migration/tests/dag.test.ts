import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ModuleRegistry,
  ModuleCycleError,
  MissingDependencyError,
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
    displayName: `Mock ${id}`,
    scopeLevel: 'repository',
    dependencies,
    async discover(): Promise<unknown> {
      return {};
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
        durationMs: 1,
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

describe('Topological Dependency Resolution (DAG)', () => {
  it('orders modules so dependencies execute first', () => {
    const registry = new ModuleRegistry();
    // rulesets depends on gei-repo
    // repo-variables depends on gei-repo
    // gei-repo has no dependencies
    const geiRepo = createMockModule('gei-repo', []);
    const rulesets = createMockModule('rulesets', ['gei-repo']);
    const repoVars = createMockModule('repo-variables', ['gei-repo']);

    registry.registerAll([rulesets, repoVars, geiRepo]);

    const plan = registry.resolveExecutionPlan(['rulesets', 'repo-variables']);
    const ids = plan.map((m) => m.id);

    assert.equal(ids.length, 3);
    assert.equal(ids[0], 'gei-repo');
    assert.ok(ids.indexOf('gei-repo') < ids.indexOf('rulesets'));
    assert.ok(ids.indexOf('gei-repo') < ids.indexOf('repo-variables'));
  });

  it('orders deep dependency chains correctly', () => {
    const registry = new ModuleRegistry();
    // A -> B -> C -> D
    const d = createMockModule('D', []);
    const c = createMockModule('C', ['D']);
    const b = createMockModule('B', ['C']);
    const a = createMockModule('A', ['B']);

    registry.registerAll([a, b, c, d]);

    const plan = registry.resolveExecutionPlan(['A']);
    const ids = plan.map((m) => m.id);

    assert.deepEqual(ids, ['D', 'C', 'B', 'A']);
  });

  it('detects simple cycles (A -> B -> A)', () => {
    const registry = new ModuleRegistry();
    const a = createMockModule('A', ['B']);
    const b = createMockModule('B', ['A']);

    registry.registerAll([a, b]);

    assert.throws(
      () => registry.resolveExecutionPlan(['A']),
      (err: unknown) => {
        return (
          err instanceof ModuleCycleError &&
          err.cycle.includes('A') &&
          err.cycle.includes('B')
        );
      },
    );
  });

  it('detects self-referential cycles (A -> A)', () => {
    const registry = new ModuleRegistry();
    const a = createMockModule('A', ['A']);

    registry.register(a);

    assert.throws(() => registry.resolveExecutionPlan(['A']), ModuleCycleError);
  });

  it('detects complex cycles (A -> B -> C -> A)', () => {
    const registry = new ModuleRegistry();
    const a = createMockModule('A', ['B']);
    const b = createMockModule('B', ['C']);
    const c = createMockModule('C', ['A']);

    registry.registerAll([a, b, c]);

    assert.throws(
      () => registry.resolveExecutionPlan(['A']),
      (err: unknown) => {
        return err instanceof ModuleCycleError && err.cycle.length >= 3;
      },
    );
  });

  it('throws MissingDependencyError when required dependency is missing from registry', () => {
    const registry = new ModuleRegistry();
    const a = createMockModule('A', ['non-existent-dep']);
    registry.register(a);

    assert.throws(
      () => registry.resolveExecutionPlan(['A']),
      (err: unknown) => {
        return (
          err instanceof MissingDependencyError &&
          err.moduleId === 'A' &&
          err.missingDependency === 'non-existent-dep'
        );
      },
    );
  });

  it('throws MissingDependencyError when autoIncludeDependencies is false and dep is not selected', () => {
    const registry = new ModuleRegistry();
    const gei = createMockModule('gei-repo', []);
    const rules = createMockModule('rulesets', ['gei-repo']);
    registry.registerAll([gei, rules]);

    assert.throws(
      () =>
        registry.resolveExecutionPlan(['rulesets'], {
          autoIncludeDependencies: false,
        }),
      (err: unknown) => {
        return (
          err instanceof MissingDependencyError &&
          err.moduleId === 'rulesets' &&
          err.missingDependency === 'gei-repo'
        );
      },
    );
  });

  it('handles diamond dependency graphs cleanly without duplicates', () => {
    const registry = new ModuleRegistry();
    //       Root
    //      /    \
    //    Dep1   Dep2
    //      \    /
    //       Base
    const base = createMockModule('Base', []);
    const dep1 = createMockModule('Dep1', ['Base']);
    const dep2 = createMockModule('Dep2', ['Base']);
    const root = createMockModule('Root', ['Dep1', 'Dep2']);

    registry.registerAll([root, dep1, dep2, base]);

    const plan = registry.resolveExecutionPlan(['Root']);
    const ids = plan.map((m) => m.id);

    assert.equal(ids.length, 4);
    assert.equal(ids[0], 'Base');
    assert.ok(ids.indexOf('Base') < ids.indexOf('Dep1'));
    assert.ok(ids.indexOf('Base') < ids.indexOf('Dep2'));
    assert.ok(ids.indexOf('Dep1') < ids.indexOf('Root'));
    assert.ok(ids.indexOf('Dep2') < ids.indexOf('Root'));
  });
});
