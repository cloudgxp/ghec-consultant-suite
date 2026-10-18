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
import {
  getScopedSourceRepoNames,
  getScopedTargetRepoName,
  isAssociatedOnlyOrgMode,
  isPublicOnlyTargetScope,
} from '../../core/org-item-filter.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import type {
  ActionsRunnersData,
  HostedRunnerDefinition,
  RawHostedRunnersListResponse,
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
  const groups = Array.isArray(list.runner_groups)
    ? list.runner_groups.filter((g) => !g.inherited)
    : [];

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

function parseHostedRunners(
  data: RawHostedRunnersListResponse | unknown,
  groupNameById?: ReadonlyMap<number, string>,
): HostedRunnerDefinition[] {
  if (!data || typeof data !== 'object') return [];
  const list = data as RawHostedRunnersListResponse;
  const rawRunners = Array.isArray(list.runners) ? list.runners : [];
  const parsed: HostedRunnerDefinition[] = [];

  for (const r of rawRunners) {
    if (!r || typeof r !== 'object' || typeof r.name !== 'string') continue;
    const size = r.size ?? r.machine_size_details?.id;
    const imgId = r.image?.id ?? r.image_details?.id;
    const imgSource = r.image?.source ?? r.image_details?.source ?? 'github';
    if (!size && !imgId) continue;

    parsed.push({
      id: typeof r.id === 'number' ? r.id : undefined,
      name: r.name,
      runner_group_id: r.runner_group_id,
      runner_group_name:
        typeof r.runner_group_id === 'number'
          ? groupNameById?.get(r.runner_group_id)
          : undefined,
      size: size ?? '4-core',
      image: {
        id: imgId ?? 'ubuntu-latest',
        source: imgSource,
      },
      maximum_runners: r.maximum_runners,
      enable_static_ip: r.enable_static_ip ?? r.public_ip_enabled,
      status: r.status,
      platform: r.platform,
    });
  }

  return parsed;
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

    const groupNameById = new Map<number, string>();
    for (const g of runner_groups) {
      if (typeof g.id === 'number') {
        groupNameById.set(g.id, g.name);
      }
    }

    let hosted_runners: HostedRunnerDefinition[] = [];
    try {
      const hrRes =
        await ctx.sourceClient.readSingle<RawHostedRunnersListResponse>(
          {
            id: 'rest.actions.listHostedRunners',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/hosted-runners',
            pathParams: { org: sourceOrg },
          },
          ctx.signal,
        );
      if (hrRes.status < 400) {
        hosted_runners = parseHostedRunners(hrRes.data, groupNameById);
      }
    } catch {
      // Larger GitHub-hosted runners may not be enabled or accessible
    }

    return {
      organization: sourceOrg,
      runner_groups,
      ...(hosted_runners.length > 0 ? { hosted_runners } : {}),
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

    const associatedOnly = isAssociatedOnlyOrgMode(ctx);
    const publicOnlyTarget = isPublicOnlyTargetScope(ctx);
    const scopedSourceNames = getScopedSourceRepoNames(ctx);

    for (const group of source.runner_groups) {
      if (associatedOnly) {
        if (group.default && ctx.scope.isMultiOrgConsolidation) {
          continue;
        }
        if (publicOnlyTarget && !group.allows_public_repositories) {
          continue;
        }
      }

      const groupKey = group.name.toLowerCase();
      const existing = targetGroupMap.get(groupKey);

      // EMU constraint: Public repositories are not permitted in GHEC-EMU organizations
      const isEmuTarget = ctx.scope.targetType !== 'ghec';
      let targetAllowsPublic = group.allows_public_repositories;
      if (isEmuTarget && group.allows_public_repositories) {
        warnings.push(
          `Runner group "${group.name}" allows public repositories. In GHEC-EMU environments, public repositories are prohibited; setting allows_public_repositories to false.`,
        );
        targetAllowsPublic = false;
      }

      const sourceOrgPrefix = ctx.scope.sourceOrg
        ? `${ctx.scope.sourceOrg}/`
        : '';
      let rawWorkflows = group.selected_workflows ?? [];
      if (
        associatedOnly &&
        group.restricted_to_workflows &&
        rawWorkflows.length > 0 &&
        scopedSourceNames.size > 0
      ) {
        rawWorkflows = rawWorkflows.filter((wf) => {
          const withoutOrg =
            sourceOrgPrefix && wf.startsWith(sourceOrgPrefix)
              ? wf.slice(sourceOrgPrefix.length)
              : wf;
          const repoName = withoutOrg.split('/')[0];
          return repoName
            ? scopedSourceNames.has(repoName.toLowerCase())
            : false;
        });
        if (rawWorkflows.length === 0) {
          continue;
        }
      }

      let mappedWorkflows = rawWorkflows.map((wf) => {
        if (sourceOrgPrefix && wf.startsWith(sourceOrgPrefix)) {
          const rest = wf.slice(sourceOrgPrefix.length);
          const slashIdx = rest.indexOf('/');
          if (slashIdx > 0) {
            const srcRepo = rest.slice(0, slashIdx);
            const targetRepo = getScopedTargetRepoName(ctx, srcRepo);
            return `${targetOrg}/${targetRepo}${rest.slice(slashIdx)}`;
          }
          return `${targetOrg}/${rest}`;
        }
        return wf;
      });

      if (
        existing &&
        (associatedOnly || ctx.scope.isMultiOrgConsolidation) &&
        (existing.selected_workflows?.length ?? 0) > 0
      ) {
        mappedWorkflows = [
          ...new Set([
            ...(existing.selected_workflows ?? []),
            ...mappedWorkflows,
          ]),
        ];
      }

      const desiredPayload = {
        ...(existing?.id ? { id: existing.id } : {}),
        name: group.name,
        visibility: group.visibility,
        allows_public_repositories: targetAllowsPublic,
        restricted_to_workflows: group.restricted_to_workflows ?? false,
        selected_workflows: mappedWorkflows,
      };

      if (existing) {
        const needsUpdate =
          existing.visibility !== group.visibility ||
          existing.allows_public_repositories !== targetAllowsPublic ||
          existing.restricted_to_workflows !==
            (group.restricted_to_workflows ?? false) ||
          !areWorkflowsEqual(existing.selected_workflows, mappedWorkflows);

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
            payload: desiredPayload,
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

    // Plan organization-level Larger GitHub-Hosted Runners
    if (source.hosted_runners && source.hosted_runners.length > 0) {
      warnings.push(
        `Larger GitHub-hosted runners detected (${source.hosted_runners.length}). Ensure GitHub Actions spending limits are configured above $0 on ${targetOrg} so provisioned larger runners can execute jobs.`,
      );

      let targetHostedRunners: HostedRunnerDefinition[] = [];
      try {
        const hrRes =
          await ctx.targetClient.readSingle<RawHostedRunnersListResponse>(
            {
              id: 'rest.actions.listTargetHostedRunners',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/orgs/{org}/actions/hosted-runners',
              pathParams: { org: targetOrg },
            },
            ctx.signal,
          );
        if (hrRes.status < 400) {
          targetHostedRunners = parseHostedRunners(hrRes.data);
        }
      } catch {
        // Target may not have larger runners yet
      }

      const targetHostedByName = new Map(
        targetHostedRunners.map((r) => [r.name.toLowerCase(), r]),
      );

      for (const hr of source.hosted_runners) {
        const hrKey = hr.name.toLowerCase();
        const existingHr = targetHostedByName.get(hrKey);
        const targetGroupId =
          (hr.runner_group_name
            ? targetGroupMap.get(hr.runner_group_name.toLowerCase())?.id
            : undefined) ??
          targetGroupMap.get('default')?.id ??
          hr.runner_group_id ??
          1;

        const hrPayload = {
          name: hr.name,
          size: hr.size,
          image: hr.image,
          runner_group_id: targetGroupId,
          runner_group_name: hr.runner_group_name,
          ...(hr.maximum_runners !== undefined
            ? { maximum_runners: hr.maximum_runners }
            : {}),
          ...(hr.enable_static_ip !== undefined
            ? { enable_static_ip: hr.enable_static_ip }
            : {}),
        };

        if (existingHr) {
          operations.push({
            id: `op-noop-hosted-runner-${hrKey}`,
            resourceType: 'hosted-runner',
            resourceName: hr.name,
            operation: 'noop',
            sourceState: hr as unknown as Record<string, unknown>,
            destinationCurrentState: existingHr as unknown as Record<
              string,
              unknown
            >,
            payload: hrPayload,
            reason: `Larger GitHub-hosted runner "${hr.name}" (size: ${hr.size}) already exists on ${targetOrg} — verify Actions billing spending limits are set`,
          });
        } else {
          operations.push({
            id: `op-create-hosted-runner-${hrKey}`,
            resourceType: 'hosted-runner',
            resourceName: hr.name,
            operation: 'create',
            sourceState: hr as unknown as Record<string, unknown>,
            payload: hrPayload,
            reason: `Creating larger GitHub-hosted runner "${hr.name}" (size: ${hr.size}, image: ${hr.image.id}) on ${targetOrg} — verify Actions billing spending limits are set`,
          });
        }
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
    const createdGroupIdByName = new Map<string, number>();

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
          `[dry-run] Would execute ${op.operation} for ${op.resourceType} "${op.resourceName}"`,
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

      if (op.resourceType === 'hosted-runner') {
        const hrPayload = op.payload as
          | {
              name: string;
              size: string;
              image: { id: string; source: string };
              runner_group_id?: number | undefined;
              runner_group_name?: string | undefined;
              maximum_runners?: number | undefined;
              enable_static_ip?: boolean | undefined;
            }
          | undefined;
        const resolvedGroupId =
          (hrPayload?.runner_group_name
            ? createdGroupIdByName.get(
                hrPayload.runner_group_name.toLowerCase(),
              )
            : undefined) ??
          hrPayload?.runner_group_id ??
          1;
        const body: Record<string, unknown> = {
          name: hrPayload?.name ?? op.resourceName,
          size: hrPayload?.size ?? '4-core',
          image: hrPayload?.image ?? { id: 'ubuntu-latest', source: 'github' },
          runner_group_id: resolvedGroupId,
          ...(hrPayload?.maximum_runners !== undefined
            ? { maximum_runners: hrPayload.maximum_runners }
            : {}),
          ...(hrPayload?.enable_static_ip !== undefined
            ? { enable_static_ip: hrPayload.enable_static_ip }
            : {}),
        };

        const writeOp: TargetWriteOperation = {
          id: `mutate-${op.id}`,
          method: 'POST',
          path: '/orgs/{org}/actions/hosted-runners',
          pathParams: { org: targetOrg },
          body,
        };

        try {
          const res = await client.mutate(writeOp, ctx.signal);
          if (res.status >= 200 && res.status < 300) {
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } else {
            ctx.logger.warn(
              `[actions-runners] Larger GitHub-hosted runner "${op.resourceName}" returned HTTP ${res.status} on ${targetOrg} (check Actions billing spending limits or custom image availability); deferring to post-care.`,
            );
            results.push({
              operationId: op.id,
              status: 'skipped',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          }
        } catch (hrErr: unknown) {
          const hrMsg = hrErr instanceof Error ? hrErr.message : String(hrErr);
          ctx.logger.warn(
            `[actions-runners] Could not auto-provision larger GitHub-hosted runner "${op.resourceName}" on ${targetOrg} (${hrMsg}); verify Actions billing spending limits in post-care.`,
          );
          results.push({
            operationId: op.id,
            status: 'skipped',
            completedAt: new Date().toISOString(),
            error: hrMsg,
          });
        }
        continue;
      }

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
          let res: { status: number; data?: unknown };
          try {
            res = await client.mutate(writeOp, ctx.signal);
          } catch (wfErr: unknown) {
            const wfMsg =
              wfErr instanceof Error ? wfErr.message : String(wfErr);
            if (
              wfMsg.includes('does not resolve to a file') &&
              body.selected_workflows.length > 0
            ) {
              ctx.logger.warn(
                `[actions-runners] Workflow reference in runner group "${op.resourceName}" could not resolve on ${targetOrg}; creating runner group without workflow restriction.`,
              );
              res = await client.mutate(
                {
                  ...writeOp,
                  body: {
                    ...body,
                    restricted_to_workflows: false,
                    selected_workflows: [],
                  },
                },
                ctx.signal,
              );
            } else {
              throw wfErr;
            }
          }
          if (
            res.data &&
            typeof res.data === 'object' &&
            'id' in res.data &&
            typeof (res.data as { id: unknown }).id === 'number'
          ) {
            createdGroupIdByName.set(
              body.name.toLowerCase(),
              (res.data as { id: number }).id,
            );
          }
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
          let res: { status: number; data?: unknown };
          try {
            res = await client.mutate(writeOp, ctx.signal);
          } catch (wfErr: unknown) {
            const wfMsg =
              wfErr instanceof Error ? wfErr.message : String(wfErr);
            if (
              wfMsg.includes('does not resolve to a file') &&
              body.selected_workflows.length > 0
            ) {
              ctx.logger.warn(
                `[actions-runners] Workflow reference in runner group "${op.resourceName}" could not resolve on ${targetOrg}; updating runner group without workflow restriction.`,
              );
              res = await client.mutate(
                {
                  ...writeOp,
                  body: {
                    ...body,
                    restricted_to_workflows: false,
                    selected_workflows: [],
                  },
                },
                ctx.signal,
              );
            } else {
              throw wfErr;
            }
          }
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
      if (op.resourceType === 'hosted-runner') {
        continue;
      }

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

        const isDefaultGroupAllVisibility =
          (op.sourceState as RunnerGroupDefinition | undefined)?.default ===
            true && act.visibility === 'all';
        if (
          payload?.visibility &&
          act.visibility !== payload.visibility &&
          !isDefaultGroupAllVisibility
        ) {
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
