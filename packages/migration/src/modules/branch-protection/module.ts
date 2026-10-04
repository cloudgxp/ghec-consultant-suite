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
import { computeBranchProtectionReconciliation } from './reconciler.js';
import type { BranchProtectionData, BranchProtectionRule } from './types.js';

interface BranchSummaryItem {
  readonly name: string;
  readonly protected?: boolean;
}

export class BranchProtectionReconciliationModule implements MigrationModule<BranchProtectionData> {
  readonly id = 'branch-protection';
  readonly displayName = 'Branch Protection Reconciliation (DEC-009)';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  async discover(
    ctx: MigrationContext,
    cachedData?: DiscoveryBundle | unknown,
  ): Promise<BranchProtectionData> {
    const repo = ctx.scope.sourceRepo;
    if (!repo) {
      throw new Error(
        'Repository scope is required for branch protection discovery.',
      );
    }

    // 1. Cached discovery bundle mode
    if (
      cachedData &&
      typeof cachedData === 'object' &&
      'entities' in cachedData
    ) {
      const bundle = cachedData as DiscoveryBundle;
      const protections: BranchProtectionRule[] = [];

      for (const entity of bundle.entities) {
        if (
          entity.kind === 'policy' &&
          entity.policyKind === 'branch_protection'
        ) {
          const raw = ((entity as Record<string, unknown>)['rawPayload'] ??
            entity) as Record<string, unknown>;
          if (raw && typeof raw === 'object' && 'branch' in raw) {
            protections.push(raw as unknown as BranchProtectionRule);
          }
        }
      }

      if (protections.length > 0) {
        return { protections };
      }
    }

    // 2. Live REST discovery mode
    const protections: BranchProtectionRule[] = [];
    try {
      // Query protected branches for repo
      const branchesRes = await ctx.sourceClient.readSingle<
        BranchSummaryItem[]
      >(
        {
          id: 'rest.repos.list-protected-branches',
          transport: 'rest',
          verifiedReadOnly: true,
          path: `/repos/${ctx.scope.sourceOrg}/${repo}/branches`,
          pathParams: { owner: ctx.scope.sourceOrg, repo },
        },
        ctx.signal,
      );

      const branchItems = Array.isArray(branchesRes.data)
        ? branchesRes.data.filter((b) => b.protected)
        : [];

      // Query branch protection for each protected branch
      for (const b of branchItems) {
        if (ctx.signal.aborted) throw ctx.signal.reason;
        try {
          const protRes = await ctx.sourceClient.readSingle<
            Record<string, unknown>
          >(
            {
              id: `rest.repos.get-branch-protection-${b.name}`,
              transport: 'rest',
              verifiedReadOnly: true,
              path: `/repos/${ctx.scope.sourceOrg}/${repo}/branches/${b.name}/protection`,
              pathParams: { owner: ctx.scope.sourceOrg, repo, branch: b.name },
            },
            ctx.signal,
          );
          if (protRes.data) {
            protections.push({
              branch: b.name,
              ...(protRes.data as unknown as Omit<
                BranchProtectionRule,
                'branch'
              >),
            });
          }
        } catch {
          // branch might not have full protection configuration
        }
      }
    } catch (err) {
      ctx.logger.warn(
        `Failed to discover branch protections: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { protections };
  }

  async plan(
    ctx: MigrationContext,
    sourceData: BranchProtectionData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetIdentifier = `${ctx.scope.targetOrg}/${targetRepo}`;

    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    for (const srcProt of sourceData.protections) {
      let targetProt: BranchProtectionRule | undefined;

      try {
        const res = await ctx.targetClient.readSingle<Record<string, unknown>>(
          {
            id: `rest.repos.get-target-branch-protection-${srcProt.branch}`,
            transport: 'rest',
            verifiedReadOnly: true,
            path: `/repos/${ctx.scope.targetOrg}/${targetRepo}/branches/${srcProt.branch}/protection`,
            pathParams: {
              owner: ctx.scope.targetOrg,
              repo: targetRepo,
              branch: srcProt.branch,
            },
          },
          ctx.signal,
        );
        if (res.data) {
          targetProt = {
            branch: srcProt.branch,
            ...(res.data as unknown as Omit<BranchProtectionRule, 'branch'>),
          };
        }
      } catch {
        targetProt = undefined;
      }

      const diff = computeBranchProtectionReconciliation(srcProt, targetProt);

      if (diff.needsReconciliation) {
        const omittedList: string[] = [];
        if (diff.omittedSettings.bypassPullRequestAllowances)
          omittedList.push('bypass_pull_request_allowances');
        if (diff.omittedSettings.requireLastPushApproval)
          omittedList.push('require_last_push_approval');
        if (diff.omittedSettings.requiredDeployments)
          omittedList.push('required_deployments');
        if (diff.omittedSettings.lockBranch) omittedList.push('lock_branch');
        if (diff.omittedSettings.blockCreations)
          omittedList.push('block_creations');
        if (diff.omittedSettings.allowForcePushesCustom)
          omittedList.push('allow_force_pushes');
        if (diff.omittedSettings.dismissalRestrictions)
          omittedList.push('dismissal_restrictions');

        const reason =
          omittedList.length > 0
            ? `Reconciling GEI-omitted settings: ${omittedList.join(', ')}`
            : 'Reconciling branch protection differences on target.';

        operations.push({
          id: `branch-protection-reconcile-${srcProt.branch}`,
          operation: 'update',
          resourceType: 'branch-protection',
          resourceName: srcProt.branch,
          sourceState: srcProt,
          destinationCurrentState: targetProt,
          payload: {
            branch: srcProt.branch,
            ...diff.reconciledPayload,
          },
          reason,
        });
      } else {
        operations.push({
          id: `branch-protection-noop-${srcProt.branch}`,
          operation: 'noop',
          resourceType: 'branch-protection',
          resourceName: srcProt.branch,
          sourceState: srcProt,
          destinationCurrentState: targetProt,
          reason:
            'Branch protection is already reconciled and identical on target.',
        });
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
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
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const results: OperationExecutionResult[] = [];

    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be configured to apply branch protection reconciliation.',
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
          `[DryRun] Would reconcile branch protection for branch "${op.resourceName}"`,
        );
        results.push({
          operationId: op.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      try {
        const payload = op.payload as Record<string, unknown>;
        const branch = (payload.branch as string) ?? op.resourceName;
        const { branch: _, ...bodyPayload } = payload;
        void _;

        const writeOp: TargetWriteOperation = {
          id: op.id,
          method: 'PUT',
          path: `/repos/${ctx.scope.targetOrg}/${targetRepo}/branches/${branch}/protection`,
          body: bodyPayload,
        };

        const res = await ctx.targetWriteClient!.mutate(writeOp, ctx.signal);
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: res.status,
          completedAt: new Date().toISOString(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          operationId: op.id,
          status: 'failed',
          error: msg.slice(0, 2048),
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

    for (const op of plan.operations) {
      if (op.operation === 'skip') continue;

      const sourceState = op.sourceState as BranchProtectionRule | undefined;
      if (!sourceState) continue;

      let targetProt: BranchProtectionRule | undefined;
      try {
        const res = await ctx.targetClient.readSingle<Record<string, unknown>>(
          {
            id: `rest.repos.verify-branch-protection-${sourceState.branch}`,
            transport: 'rest',
            verifiedReadOnly: true,
            path: `/repos/${ctx.scope.targetOrg}/${targetRepo}/branches/${sourceState.branch}/protection`,
            pathParams: {
              owner: ctx.scope.targetOrg,
              repo: targetRepo,
              branch: sourceState.branch,
            },
          },
          ctx.signal,
        );
        if (res.data) {
          targetProt = {
            branch: sourceState.branch,
            ...(res.data as unknown as Omit<BranchProtectionRule, 'branch'>),
          };
        }
      } catch {
        targetProt = undefined;
      }

      if (!targetProt) {
        discrepancies.push({
          resourceName: sourceState.branch,
          expected: 'Protected branch configured',
          actual: 'No branch protection on destination',
          message: `Branch "${sourceState.branch}" has no branch protection configured on destination repository.`,
        });
        continue;
      }

      const diff = computeBranchProtectionReconciliation(
        sourceState,
        targetProt,
      );
      if (diff.needsReconciliation) {
        discrepancies.push({
          resourceName: sourceState.branch,
          expected: sourceState,
          actual: targetProt,
          message: `Branch "${sourceState.branch}" protection is missing reconciled settings on destination.`,
        });
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
