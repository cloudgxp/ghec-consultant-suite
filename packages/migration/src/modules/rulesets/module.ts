import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
  type ModuleExecutionResult,
  type ModulePlan,
  type ModuleVerificationResult,
  type OperationExecutionResult,
  type PlannedOperation,
  type VerificationDiscrepancy,
} from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import {
  areRulesetsEqual,
  isInheritedOrganizationRuleset,
  sanitizeRulesetPayload,
} from './ruleset-mapper.js';
import type {
  BypassActor,
  GitHubRuleset,
  RulesetConditions,
  RulesetEnforcement,
  RulesetRule,
  RulesetsData,
  RulesetSourceType,
  RulesetTarget,
} from './types.js';

interface RawRulesetItem {
  id?: number;
  name: string;
  target?: string;
  enforcement?: string;
  source_type?: string;
  source?: string;
  conditions?: Record<string, unknown>;
  rules?: Array<Record<string, unknown>>;
  bypass_actors?: Array<Record<string, unknown>>;
}

export class RulesetsMigrationModule implements MigrationModule<RulesetsData> {
  readonly id = 'rulesets';
  readonly displayName = 'Repository & Organization Rulesets';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  async discover(
    ctx: MigrationContext,
    cachedData?: DiscoveryBundle | unknown,
  ): Promise<RulesetsData> {
    const isRepo = ctx.scope.level === 'repository';
    const repo = ctx.scope.sourceRepo;

    // 1. Cached discovery bundle mode
    if (
      cachedData &&
      typeof cachedData === 'object' &&
      'entities' in cachedData
    ) {
      const bundle = cachedData as DiscoveryBundle;
      const rulesets: GitHubRuleset[] = [];

      for (const entity of bundle.entities) {
        if (entity.kind === 'policy' && entity.policyKind === 'ruleset') {
          const raw = ((entity as Record<string, unknown>)['rawPayload'] ??
            entity) as Record<string, unknown>;
          if (raw && typeof raw === 'object' && 'name' in raw) {
            rulesets.push(
              this.normalizeRuleset(raw as unknown as RawRulesetItem),
            );
          }
        }
      }

      if (rulesets.length > 0) {
        return { rulesets };
      }
    }

    // 2. Live API mode
    const path = isRepo
      ? `/repos/${ctx.scope.sourceOrg}/${repo}/rulesets`
      : `/orgs/${ctx.scope.sourceOrg}/rulesets`;

    try {
      const res = await ctx.sourceClient.readSingle<RawRulesetItem[]>(
        {
          id: `rest.rulesets.list-${ctx.scope.level}`,
          transport: 'rest',
          verifiedReadOnly: true,
          path,
          pathParams: isRepo
            ? { owner: ctx.scope.sourceOrg, repo: repo! }
            : { org: ctx.scope.sourceOrg },
        },
        ctx.signal,
      );

      const items = Array.isArray(res.data) ? res.data : [];
      const rulesets = items.map((item) => this.normalizeRuleset(item));
      return { rulesets };
    } catch (err) {
      ctx.logger.warn(
        `Failed to list rulesets for ${ctx.scope.level}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { rulesets: [] };
    }
  }

  async plan(
    ctx: MigrationContext,
    sourceData: RulesetsData,
  ): Promise<ModulePlan> {
    const isRepo = ctx.scope.level === 'repository';
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetIdentifier = isRepo
      ? `${ctx.scope.targetOrg}/${targetRepo}`
      : ctx.scope.targetOrg;

    // Query destination rulesets
    const targetRulesets: GitHubRuleset[] = [];
    const path = isRepo
      ? `/repos/${ctx.scope.targetOrg}/${targetRepo}/rulesets`
      : `/orgs/${ctx.scope.targetOrg}/rulesets`;

    try {
      const res = await ctx.targetClient.readSingle<RawRulesetItem[]>(
        {
          id: `rest.rulesets.list-target-${ctx.scope.level}`,
          transport: 'rest',
          verifiedReadOnly: true,
          path,
          pathParams: isRepo
            ? { owner: ctx.scope.targetOrg, repo: targetRepo }
            : { org: ctx.scope.targetOrg },
        },
        ctx.signal,
      );
      if (Array.isArray(res.data)) {
        for (const item of res.data) {
          targetRulesets.push(this.normalizeRuleset(item));
        }
      }
    } catch (err) {
      ctx.logger.warn(
        `Could not query target rulesets: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const targetMapByName = new Map<string, GitHubRuleset>();
    for (const tr of targetRulesets) {
      targetMapByName.set(tr.name, tr);
    }

    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];
    const opPrefix = isRepo && targetRepo ? `${targetRepo}-` : '';

    for (const sourceRuleset of sourceData.rulesets) {
      // Inherited org rulesets cannot be migrated at repo level
      if (isRepo && isInheritedOrganizationRuleset(sourceRuleset)) {
        warnings.push(
          `Ruleset "${sourceRuleset.name}" is inherited from Organization and cannot be migrated at repository level.`,
        );
        continue;
      }

      const existingTarget = targetMapByName.get(sourceRuleset.name);

      if (!existingTarget) {
        operations.push({
          id: `ruleset-create-${opPrefix}${sourceRuleset.name}`,
          operation: 'create',
          resourceType: 'ruleset',
          resourceName: sourceRuleset.name,
          sourceState: sourceRuleset,
          payload: sanitizeRulesetPayload(sourceRuleset),
          reason: 'Ruleset is missing on target.',
        });
      } else if (isRepo && isInheritedOrganizationRuleset(existingTarget)) {
        // Target has an inherited ruleset of the same name: do not attempt to overwrite!
        operations.push({
          id: `ruleset-skip-${opPrefix}${sourceRuleset.name}`,
          operation: 'skip',
          resourceType: 'ruleset',
          resourceName: sourceRuleset.name,
          sourceState: sourceRuleset,
          destinationCurrentState: existingTarget,
          reason:
            'Target ruleset is inherited from Organization; repository mutation not permitted.',
        });
      } else if (areRulesetsEqual(sourceRuleset, existingTarget)) {
        operations.push({
          id: `ruleset-noop-${opPrefix}${sourceRuleset.name}`,
          operation: 'noop',
          resourceType: 'ruleset',
          resourceName: sourceRuleset.name,
          sourceState: sourceRuleset,
          destinationCurrentState: existingTarget,
          reason: 'Ruleset configuration is identical on target.',
        });
      } else {
        operations.push({
          id: `ruleset-update-${opPrefix}${sourceRuleset.name}`,
          operation: 'update',
          resourceType: 'ruleset',
          resourceName: sourceRuleset.name,
          sourceState: sourceRuleset,
          destinationCurrentState: existingTarget,
          payload: {
            rulesetId: existingTarget.id,
            ...sanitizeRulesetPayload(sourceRuleset),
          },
          reason: 'Ruleset parameters or conditions differ on target.',
        });
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: ctx.scope.level,
      targetIdentifier,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const isRepo = ctx.scope.level === 'repository';
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const results: OperationExecutionResult[] = [];

    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be configured to apply ruleset mutations.',
      );
    }

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'noop' || op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `[DryRun] Would execute ${op.operation} for ruleset "${op.resourceName}"`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      try {
        let writeOp: TargetWriteOperation;

        if (op.operation === 'create') {
          const basePath = isRepo
            ? `/repos/${ctx.scope.targetOrg}/${targetRepo}/rulesets`
            : `/orgs/${ctx.scope.targetOrg}/rulesets`;
          writeOp = {
            id: op.id,
            method: 'POST',
            path: basePath,
            body: op.payload,
          };
        } else if (op.operation === 'update') {
          const payload = op.payload as Record<string, unknown>;
          const rulesetId = payload.rulesetId;
          const { rulesetId: _, ...updateBody } = payload;
          void _;

          const basePath = isRepo
            ? `/repos/${ctx.scope.targetOrg}/${targetRepo}/rulesets/${rulesetId}`
            : `/orgs/${ctx.scope.targetOrg}/rulesets/${rulesetId}`;
          writeOp = {
            id: op.id,
            method: 'PUT',
            path: basePath,
            body: updateBody,
          };
        } else {
          continue;
        }

        const res = await ctx.targetWriteClient!.mutate(writeOp, ctx.signal);
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: res.status,
          completedAt: new Date().toISOString(),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({
          operationId: op.id,
          status: 'failed',
          error: errorMsg.slice(0, 2048),
          completedAt: new Date().toISOString(),
        });
        if (!ctx.continueOnError) break;
      }
    }

    const hasFailed = results.some((r) => r.status === 'failed');
    const hasSucceeded = results.some((r) => r.status === 'succeeded');
    let overallStatus: ModuleExecutionResult['status'];

    if (!hasFailed && hasSucceeded) {
      overallStatus = 'complete';
    } else if (hasFailed && hasSucceeded) {
      overallStatus = 'partial';
    } else if (hasFailed && !hasSucceeded) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'skipped';
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: overallStatus,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const isRepo = ctx.scope.level === 'repository';
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    const path = isRepo
      ? `/repos/${ctx.scope.targetOrg}/${targetRepo}/rulesets`
      : `/orgs/${ctx.scope.targetOrg}/rulesets`;

    const targetMapByName = new Map<string, GitHubRuleset>();
    try {
      const res = await ctx.targetClient.readSingle<RawRulesetItem[]>(
        {
          id: `rest.rulesets.verify-${ctx.scope.level}`,
          transport: 'rest',
          verifiedReadOnly: true,
          path,
          pathParams: isRepo
            ? { owner: ctx.scope.targetOrg, repo: targetRepo }
            : { org: ctx.scope.targetOrg },
        },
        ctx.signal,
      );
      if (Array.isArray(res.data)) {
        for (const item of res.data) {
          const r = this.normalizeRuleset(item);
          targetMapByName.set(r.name, r);
        }
      }
    } catch (err) {
      discrepancies.push({
        resourceName: 'rulesets-query',
        expected: 'HTTP 200 list of rulesets',
        actual: err instanceof Error ? err.message : String(err),
        message: 'Failed to query target rulesets during verification.',
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    for (const op of plan.operations) {
      if (op.operation === 'skip') continue;

      const sourceState = op.sourceState as GitHubRuleset | undefined;
      if (!sourceState) continue;

      const targetState = targetMapByName.get(sourceState.name);
      if (!targetState) {
        discrepancies.push({
          resourceName: sourceState.name,
          expected: sourceState,
          actual: null,
          message: `Ruleset "${sourceState.name}" is missing on destination.`,
        });
      } else if (!areRulesetsEqual(sourceState, targetState)) {
        discrepancies.push({
          resourceName: sourceState.name,
          expected: sourceState,
          actual: targetState,
          message: `Ruleset "${sourceState.name}" parameters or conditions do not match expected source configuration.`,
        });
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }

  private normalizeRuleset(raw: RawRulesetItem): GitHubRuleset {
    const ruleset: GitHubRuleset = {
      name: raw.name,
      enforcement: (raw.enforcement as RulesetEnforcement) ?? 'active',
      ...(raw.id !== undefined ? { id: raw.id } : {}),
      ...(raw.target ? { target: raw.target as RulesetTarget } : {}),
      ...(raw.source_type
        ? { source_type: raw.source_type as RulesetSourceType }
        : {}),
      ...(raw.source ? { source: raw.source } : {}),
      ...(raw.conditions
        ? { conditions: raw.conditions as unknown as RulesetConditions }
        : {}),
      ...(raw.rules ? { rules: raw.rules as unknown as RulesetRule[] } : {}),
      ...(raw.bypass_actors
        ? { bypass_actors: raw.bypass_actors as unknown as BypassActor[] }
        : {}),
    };
    return ruleset;
  }
}
