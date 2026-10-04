import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
} from './types.js';

/**
 * Standard contract for any targeted migration module.
 *
 * Implements the 4-stage lifecycle:
 * 1. discover(ctx, cachedData?): extracts source configuration (live or cached)
 * 2. plan(ctx, sourceData): diffs against destination and emits planned operations
 * 3. apply(ctx, plan): executes idempotent mutations against destination
 * 4. verify(ctx, plan): audits post-migration destination state against expected plan
 */
export interface MigrationModule<TDiscovered = unknown> {
  readonly id: string;
  readonly displayName: string;
  readonly scopeLevel: MigrationScopeLevel;
  readonly dependencies: readonly string[];

  discover(ctx: MigrationContext, cachedData?: unknown): Promise<TDiscovered>;
  plan(ctx: MigrationContext, sourceData: TDiscovered): Promise<ModulePlan>;
  apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult>;
  verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult>;
}
