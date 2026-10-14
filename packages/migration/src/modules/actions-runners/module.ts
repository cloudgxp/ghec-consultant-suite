import {
  MIGRATION_SCHEMA_VERSION,
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
import type {
  ActionsRunnersData,
  RawRunnerGroupResponse,
  RawRunnerGroupsListResponse,
  RunnerGroupDefinition,
  RunnerGroupVisibility,
} from './types.js';

function parseRunnerGroups(
  data: RawRunnerGroupsListResponse | unknown,
): RunnerGroupDefinition[] {
  if (!data || typeof data !== 'object') return [];
  const list = data as RawRunnerGroupsListResponse;
  const groups = Array.isArray(list.runner_groups) ? list.runner_groups : [];

  return groups.map((g: RawRunnerGroupResponse) => ({
    id: typeof g.id === 'number' ? g.id : undefined,
    name: g.name,
    visibility: g.visibility?.toLowerCase() === 'selected' ? 'selected' : 'all',
    default: g.default ?? false,
    allows_public_repositories: g.allows_public_repositories ?? false,
    restricted_to_workflows: g.restricted_to_workflows ?? false,
    selected_workflows: Array.isArray(g.selected_workflows)
      ? [...g.selected_workflows]
      : [],
  }));
}

function areWorkflowsEqual(
  a?: readonly string[] | undefined,
  b?: readonly string[] | undefined,
): boolean {
  const left = a ? [...a].sort() : [];
  const right = b ? [...b].sort() : [];
  if (left.length !== right.length) return false;
  return left.every((val, idx) => val === right[idx]);
}

export class ActionsRunnersMigrationModule implements MigrationModule<ActionsRunnersData> {
  readonly id = 'actions-runners';
  readonly displayName = 'Actions Self-Hosted Runner Groups';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['actions-policies'];

  async discover(ctx: MigrationContext): Promise<ActionsRunnersData> {
    const sourceOrg = ctx.scope.sourceOrg;
    let runner_groups: RunnerGroupDefinition[];

    try {
      const res =
        await ctx.sourceClient.readSingle<RawRunnerGroupsListResponse>(
          {
            id: 'rest.actions.listRunnerGroups',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/runner-groups',
            pathParams: { org: sourceOrg },
          },
          ctx.signal,
        );

      runner_groups = parseRunnerGroups(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover Actions runner groups for ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }

    return {
      organization: sourceOrg,
      runner_groups,
    };
  }

  async plan(
    ctx: MigrationContext,
    source: ActionsRunnersData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetGroups: RunnerGroupDefinition[] = [];
    try {
      const res =
        await ctx.targetClient.readSingle<RawRunnerGroupsListResponse>(
          {
            id: 'rest.actions.listRunnerGroups',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/runner-groups',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );
      targetGroups = parseRunnerGroups(res.data);
    } catch (err: unknown) {
      ctx.logger.warn(
        `Could not query target runner groups for ${targetOrg}, assuming none exist: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const targetGroupMap = new Map<string, RunnerGroupDefinition>();
    for (const tg of targetGroups) {
      targetGroupMap.set(tg.name.toLowerCase(), tg);
    }

    for (const group of source.runner_groups) {
      const groupKey = group.name.toLowerCase();
      const existing = targetGroupMap.get(groupKey);

      // EMU constraint: Public repositories are not permitted in GHEC-EMU organizations
      let targetAllowsPublic = group.allows_public_repositories;
      if (group.allows_public_repositories) {
        warnings.push(
          `Runner group "${group.name}" allows public repositories. In GHEC-EMU environments, public repositories are prohibited; setting allows_public_repositories to false.`,
        );
        targetAllowsPublic = false;
      }

      const desiredPayload = {
        ...(existing?.id ? { id: existing.id } : {}),
        name: group.name,
        visibility: group.visibility,
        allows_public_repositories: targetAllowsPublic,
        restricted_to_workflows: group.restricted_to_workflows ?? false,
        selected_workflows: group.selected_workflows ?? [],
      };

      if (existing) {
        const needsUpdate =
          existing.visibility !== group.visibility ||
          existing.allows_public_repositories !== targetAllowsPublic ||
          existing.restricted_to_workflows !==
            (group.restricted_to_workflows ?? false) ||
          !areWorkflowsEqual(
            existing.selected_workflows,
            group.selected_workflows,
          );

        if (needsUpdate) {
          operations.push({
            id: `op-update-runner-group-${groupKey}`,
            resourceType: 'actions_runner_group',
            resourceName: group.name,
            operation: 'update',
            sourceState: group as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            payload: desiredPayload,
            reason: `Reconciling runner group "${group.name}" settings on destination`,
          });
        } else {
          operations.push({
            id: `op-noop-runner-group-${groupKey}`,
            resourceType: 'actions_runner_group',
            resourceName: group.name,
            operation: 'noop',
            sourceState: group as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            reason: `Runner group "${group.name}" already matches expected configuration on target`,
          });
        }
      } else {
        operations.push({
          id: `op-create-runner-group-${groupKey}`,
          resourceType: 'actions_runner_group',
          resourceName: group.name,
          operation: 'create',
          sourceState: group as unknown as Record<string, unknown>,
          payload: desiredPayload,
          reason: `Creating runner group "${group.name}" on destination`,
        });
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: targetOrg,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startTime = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = ctx.scope.targetOrg;

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'noop') {
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (op.operation === 'skip') {
        results.push({
          operationId: op.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `[dry-run] Would execute ${op.operation} for runner group "${op.resourceName}"`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      if (!ctx.targetWriteClient) {
        throw new Error(
          `Cannot apply operation '${op.id}' without targetWriteClient`,
        );
      }

      const client = ctx.targetWriteClient;
      const payload = op.payload as
        | {
            id?: number | undefined;
            name: string;
            visibility: RunnerGroupVisibility;
            allows_public_repositories: boolean;
            restricted_to_workflows: boolean;
            selected_workflows: readonly string[];
          }
        | undefined;

      try {
        if (op.operation === 'create') {
          const body = {
            name: payload?.name ?? op.resourceName,
            visibility: payload?.visibility ?? 'all',
            allows_public_repositories:
              payload?.allows_public_repositories ?? false,
            restricted_to_workflows: payload?.restricted_to_workflows ?? false,
            selected_workflows: payload?.selected_workflows ?? [],
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'POST',
            path: '/orgs/{org}/actions/runner-groups',
            pathParams: { org: targetOrg },
            body,
          };
          const res = await client.mutate(writeOp, ctx.signal);
          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        } else if (op.operation === 'update') {
          const groupId = payload?.id;
          if (!groupId) {
            throw new Error(
              `Cannot update runner group "${op.resourceName}": missing runner group id in payload`,
            );
          }

          const body = {
            name: payload.name,
            visibility: payload.visibility,
            allows_public_repositories: payload.allows_public_repositories,
            restricted_to_workflows: payload.restricted_to_workflows,
            selected_workflows: payload.selected_workflows,
          };

          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}`,
            method: 'PATCH',
            path: '/orgs/{org}/actions/runner-groups/{runner_group_id}',
            pathParams: { org: targetOrg, runner_group_id: String(groupId) },
            body,
          };
          const res = await client.mutate(writeOp, ctx.signal);
          results.push({
            operationId: op.id,
            status: 'succeeded',
            httpStatus: res.status,
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.logger.error(
          `Failed to apply operation ${op.id} for runner group "${op.resourceName}": ${errorMsg}`,
        );
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: errorMsg,
        });

        if (!ctx.continueOnError) {
          break;
        }
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
    const targetOrg = ctx.scope.targetOrg;
    const discrepancies: VerificationDiscrepancy[] = [];

    let targetGroups: RunnerGroupDefinition[];
    try {
      const res =
        await ctx.targetClient.readSingle<RawRunnerGroupsListResponse>(
          {
            id: 'rest.actions.listRunnerGroups',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/runner-groups',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );
      targetGroups = parseRunnerGroups(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:runner_groups`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target runner groups on ${targetOrg}: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const targetMap = new Map<string, RunnerGroupDefinition>();
    for (const g of targetGroups) {
      targetMap.set(g.name.toLowerCase(), g);
    }

    for (const op of plan.operations) {
      if (
        op.operation === 'noop' ||
        op.operation === 'update' ||
        op.operation === 'create'
      ) {
        const payload =
          (op.payload as RunnerGroupDefinition | undefined) ??
          (op.sourceState as RunnerGroupDefinition | undefined);
        const groupName = op.resourceName;
        const act = targetMap.get(groupName.toLowerCase());

        if (!act) {
          discrepancies.push({
            resourceName: `${targetOrg} (runner_groups.${groupName})`,
            expected: groupName,
            actual: null,
            message: `Expected runner group "${groupName}" is missing on target organization ${targetOrg}.`,
          });
          continue;
        }

        if (payload?.visibility && act.visibility !== payload.visibility) {
          discrepancies.push({
            resourceName: `${targetOrg} (runner_groups.${groupName}.visibility)`,
            expected: payload.visibility,
            actual: act.visibility,
            message: `Runner group "${groupName}" visibility mismatch: expected "${payload.visibility}", got "${act.visibility}".`,
          });
        }

        if (
          payload?.allows_public_repositories !== undefined &&
          act.allows_public_repositories !== payload.allows_public_repositories
        ) {
          discrepancies.push({
            resourceName: `${targetOrg} (runner_groups.${groupName}.allows_public_repositories)`,
            expected: payload.allows_public_repositories,
            actual: act.allows_public_repositories,
            message: `Runner group "${groupName}" allows_public_repositories mismatch: expected ${payload.allows_public_repositories}, got ${act.allows_public_repositories}.`,
          });
        }

        if (
          payload?.restricted_to_workflows !== undefined &&
          act.restricted_to_workflows !== payload.restricted_to_workflows
        ) {
          discrepancies.push({
            resourceName: `${targetOrg} (runner_groups.${groupName}.restricted_to_workflows)`,
            expected: payload.restricted_to_workflows,
            actual: act.restricted_to_workflows,
            message: `Runner group "${groupName}" restricted_to_workflows mismatch: expected ${payload.restricted_to_workflows}, got ${act.restricted_to_workflows}.`,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
