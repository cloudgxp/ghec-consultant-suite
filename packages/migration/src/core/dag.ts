import type { MigrationModule } from './module.js';

export class ModuleCycleError extends Error {
  readonly cycle: readonly string[];

  constructor(cycle: readonly string[]) {
    super(
      `Cyclic dependency detected in migration modules: ${cycle.join(' -> ')}`,
    );
    this.name = 'ModuleCycleError';
    this.cycle = cycle;
  }
}

export class MissingDependencyError extends Error {
  readonly moduleId: string;
  readonly missingDependency: string;

  constructor(moduleId: string, missingDependency: string) {
    super(
      `Module "${moduleId}" depends on "${missingDependency}", which is not registered.`,
    );
    this.name = 'MissingDependencyError';
    this.moduleId = moduleId;
    this.missingDependency = missingDependency;
  }
}

export interface TopologicalSortOptions {
  /**
   * If true, dependencies of the selected modules are automatically included
   * in the execution plan even if not explicitly passed in selectedModuleIds.
   * Default: true.
   */
  readonly autoIncludeDependencies?: boolean;
}

/**
 * Topologically sorts modules according to their declared dependencies.
 *
 * For any dependency edge A -> B (meaning A depends on B, so B must execute before A):
 * The returned array orders B before A.
 *
 * Throws `MissingDependencyError` if a required dependency is missing from the available modules.
 * Throws `ModuleCycleError` if a circular dependency is detected.
 */
export function sortModulesTopologically(
  selectedModuleIds: readonly string[],
  availableModules: ReadonlyMap<string, MigrationModule>,
  options: TopologicalSortOptions = {},
): MigrationModule[] {
  const autoInclude = options.autoIncludeDependencies ?? true;

  // Validate initial selection exists in registry
  for (const id of selectedModuleIds) {
    if (!availableModules.has(id)) {
      throw new Error(
        `Module "${id}" is not registered in the ModuleRegistry.`,
      );
    }
  }

  // Determine the full set of nodes to order
  const nodesToOrder = new Set<string>();

  function collectNodes(id: string, visitedPath: string[] = []) {
    if (visitedPath.includes(id)) {
      const cyclePath = [...visitedPath.slice(visitedPath.indexOf(id)), id];
      throw new ModuleCycleError(cyclePath);
    }

    const mod = availableModules.get(id);
    if (!mod) {
      const dependent = visitedPath[visitedPath.length - 1] ?? id;
      throw new MissingDependencyError(dependent, id);
    }

    if (nodesToOrder.has(id)) {
      return;
    }

    nodesToOrder.add(id);

    for (const depId of mod.dependencies) {
      if (autoInclude || selectedModuleIds.includes(depId)) {
        collectNodes(depId, [...visitedPath, id]);
      } else {
        throw new MissingDependencyError(id, depId);
      }
    }
  }

  for (const id of selectedModuleIds) {
    collectNodes(id);
  }

  // Tarjan's / DFS topological sort (post-order reversal)
  const result: MigrationModule[] = [];
  const state = new Map<string, 'visiting' | 'visited'>();

  function dfs(id: string, currentPath: string[]) {
    const s = state.get(id);
    if (s === 'visiting') {
      const cycleStart = currentPath.indexOf(id);
      const cyclePath = [...currentPath.slice(cycleStart), id];
      throw new ModuleCycleError(cyclePath);
    }
    if (s === 'visited') {
      return;
    }

    state.set(id, 'visiting');

    const mod = availableModules.get(id);
    if (!mod) {
      const dependent = currentPath[currentPath.length - 1] ?? id;
      throw new MissingDependencyError(dependent, id);
    }

    for (const dep of mod.dependencies) {
      if (nodesToOrder.has(dep)) {
        dfs(dep, [...currentPath, id]);
      }
    }

    state.set(id, 'visited');
    result.push(mod);
  }

  for (const id of nodesToOrder) {
    if (!state.has(id)) {
      dfs(id, []);
    }
  }

  return result;
}
