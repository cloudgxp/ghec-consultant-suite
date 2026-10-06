import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
  type MigrationPlan,
  type MigrationScope,
  type ModulePlan,
  validateBundle,
  validateMigrationPlan,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import { ModuleRegistry } from '../core/registry.js';
import type {
  MigrationContext,
  MigrationScopeTarget,
  StructuredLogger,
} from '../core/types.js';

export interface MigrationPlannerOptions {
  readonly scope: MigrationScope;
  readonly registry: ModuleRegistry;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  /** Cached discovery bundle. If supplied, validated and passed to discover() without source network calls. */
  readonly cachedDiscoveryBundle?: DiscoveryBundle | unknown | undefined;
  /** Modules to restrict planning to (defaults to all modules in scope). */
  readonly modules?: readonly string[] | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly runId?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

const defaultLogger: StructuredLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class MigrationPlanner {
  private readonly scope: MigrationScope;
  private readonly registry: ModuleRegistry;
  private readonly sourceClient: GitHubReadAdapter;
  private readonly targetClient: GitHubReadAdapter;
  private readonly cachedBundle?: DiscoveryBundle | undefined;
  private readonly modules?: readonly string[] | undefined;
  private readonly logger: StructuredLogger;
  private readonly runId: string;
  private readonly signal: AbortSignal;

  constructor(options: MigrationPlannerOptions) {
    this.scope = options.scope;
    this.registry = options.registry;
    this.sourceClient = options.sourceClient;
    this.targetClient = options.targetClient;
    this.modules = options.modules;
    this.logger = options.logger ?? defaultLogger;
    this.runId =
      options.runId ??
      `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.signal = options.signal ?? new AbortController().signal;

    if (options.cachedDiscoveryBundle) {
      const validation = validateBundle(options.cachedDiscoveryBundle);
      if (!validation.success) {
        throw new Error(
          `Invalid cached discovery bundle: ${validation.message} (code: ${validation.code})`,
        );
      }
      this.cachedBundle = validation.data;
    }
  }

  /**
   * Computes the complete migration plan across all scoped organizations
   * and repositories according to their configured modules.
   */
  async generatePlan(): Promise<MigrationPlan> {
    if (this.signal.aborted) {
      throw this.signal.reason ?? new Error('Planning aborted');
    }

    const modulePlans: ModulePlan[] = [];
    const summary = {
      create: 0,
      update: 0,
      noop: 0,
      skip: 0,
      warn: 0,
    };

    // 1. Process Organization-level Scopes
    for (const orgMapping of this.scope.organizations) {
      const orgScope: MigrationScopeTarget = {
        level: 'organization',
        sourceOrg: orgMapping.source,
        targetOrg: orgMapping.target,
      };

      let selectedModules: readonly string[] =
        orgMapping.modules ?? this.registry.getAll().map((m) => m.id);
      if (
        this.modules &&
        this.modules.length > 0 &&
        !this.modules.includes('all')
      ) {
        selectedModules = this.modules;
      }
      const executionModules = this.registry
        .resolveExecutionPlan(selectedModules)
        .filter((m) => m.scopeLevel === 'organization');

      for (const module of executionModules) {
        if (this.signal.aborted) {
          throw this.signal.reason ?? new Error('Planning aborted');
        }

        const ctx: MigrationContext = {
          runId: this.runId,
          scope: orgScope,
          sourceClient: this.sourceClient,
          targetClient: this.targetClient,
          signal: this.signal,
          dryRun: true,
          continueOnError: false,
          logger: this.logger,
        };

        const discovered = await module.discover(ctx, this.cachedBundle);
        const plan = await module.plan(ctx, discovered);

        // Ensure unique targetIdentifier is present
        const validatedModulePlan: ModulePlan = {
          ...plan,
          targetIdentifier: plan.targetIdentifier || `${orgMapping.target}`,
        };

        modulePlans.push(validatedModulePlan);

        for (const op of validatedModulePlan.operations) {
          summary[op.operation]++;
        }
      }
    }

    // 2. Process Repository-level Scopes
    for (const repoMapping of this.scope.repositories) {
      const repoKey = `${repoMapping.sourceOrg}/${repoMapping.sourceRepo}`;
      const repoOptions =
        repoMapping.options ??
        this.scope.repositoryOptions?.[repoKey] ??
        this.scope.repositoryOptions?.[repoMapping.sourceRepo];

      const repoScope: MigrationScopeTarget = {
        level: 'repository',
        sourceOrg: repoMapping.sourceOrg,
        targetOrg: repoMapping.targetOrg,
        sourceRepo: repoMapping.sourceRepo,
        targetRepo: repoMapping.targetRepo,
        options: repoOptions,
      };

      let selectedModules: readonly string[] =
        repoMapping.modules ?? this.registry.getAll().map((m) => m.id);
      if (
        this.modules &&
        this.modules.length > 0 &&
        !this.modules.includes('all')
      ) {
        selectedModules = this.modules;
      }
      const executionModules = this.registry
        .resolveExecutionPlan(selectedModules)
        .filter((m) => m.scopeLevel === 'repository');

      for (const module of executionModules) {
        if (this.signal.aborted) {
          throw this.signal.reason ?? new Error('Planning aborted');
        }

        const ctx: MigrationContext = {
          runId: this.runId,
          scope: repoScope,
          sourceClient: this.sourceClient,
          targetClient: this.targetClient,
          signal: this.signal,
          dryRun: true,
          continueOnError: false,
          logger: this.logger,
        };

        const discovered = await module.discover(ctx, this.cachedBundle);
        const plan = await module.plan(ctx, discovered);

        const validatedModulePlan: ModulePlan = {
          ...plan,
          targetIdentifier:
            plan.targetIdentifier ||
            `${repoMapping.targetOrg}/${repoMapping.targetRepo}`,
        };

        modulePlans.push(validatedModulePlan);

        for (const op of validatedModulePlan.operations) {
          summary[op.operation]++;
        }
      }
    }

    const migrationPlan: MigrationPlan = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      planId: this.runId,
      createdAt: new Date().toISOString(),
      scopeName: this.scope.name,
      summary,
      modules: modulePlans,
    };

    // Strict contract validation
    const validation = validateMigrationPlan(migrationPlan);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Generated plan failed schema validation: ${issues}`);
    }

    return validation.data;
  }
}

/**
 * Writes a migration plan to disk atomically with non-clobber protection.
 */
export function writeMigrationPlanFile(
  filePath: string,
  plan: MigrationPlan,
  options: { overwrite?: boolean } = {},
): string {
  if (existsSync(filePath) && !options.overwrite) {
    throw new Error(
      `Plan file "${filePath}" already exists. Set overwrite: true or use a unique destination.`,
    );
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tempPath = join(
    dir,
    `.${basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );
  const content = JSON.stringify(plan, null, 2);
  writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tempPath, filePath);

  return filePath;
}
