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
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { MigrationModule } from '../../core/module.js';
import {
  formatSanitizedReadError,
  isExpectedFeatureAbsentError,
} from '../../core/read-error-classifier.js';
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
  readonly id: string = 'rulesets';
  readonly displayName: string = 'Repository & Organization Rulesets';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  async discover(
    ctx: MigrationContext,
    cachedData?: DiscoveryBundle | unknown,
  ): Promise<RulesetsData> {
    const isRepo = ctx.scope.level === 'repository';
    const repo = ctx.scope.sourceRepo;

    // 1. Cached discovery bundle mode (only if full ruleset definitions are present for the matching scope)
    if (
      cachedData &&
      typeof cachedData === 'object' &&
      'entities' in cachedData
    ) {
      const bundle = cachedData as DiscoveryBundle;
      const rulesets: GitHubRuleset[] = [];

      for (const entity of bundle.entities) {
        if (entity.kind === 'policy' && entity.policyKind === 'ruleset') {
          const entityRepoId = entity.repositoryId;
          const matchesScope = isRepo
            ? Boolean(
                repo &&
                typeof entityRepoId === 'string' &&
                (entityRepoId === repo || entityRepoId.endsWith(`:${repo}`)),
              )
            : !entityRepoId;

          if (!matchesScope) {
            continue;
          }

          const raw = (entity as Record<string, unknown>)['rawPayload'] as
            Record<string, unknown> | undefined;
          if (
            raw &&
            typeof raw === 'object' &&
            'name' in raw &&
            'target' in raw &&
            ('rules' in raw || 'conditions' in raw)
          ) {
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

    // 2. Live API mode (with detail hydration for each ruleset)
    try {
      const rulesets = await this.fetchRulesetsWithDetails(
        ctx.sourceClient,
        ctx,
        ctx.scope.sourceOrg,
        repo,
        'list',
      );
      return { rulesets };
    } catch (err: unknown) {
      if (isExpectedFeatureAbsentError(err)) {
        ctx.logger.warn(
          `Rulesets not available for ${ctx.scope.level}: ${formatSanitizedReadError(err)}`,
        );
        return { rulesets: [] };
      }
      const msg = formatSanitizedReadError(
        `Failed to list rulesets for ${ctx.scope.level}`,
        err,
      );
      ctx.logger.error(msg);
      throw new Error(msg, { cause: err });
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

    // Query destination rulesets (with detail hydration)
    let targetRulesets: GitHubRuleset[] = [];
    try {
      targetRulesets = await this.fetchRulesetsWithDetails(
        ctx.targetClient,
        ctx,
        ctx.scope.targetOrg,
        targetRepo,
        'list-target',
      );
    } catch (err: unknown) {
      if (isExpectedFeatureAbsentError(err)) {
        ctx.logger.warn(
          `Could not query target rulesets: ${formatSanitizedReadError(err)}`,
        );
      } else {
        const msg = formatSanitizedReadError(
          `Failed to query target rulesets for ${targetIdentifier}`,
          err,
        );
        ctx.logger.error(msg);
        throw new Error(msg, { cause: err });
      }
    }

    const targetMapByName = new Map<string, GitHubRuleset>();
    for (const tr of targetRulesets) {
      targetMapByName.set(tr.name, tr);
    }

    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];
    const opPrefix = isRepo && targetRepo ? `${targetRepo}-` : '';

    let sourceIdToName = new Map<number, string>();
    let targetNameToId = new Map<string, number>();
    if (
      !isRepo &&
      sourceData.rulesets.some(
        (r) => (r.conditions?.repository_id?.repository_ids?.length ?? 0) > 0,
      )
    ) {
      const repoMaps = await this.resolveOrganizationRepositoryMaps(ctx);
      sourceIdToName = repoMaps.sourceIdToName;
      targetNameToId = repoMaps.targetNameToId;
    }

    for (const rawSourceRuleset of sourceData.rulesets) {
      // Inherited org rulesets cannot be migrated at repo level
      if (isRepo && isInheritedOrganizationRuleset(rawSourceRuleset)) {
        warnings.push(
          `Ruleset "${rawSourceRuleset.name}" is inherited from Organization and cannot be migrated at repository level.`,
        );
        continue;
      }

      let sourceRuleset = rawSourceRuleset;
      const srcRepoIds =
        rawSourceRuleset.conditions?.repository_id?.repository_ids;
      if (
        !isRepo &&
        srcRepoIds &&
        srcRepoIds.length > 0 &&
        sourceIdToName.size > 0
      ) {
        const mappedIds: number[] = [];
        const missingRepoNames: string[] = [];
        for (const srcId of srcRepoIds) {
          const repoName = sourceIdToName.get(Number(srcId));
          if (repoName) {
            const targetId = targetNameToId.get(repoName.toLowerCase());
            if (targetId !== undefined) {
              mappedIds.push(targetId);
            } else {
              missingRepoNames.push(repoName);
            }
          }
        }

        if (mappedIds.length === 0 && missingRepoNames.length > 0) {
          warnings.push(
            `Ruleset "${rawSourceRuleset.name}" targets repository(${missingRepoNames.join(', ')}) which is not yet present on ${ctx.scope.targetOrg}; deferring ruleset creation until post-cohort reconciliation.`,
          );
          operations.push({
            id: `ruleset-skip-${opPrefix}${rawSourceRuleset.name}`,
            operation: 'skip',
            resourceType: 'ruleset',
            resourceName: rawSourceRuleset.name,
            sourceState: rawSourceRuleset,
            reason:
              'Selected target repositories do not exist on destination yet; deferred to post-cohort reconciliation.',
          });
          continue;
        }

        if (mappedIds.length > 0) {
          sourceRuleset = {
            ...rawSourceRuleset,
            conditions: {
              ...rawSourceRuleset.conditions,
              repository_id: {
                ...rawSourceRuleset.conditions?.repository_id,
                repository_ids: mappedIds,
              },
            },
          };
        }
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

  private async resolveOrganizationRepositoryMaps(
    ctx: MigrationContext,
  ): Promise<{
    sourceIdToName: Map<number, string>;
    targetNameToId: Map<string, number>;
  }> {
    const sourceIdToName = new Map<number, string>();
    const targetNameToId = new Map<string, number>();
    try {
      const [srcRes, tgtRes] = await Promise.all([
        ctx.sourceClient.fetchAll<{ id?: number; name?: string }>(
          {
            id: 'rest.repos.listForOrg',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/repos',
            pathParams: { org: ctx.scope.sourceOrg },
            queryParams: { per_page: 100 },
          },
          ctx.signal,
        ),
        ctx.targetClient.fetchAll<{ id?: number; name?: string }>(
          {
            id: 'rest.repos.listForOrg',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/repos',
            pathParams: { org: ctx.scope.targetOrg },
            queryParams: { per_page: 100 },
          },
          ctx.signal,
        ),
      ]);
      for (const item of srcRes?.items ?? []) {
        if (typeof item.id === 'number' && typeof item.name === 'string') {
          sourceIdToName.set(item.id, item.name);
        }
      }
      for (const item of tgtRes?.items ?? []) {
        if (typeof item.id === 'number' && typeof item.name === 'string') {
          targetNameToId.set(item.name.toLowerCase(), item.id);
        }
      }
    } catch {
      // Ignore if repository listing fails; fallback to unmapped IDs
    }
    return { sourceIdToName, targetNameToId };
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
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const discrepancies: VerificationDiscrepancy[] = [];

    const targetMapByName = new Map<string, GitHubRuleset>();
    try {
      const targetRulesets = await this.fetchRulesetsWithDetails(
        ctx.targetClient,
        ctx,
        ctx.scope.targetOrg,
        targetRepo,
        'verify',
      );
      for (const r of targetRulesets) {
        targetMapByName.set(r.name, r);
      }
    } catch (err: unknown) {
      discrepancies.push({
        resourceName: 'rulesets-query',
        expected: 'HTTP 200 list of rulesets',
        actual: formatSanitizedReadError(err),
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

  private async fetchRulesetsWithDetails(
    client: GitHubReadAdapter,
    ctx: MigrationContext,
    org: string,
    repo: string | undefined,
    opIdPrefix: string,
  ): Promise<GitHubRuleset[]> {
    const isRepo = ctx.scope.level === 'repository';
    const listPath = isRepo
      ? `/repos/${org}/${repo}/rulesets`
      : `/orgs/${org}/rulesets`;

    const res = await client.readSingle<RawRulesetItem[]>(
      {
        id: `rest.rulesets.${opIdPrefix}-${ctx.scope.level}`,
        transport: 'rest',
        verifiedReadOnly: true,
        path: listPath,
        pathParams: isRepo ? { owner: org, repo: repo! } : { org },
      },
      ctx.signal,
    );

    if (res.status >= 400) {
      const error = new Error(
        `HTTP ${res.status} querying rulesets at ${listPath}`,
      );
      (error as unknown as { status: number }).status = res.status;
      throw error;
    }

    const items = Array.isArray(res.data) ? res.data : [];
    const hydrated: GitHubRuleset[] = [];

    for (const item of items) {
      // Do not hydrate inherited organization rulesets when operating at repository scope
      if (isRepo && item.source_type === 'Organization') {
        hydrated.push(this.normalizeRuleset(item));
        continue;
      }

      if (
        item.id !== undefined &&
        (item.rules === undefined || item.conditions === undefined)
      ) {
        const detailPath = isRepo
          ? `/repos/${org}/${repo}/rulesets/${item.id}`
          : `/orgs/${org}/rulesets/${item.id}`;
        try {
          const detailRes = await client.readSingle<RawRulesetItem>(
            {
              id: `rest.rulesets.get-${ctx.scope.level}`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: detailPath,
              pathParams: isRepo
                ? { owner: org, repo: repo!, ruleset_id: String(item.id) }
                : { org, ruleset_id: String(item.id) },
            },
            ctx.signal,
          );
          if (
            detailRes.status < 400 &&
            detailRes.data &&
            typeof detailRes.data === 'object' &&
            !Array.isArray(detailRes.data) &&
            'name' in detailRes.data
          ) {
            hydrated.push(
              this.normalizeRuleset({
                ...item,
                ...detailRes.data,
              }),
            );
            continue;
          }
        } catch (err: unknown) {
          if (!isExpectedFeatureAbsentError(err)) {
            throw err;
          }
        }
      }

      hydrated.push(this.normalizeRuleset(item));
    }

    return hydrated;
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

export class OrgRulesetsMigrationModule extends RulesetsMigrationModule {
  override readonly id: string = 'org-rulesets';
  override readonly displayName: string = 'Organization-Level Rulesets';
  override readonly scopeLevel: MigrationScopeLevel = 'organization';
  override readonly dependencies: readonly string[] = ['teams', 'custom-roles'];
}
