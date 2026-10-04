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

import { RepoVariablesMigrationModule } from '../modules/repo-variables/module.js';
import { OrgVariablesMigrationModule } from '../modules/org-variables/module.js';
import { OrgSecretsMigrationModule } from '../modules/org-secrets/module.js';
import { RepoSecretsMigrationModule } from '../modules/repo-secrets/module.js';

class GeiRepoMigrationModule implements MigrationModule {
  readonly id = 'gei-repo';
  readonly displayName = 'GEI Repository Migration';
  readonly scopeLevel = 'repository' as const;
  readonly dependencies: readonly string[] = [];

  async discover() {
    return {};
  }

  async plan(ctx: unknown) {
    void ctx;
    return {
      moduleId: 'gei-repo' as const,
      scopeLevel: 'repository' as const,
      targetIdentifier: '',
      operations: [],
      warnings: [],
    };
  }

  async apply(ctx: unknown) {
    void ctx;
    return {
      schemaVersion: '1.0.0' as const,
      moduleId: 'gei-repo' as const,
      status: 'complete' as const,
      results: [],
      durationMs: 0,
    };
  }

  async verify(ctx: unknown) {
    void ctx;
    return {
      moduleId: 'gei-repo' as const,
      verified: true,
      discrepancies: [],
    };
  }
}

import { RulesetsMigrationModule } from '../modules/rulesets/module.js';
import { BranchProtectionReconciliationModule } from '../modules/branch-protection/module.js';
import { TeamsMigrationModule } from '../modules/teams/module.js';
import { MannequinReclamationEngine } from '../post-migration/mannequins/engine.js';
import { EnvironmentsMigrationModule } from '../modules/environments/module.js';

/**
 * Creates and returns a ModuleRegistry pre-populated with all built-in migration modules.
 */
export function createDefaultModuleRegistry(): ModuleRegistry {
  const registry = new ModuleRegistry();
  registry.register(new GeiRepoMigrationModule());
  registry.register(new RepoVariablesMigrationModule());
  registry.register(new OrgVariablesMigrationModule());
  registry.register(new OrgSecretsMigrationModule());
  registry.register(new RepoSecretsMigrationModule());
  registry.register(new EnvironmentsMigrationModule());
  registry.register(new RulesetsMigrationModule());
  registry.register(new BranchProtectionReconciliationModule());
  registry.register(new TeamsMigrationModule());
  registry.register(new MannequinReclamationEngine());
  return registry;
}
