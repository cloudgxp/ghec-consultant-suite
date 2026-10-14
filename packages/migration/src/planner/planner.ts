import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
import {
  isAutoModuleSelection,
  parseModuleSelectionFlags,
  resolveAutoOrganizationModules,
  resolveAutoRepositoryModules,
} from '../orchestrator/module-resolver.js';

export interface MigrationPlannerOptions {
  readonly scope: MigrationScope;
  readonly registry: ModuleRegistry;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  /** Cached discovery bundle. If supplied, validated and passed to discover() without source network calls. */
  readonly cachedDiscoveryBundle?: DiscoveryBundle | unknown | undefined;
  /** Modules to restrict planning to (defaults to all modules in scope, or "auto"). */
  readonly modules?: readonly string[] | undefined;
  /** Modules to explicitly exclude from planning and execution. */
  readonly excludeModules?: readonly string[] | undefined;
  /** When true, resolves full verification module set even under "auto" mode. */
  readonly verificationMode?: boolean | undefined;
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
  private readonly excludeModules?: readonly string[] | undefined;
  private readonly verificationMode: boolean;
  private readonly logger: StructuredLogger;
  private readonly runId: string;
  private readonly signal: AbortSignal;

  constructor(options: MigrationPlannerOptions) {
    this.scope = options.scope;
    this.registry = options.registry;
    this.sourceClient = options.sourceClient;
    this.targetClient = options.targetClient;
    this.modules = options.modules;
    this.excludeModules = options.excludeModules;
    this.verificationMode = options.verificationMode ?? false;
    this.logger = options.logger ?? defaultLogger;
    this.runId =
      options.runId ?? `plan-${Date.now()}-${randomBytes(4).toString('hex')}`;
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

    const cliParsed = parseModuleSelectionFlags(
      this.modules,
      this.excludeModules,
    );

    // 1. Process Organization-level Scopes
    for (const orgMapping of this.scope.organizations) {
      const effectiveTargetType =
        orgMapping.targetType ??
        this.scope.targetType ??
        (this.scope.identityMapping?.strategy === 'pass-through'
          ? 'ghec'
          : 'emu');
      const orgScope: MigrationScopeTarget = {
        level: 'organization',
        sourceOrg: orgMapping.source,
        targetOrg: orgMapping.target,
        targetType: effectiveTargetType,
        identityMapping: this.scope.identityMapping,
      };

      const orgParsed = parseModuleSelectionFlags(
        orgMapping.modules,
        cliParsed.excludeModules,
      );
      const effectiveExcludes = orgParsed.excludeModules;
      const registeredOrgIds = this.registry
        .getAll()
        .filter((m) => m.scopeLevel === 'organization')
        .map((m) => m.id);

      let selectedModules: readonly string[];
      if (orgMapping.modules !== undefined && orgMapping.modules.length === 0) {
        selectedModules =
          cliParsed.modules && !cliParsed.isAuto ? cliParsed.modules : [];
      } else if (cliParsed.isAuto || orgParsed.isAuto) {
        const baseOrgIds =
          orgParsed.modules && !isAutoModuleSelection(orgParsed.modules)
            ? orgParsed.modules.filter((id) => this.registry.has(id))
            : registeredOrgIds;
        const resolved = resolveAutoOrganizationModules(
          orgMapping,
          baseOrgIds,
          effectiveExcludes,
        );
        selectedModules = this.verificationMode
          ? resolved.verifyModules
          : resolved.applyModules;
      } else {
        selectedModules =
          orgParsed.modules ??
          orgMapping.modules ??
          this.registry.getAll().map((m) => m.id);
        if (cliParsed.modules && cliParsed.modules.length > 0) {
          selectedModules = cliParsed.modules;
        }
      }
      const executionModules = this.registry
        .resolveExecutionPlan(selectedModules, {
          excludeModules: effectiveExcludes,
        })
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
      const matchingOrg = this.scope.organizations.find(
        (o) => o.target === repoMapping.targetOrg,
      );
      const effectiveTargetType =
        matchingOrg?.targetType ??
        this.scope.targetType ??
        (this.scope.identityMapping?.strategy === 'pass-through'
          ? 'ghec'
          : 'emu');

      const repoScope: MigrationScopeTarget = {
        level: 'repository',
        sourceOrg: repoMapping.sourceOrg,
        targetOrg: repoMapping.targetOrg,
        sourceRepo: repoMapping.sourceRepo,
        targetRepo: repoMapping.targetRepo,
        targetType: effectiveTargetType,
        identityMapping: this.scope.identityMapping,
        options: repoOptions,
      };

      const repoParsed = parseModuleSelectionFlags(
        repoMapping.modules,
        cliParsed.excludeModules,
      );
      const effectiveExcludes = repoParsed.excludeModules;
      const registeredRepoIds = this.registry
        .getAll()
        .filter((m) => m.scopeLevel === 'repository')
        .map((m) => m.id);

      let selectedModules: readonly string[];
      if (
        repoMapping.modules !== undefined &&
        repoMapping.modules.length === 0
      ) {
        selectedModules =
          cliParsed.modules && !cliParsed.isAuto ? cliParsed.modules : [];
      } else if (cliParsed.isAuto || repoParsed.isAuto) {
        const baseRepoIds =
          repoParsed.modules && !isAutoModuleSelection(repoParsed.modules)
            ? repoParsed.modules.filter((id) => this.registry.has(id))
            : registeredRepoIds;
        const resolved = resolveAutoRepositoryModules(repoMapping, {
          repositoryOptions: this.scope.repositoryOptions,
          baseModules: baseRepoIds,
          excludeModules: effectiveExcludes,
        });
        selectedModules = this.verificationMode
          ? resolved.verifyModules
          : resolved.applyModules;
      } else {
        selectedModules =
          repoParsed.modules ??
          repoMapping.modules ??
          this.registry.getAll().map((m) => m.id);
        if (cliParsed.modules && cliParsed.modules.length > 0) {
          selectedModules = cliParsed.modules;
        }
      }
      const executionModules = this.registry
        .resolveExecutionPlan(selectedModules, {
          excludeModules: effectiveExcludes,
        })
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
    `.${basename(filePath)}.tmp.${Date.now()}.${randomBytes(4).toString('hex')}`,
  );
  const content = JSON.stringify(plan, null, 2);
  writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(tempPath, filePath);

  return filePath;
}
