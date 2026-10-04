import type { MigrationModule } from './module.js';
import {
  sortModulesTopologically,
  type TopologicalSortOptions,
} from './dag.js';

export class ModuleRegistrationError extends Error {
  readonly moduleId: string;

  constructor(moduleId: string, reason: string) {
    super(`Failed to register module "${moduleId}": ${reason}`);
    this.name = 'ModuleRegistrationError';
    this.moduleId = moduleId;
  }
}

/**
 * Registry managing all available migration modules and calculating
 * dependency-ordered execution pipelines.
 */
export class ModuleRegistry {
  private readonly modules = new Map<string, MigrationModule>();

  /**
   * Registers a migration module.
   * Throws `ModuleRegistrationError` if a module with the same ID is already registered.
   */
  register(module: MigrationModule): void {
    if (!module.id || typeof module.id !== 'string') {
      throw new ModuleRegistrationError(
        String(module.id),
        'Module ID must be a non-empty string.',
      );
    }
    if (this.modules.has(module.id)) {
      throw new ModuleRegistrationError(
        module.id,
        'A module with this ID is already registered.',
      );
    }
    this.modules.set(module.id, module);
  }

  /**
   * Registers multiple migration modules.
   */
  registerAll(modules: readonly MigrationModule[]): void {
    for (const module of modules) {
      this.register(module);
    }
  }

  /**
   * Retrieves a module by its unique ID.
   */
  get(id: string): MigrationModule | undefined {
    return this.modules.get(id);
  }

  /**
   * Asserts and retrieves a module by its unique ID.
   * Throws Error if not found.
   */
  getOrThrow(id: string): MigrationModule {
    const mod = this.modules.get(id);
    if (!mod) {
      throw new Error(
        `Module "${id}" is not registered in the ModuleRegistry.`,
      );
    }
    return mod;
  }

  /**
   * Checks if a module with the given ID is registered.
   */
  has(id: string): boolean {
    return this.modules.has(id);
  }

  /**
   * Returns all registered modules as an array.
   */
  getAll(): readonly MigrationModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Returns the count of registered modules.
   */
  get size(): number {
    return this.modules.size;
  }

  /**
   * Computes a dependency-ordered execution plan for the selected module IDs.
   *
   * Dependencies of each module are guaranteed to be placed before the module in the returned array.
   */
  resolveExecutionPlan(
    selectedModuleIds: readonly string[],
    options?: TopologicalSortOptions,
  ): MigrationModule[] {
    return sortModulesTopologically(selectedModuleIds, this.modules, options);
  }
}
