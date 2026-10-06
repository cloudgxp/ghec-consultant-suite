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

import { GeiRepoMigrationModule } from '../modules/gei-repo/module.js';

import { RulesetsMigrationModule } from '../modules/rulesets/module.js';
import { BranchProtectionReconciliationModule } from '../modules/branch-protection/module.js';
import { TeamsMigrationModule } from '../modules/teams/module.js';
import { MannequinReclamationEngine } from '../post-migration/mannequins/engine.js';
import { EnvironmentsMigrationModule } from '../modules/environments/module.js';
import { WebhooksMigrationModule } from '../modules/webhooks/module.js';
import { RepoSettingsMigrationModule } from '../modules/repo-settings/module.js';
import { OrgCustomPropertiesMigrationModule } from '../modules/org-custom-properties/module.js';
import { RepoCustomPropertiesMigrationModule } from '../modules/repo-custom-properties/module.js';
import { CodeownersRepairModule } from '../post-migration/codeowners/module.js';
import { GhasSecurityMigrationModule } from '../post-migration/security/module.js';
import { ReleasesMigrationModule } from '../modules/releases/module.js';
import { DeployKeysMigrationModule } from '../modules/deploy-keys/module.js';
import { CollaboratorsMigrationModule } from '../modules/collaborators/module.js';
import { LfsMigrationModule } from '../modules/lfs/module.js';
import { PackagesMigrationModule } from '../modules/packages/module.js';

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
  registry.register(new WebhooksMigrationModule());
  registry.register(new RepoSettingsMigrationModule());
  registry.register(new OrgCustomPropertiesMigrationModule());
  registry.register(new RepoCustomPropertiesMigrationModule());
  registry.register(new RulesetsMigrationModule());
  registry.register(new BranchProtectionReconciliationModule());
  registry.register(new TeamsMigrationModule());
  registry.register(new MannequinReclamationEngine());
  registry.register(new CodeownersRepairModule());
  registry.register(new GhasSecurityMigrationModule());
  registry.register(new ReleasesMigrationModule());
  registry.register(new DeployKeysMigrationModule());
  registry.register(new CollaboratorsMigrationModule());
  registry.register(new LfsMigrationModule());
  registry.register(new PackagesMigrationModule());
  return registry;
}
