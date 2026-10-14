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
  ActionsPermissionsState,
  ActionsPoliciesData,
  AllowedActions,
  EnabledRepositories,
  RawActionsPermissionsResponse,
  RawSelectedActionsResponse,
  SelectedActionsConfig,
} from './types.js';

function normalizeEnabledRepos(
  raw: string | null | undefined,
): EnabledRepositories {
  const val = raw?.toLowerCase();
  if (val === 'none') return 'none';
  if (val === 'selected') return 'selected';
  return 'all';
}

function normalizeAllowedActions(
  raw: string | null | undefined,
): AllowedActions {
  const val = raw?.toLowerCase();
  if (val === 'local_only') return 'local_only';
  if (val === 'selected') return 'selected';
  return 'all';
}

function arePatternsEqual(
  left?: readonly string[],
  right?: readonly string[],
): boolean {
  const l = left ? [...left].sort() : [];
  const r = right ? [...right].sort() : [];
  if (l.length !== r.length) return false;
  return l.every((val, idx) => val === r[idx]);
}

export class ActionsPoliciesMigrationModule implements MigrationModule<ActionsPoliciesData> {
  readonly id = 'actions-policies';
  readonly displayName = 'Actions Policies & Permissions';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['org-settings'];

  async discover(ctx: MigrationContext): Promise<ActionsPoliciesData> {
    const sourceOrg = ctx.scope.sourceOrg;
    let enabled_repositories: EnabledRepositories;
    let allowed_actions: AllowedActions;
    let selected_actions: SelectedActionsConfig | undefined = undefined;

    try {
      const res =
        await ctx.sourceClient.readSingle<RawActionsPermissionsResponse>(
          {
            id: 'rest.actions.getPermissions',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/permissions',
            pathParams: { org: sourceOrg },
          },
          ctx.signal,
        );

      enabled_repositories = normalizeEnabledRepos(
        res.data.enabled_repositories,
      );
      allowed_actions = normalizeAllowedActions(res.data.allowed_actions);

      if (allowed_actions === 'selected') {
        try {
          const selRes =
            await ctx.sourceClient.readSingle<RawSelectedActionsResponse>(
              {
                id: 'rest.actions.getSelectedActions',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/orgs/{org}/actions/permissions/selected-actions',
                pathParams: { org: sourceOrg },
              },
              ctx.signal,
            );
          selected_actions = {
            github_owned_allowed: selRes.data.github_owned_allowed ?? false,
            verified_allowed: selRes.data.verified_allowed ?? undefined,
            patterns_allowed: selRes.data.patterns_allowed ?? undefined,
          };
        } catch {
          // Fallback to empty selected config
          selected_actions = {
            github_owned_allowed: false,
          };
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover Actions policies for ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }

    return {
      organization: sourceOrg,
      permissions: {
        enabled_repositories,
        allowed_actions,
        ...(selected_actions ? { selected_actions } : {}),
      },
    };
  }

  async plan(
    ctx: MigrationContext,
    source: ActionsPoliciesData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetPermissions: ActionsPermissionsState = {
      enabled_repositories: 'all',
      allowed_actions: 'all',
    };

    try {
      const res =
        await ctx.targetClient.readSingle<RawActionsPermissionsResponse>(
          {
            id: 'rest.actions.getTargetPermissions',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/permissions',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );

      const tgtEnabled = normalizeEnabledRepos(res.data.enabled_repositories);
      const tgtAllowed = normalizeAllowedActions(res.data.allowed_actions);
      let tgtSelected: SelectedActionsConfig | undefined = undefined;

      if (tgtAllowed === 'selected') {
        try {
          const selRes =
            await ctx.targetClient.readSingle<RawSelectedActionsResponse>(
              {
                id: 'rest.actions.getTargetSelectedActions',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/orgs/{org}/actions/permissions/selected-actions',
                pathParams: { org: targetOrg },
              },
              ctx.signal,
            );
          tgtSelected = {
            github_owned_allowed: selRes.data.github_owned_allowed ?? false,
            verified_allowed: selRes.data.verified_allowed ?? undefined,
            patterns_allowed: selRes.data.patterns_allowed ?? undefined,
          };
        } catch {
          // Fresh target or feature defaults
        }
      }

      targetPermissions = {
        enabled_repositories: tgtEnabled,
        allowed_actions: tgtAllowed,
        ...(tgtSelected ? { selected_actions: tgtSelected } : {}),
      };
    } catch {
      // Fresh target or permissions unconfigured
    }

    const src = source.permissions;
    const isEnabledRepoDiff =
      src.enabled_repositories !== targetPermissions.enabled_repositories;
    const isAllowedActionsDiff =
      src.allowed_actions !== targetPermissions.allowed_actions;

    let isSelectedActionsDiff = false;
    if (src.allowed_actions === 'selected') {
      const srcSel = src.selected_actions;
      const tgtSel = targetPermissions.selected_actions;
      if (!tgtSel) {
        isSelectedActionsDiff = true;
      } else {
        isSelectedActionsDiff =
          srcSel?.github_owned_allowed !== tgtSel.github_owned_allowed ||
          srcSel?.verified_allowed !== tgtSel.verified_allowed ||
          !arePatternsEqual(srcSel?.patterns_allowed, tgtSel.patterns_allowed);
      }
    }

    if (isEnabledRepoDiff) {
      operations.push({
        id: `op-actions-enabled-repos-${targetOrg}`,
        resourceType: 'actions-policy',
        resourceName: `${targetOrg}:enabled-repositories`,
        operation: 'update',
        sourceState: {
          enabled_repositories: src.enabled_repositories,
        },
        destinationCurrentState: {
          enabled_repositories: targetPermissions.enabled_repositories,
        },
        payload: {
          enabled_repositories: src.enabled_repositories,
          allowed_actions: src.allowed_actions,
        },
        reason: `Setting Actions enabled repositories to '${src.enabled_repositories}'`,
      });
    }

    if (isAllowedActionsDiff || isSelectedActionsDiff) {
      operations.push({
        id: `op-actions-allowed-actions-${targetOrg}`,
        resourceType: 'actions-policy',
        resourceName: `${targetOrg}:allowed-actions`,
        operation: 'update',
        sourceState: {
          allowed_actions: src.allowed_actions,
          selected_actions: src.selected_actions,
        },
        destinationCurrentState: {
          allowed_actions: targetPermissions.allowed_actions,
          selected_actions: targetPermissions.selected_actions,
        },
        payload: {
          enabled_repositories: src.enabled_repositories,
          allowed_actions: src.allowed_actions,
          ...(src.selected_actions
            ? { selected_actions: src.selected_actions }
            : {}),
        },
        reason: `Setting allowed Actions policy to '${src.allowed_actions}'${
          src.allowed_actions === 'selected' ? ' with custom allowlist' : ''
        }`,
      });
    }

    if (operations.length === 0) {
      operations.push({
        id: `op-actions-policies-noop-${targetOrg}`,
        resourceType: 'actions-policy',
        resourceName: targetOrg,
        operation: 'noop',
        sourceState: src as unknown as Record<string, unknown>,
        destinationCurrentState: targetPermissions as unknown as Record<
          string,
          unknown
        >,
        reason: `Actions policies and permissions for '${targetOrg}' already match source configuration`,
      });
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

      try {
        const payload = (op.payload as Record<string, unknown>) ?? {};

        // 1. Update general actions permissions
        const generalBody: Record<string, unknown> = {};
        if (payload.enabled_repositories !== undefined) {
          generalBody.enabled_repositories = payload.enabled_repositories;
        }
        if (payload.allowed_actions !== undefined) {
          generalBody.allowed_actions = payload.allowed_actions;
        }

        if (Object.keys(generalBody).length > 0) {
          const writeOp: TargetWriteOperation = {
            id: `mutate-${op.id}-general`,
            method: 'PUT',
            path: '/orgs/{org}/actions/permissions',
            pathParams: { org: targetOrg },
            body: generalBody,
          };
          await ctx.targetWriteClient.mutate(writeOp, ctx.signal);
        }

        // 2. If selected actions specified, update selected actions
        if (payload.selected_actions) {
          const selConfig = payload.selected_actions as SelectedActionsConfig;
          const selBody: Record<string, unknown> = {
            github_owned_allowed: selConfig.github_owned_allowed,
            ...(selConfig.verified_allowed !== undefined
              ? { verified_allowed: selConfig.verified_allowed }
              : {}),
            ...(selConfig.patterns_allowed !== undefined
              ? { patterns_allowed: selConfig.patterns_allowed }
              : {}),
          };

          const selOp: TargetWriteOperation = {
            id: `mutate-${op.id}-selected`,
            method: 'PUT',
            path: '/orgs/{org}/actions/permissions/selected-actions',
            pathParams: { org: targetOrg },
            body: selBody,
          };
          await ctx.targetWriteClient.mutate(selOp, ctx.signal);
        }

        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
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

    let targetPermissions: ActionsPermissionsState;

    try {
      const res =
        await ctx.targetClient.readSingle<RawActionsPermissionsResponse>(
          {
            id: 'rest.actions.verifyPermissions',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/permissions',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );

      const tgtEnabled = normalizeEnabledRepos(res.data.enabled_repositories);
      const tgtAllowed = normalizeAllowedActions(res.data.allowed_actions);
      let tgtSelected: SelectedActionsConfig | undefined = undefined;

      if (tgtAllowed === 'selected') {
        try {
          const selRes =
            await ctx.targetClient.readSingle<RawSelectedActionsResponse>(
              {
                id: 'rest.actions.verifySelectedActions',
                transport: 'rest',
                verifiedReadOnly: true,
                path: '/orgs/{org}/actions/permissions/selected-actions',
                pathParams: { org: targetOrg },
              },
              ctx.signal,
            );
          tgtSelected = {
            github_owned_allowed: selRes.data.github_owned_allowed ?? false,
            verified_allowed: selRes.data.verified_allowed ?? undefined,
            patterns_allowed: selRes.data.patterns_allowed ?? undefined,
          };
        } catch {
          // Unconfigured
        }
      }

      targetPermissions = {
        enabled_repositories: tgtEnabled,
        allowed_actions: tgtAllowed,
        ...(tgtSelected ? { selected_actions: tgtSelected } : {}),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:actions-permissions`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target Actions permissions: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    for (const op of plan.operations) {
      if (op.operation === 'noop' || op.operation === 'update') {
        const payload = (op.payload as Record<string, unknown>) ?? {};
        const expectedEnabled =
          (payload.enabled_repositories as EnabledRepositories | undefined) ??
          (op.sourceState as { enabled_repositories?: EnabledRepositories })
            ?.enabled_repositories;
        const expectedAllowed =
          (payload.allowed_actions as AllowedActions | undefined) ??
          (op.sourceState as { allowed_actions?: AllowedActions })
            ?.allowed_actions;

        if (
          expectedEnabled !== undefined &&
          targetPermissions.enabled_repositories !== expectedEnabled
        ) {
          discrepancies.push({
            resourceName: `${targetOrg} (enabled_repositories)`,
            expected: expectedEnabled,
            actual: targetPermissions.enabled_repositories,
            message: `Actions enabled_repositories mismatch: expected "${expectedEnabled}", found "${targetPermissions.enabled_repositories}".`,
          });
        }

        if (
          expectedAllowed !== undefined &&
          targetPermissions.allowed_actions !== expectedAllowed
        ) {
          discrepancies.push({
            resourceName: `${targetOrg} (allowed_actions)`,
            expected: expectedAllowed,
            actual: targetPermissions.allowed_actions,
            message: `Actions allowed_actions mismatch: expected "${expectedAllowed}", found "${targetPermissions.allowed_actions}".`,
          });
        }

        if (expectedAllowed === 'selected') {
          const expectedSelected =
            (payload.selected_actions as SelectedActionsConfig | undefined) ??
            (op.sourceState as { selected_actions?: SelectedActionsConfig })
              ?.selected_actions;
          const actualSelected = targetPermissions.selected_actions;

          if (
            expectedSelected?.github_owned_allowed !== undefined &&
            actualSelected?.github_owned_allowed !==
              expectedSelected.github_owned_allowed
          ) {
            discrepancies.push({
              resourceName: `${targetOrg} (github_owned_allowed)`,
              expected: expectedSelected.github_owned_allowed,
              actual: actualSelected?.github_owned_allowed,
              message: `github_owned_allowed mismatch: expected ${expectedSelected.github_owned_allowed}, got ${actualSelected?.github_owned_allowed}`,
            });
          }

          if (
            expectedSelected?.patterns_allowed &&
            !arePatternsEqual(
              expectedSelected.patterns_allowed,
              actualSelected?.patterns_allowed,
            )
          ) {
            discrepancies.push({
              resourceName: `${targetOrg} (patterns_allowed)`,
              expected: expectedSelected.patterns_allowed,
              actual: actualSelected?.patterns_allowed,
              message: `patterns_allowed mismatch: expected ${JSON.stringify(
                expectedSelected.patterns_allowed,
              )}, got ${JSON.stringify(actualSelected?.patterns_allowed)}`,
            });
          }
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
