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
  DefaultRepositoryPermission,
  OrgSettingsData,
  OrgSettingsState,
  RawOrgSettingsResponse,
} from './types.js';

function normalizeDefaultRepoPermission(
  raw: string | null | undefined,
): DefaultRepositoryPermission | undefined {
  if (!raw) return undefined;
  const val = raw.toLowerCase();
  if (val === 'read' || val === 'write' || val === 'admin' || val === 'none') {
    return val;
  }
  return undefined;
}

function parseOrgSettings(
  raw: RawOrgSettingsResponse | undefined,
): OrgSettingsState {
  if (!raw) return {};
  return {
    ...(raw.name ? { name: raw.name } : {}),
    ...(raw.description ? { description: raw.description } : {}),
    ...(raw.company ? { company: raw.company } : {}),
    ...(raw.blog ? { blog: raw.blog } : {}),
    ...(raw.location ? { location: raw.location } : {}),
    ...(raw.email ? { email: raw.email } : {}),
    ...(raw.has_organization_projects !== null &&
    raw.has_organization_projects !== undefined
      ? { has_organization_projects: raw.has_organization_projects }
      : {}),
    ...(raw.has_repository_projects !== null &&
    raw.has_repository_projects !== undefined
      ? { has_repository_projects: raw.has_repository_projects }
      : {}),
    ...(raw.default_repository_permission
      ? {
          default_repository_permission: normalizeDefaultRepoPermission(
            raw.default_repository_permission,
          ),
        }
      : {}),
    ...(raw.members_can_create_repositories !== null &&
    raw.members_can_create_repositories !== undefined
      ? {
          members_can_create_repositories: raw.members_can_create_repositories,
        }
      : {}),
    ...(raw.members_can_create_public_repositories !== null &&
    raw.members_can_create_public_repositories !== undefined
      ? {
          members_can_create_public_repositories:
            raw.members_can_create_public_repositories,
        }
      : {}),
    ...(raw.members_can_create_private_repositories !== null &&
    raw.members_can_create_private_repositories !== undefined
      ? {
          members_can_create_private_repositories:
            raw.members_can_create_private_repositories,
        }
      : {}),
    ...(raw.members_can_create_internal_repositories !== null &&
    raw.members_can_create_internal_repositories !== undefined
      ? {
          members_can_create_internal_repositories:
            raw.members_can_create_internal_repositories,
        }
      : {}),
    ...(raw.members_can_create_pages !== null &&
    raw.members_can_create_pages !== undefined
      ? { members_can_create_pages: raw.members_can_create_pages }
      : {}),
    ...(raw.members_can_create_public_pages !== null &&
    raw.members_can_create_public_pages !== undefined
      ? {
          members_can_create_public_pages: raw.members_can_create_public_pages,
        }
      : {}),
    ...(raw.members_can_create_private_pages !== null &&
    raw.members_can_create_private_pages !== undefined
      ? {
          members_can_create_private_pages:
            raw.members_can_create_private_pages,
        }
      : {}),
    ...(raw.members_can_fork_private_repositories !== null &&
    raw.members_can_fork_private_repositories !== undefined
      ? {
          members_can_fork_private_repositories:
            raw.members_can_fork_private_repositories,
        }
      : {}),
    ...(raw.web_commit_signoff_required !== null &&
    raw.web_commit_signoff_required !== undefined
      ? {
          web_commit_signoff_required: raw.web_commit_signoff_required,
        }
      : {}),
  };
}

export class OrgSettingsMigrationModule implements MigrationModule<OrgSettingsData> {
  readonly id = 'org-settings';
  readonly displayName = 'Organization Settings & Member Privileges';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = [];

  async discover(ctx: MigrationContext): Promise<OrgSettingsData> {
    const sourceOrg = ctx.scope.sourceOrg;
    let settings: OrgSettingsState;

    try {
      const res = await ctx.sourceClient.readSingle<RawOrgSettingsResponse>(
        {
          id: 'rest.orgs.getOrgSettings',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}',
          pathParams: { org: sourceOrg },
        },
        ctx.signal,
      );
      settings = parseOrgSettings(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover organization settings for ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }

    return {
      organization: sourceOrg,
      settings,
    };
  }

  async plan(
    ctx: MigrationContext,
    source: OrgSettingsData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetSettings: OrgSettingsState = {};
    try {
      const res = await ctx.targetClient.readSingle<RawOrgSettingsResponse>(
        {
          id: 'rest.orgs.getTargetOrgSettings',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}',
          pathParams: { org: targetOrg },
        },
        ctx.signal,
      );
      targetSettings = parseOrgSettings(res.data);
    } catch {
      // Fresh target or partial access
    }

    const diffPayload: Record<string, unknown> = {};
    const src = source.settings;

    const mutableKeys: ReadonlyArray<keyof OrgSettingsState> = [
      'name',
      'description',
      'company',
      'blog',
      'location',
      'email',
      'has_organization_projects',
      'has_repository_projects',
      'default_repository_permission',
      'members_can_create_repositories',
      'members_can_create_public_repositories',
      'members_can_create_private_repositories',
      'members_can_create_internal_repositories',
      'members_can_create_pages',
      'members_can_create_public_pages',
      'members_can_create_private_pages',
      'members_can_fork_private_repositories',
      'web_commit_signoff_required',
    ];

    for (const key of mutableKeys) {
      const srcVal = src[key];
      const tgtVal = targetSettings[key];

      if (srcVal === undefined) continue;

      // Handle EMU constraint: public repo creation is prohibited in EMU organizations
      if (key === 'members_can_create_public_repositories' && srcVal === true) {
        warnings.push(
          'Source allows members to create public repositories, but EMU organizations disallow public repositories. Setting will be omitted or set to false.',
        );
        diffPayload.members_can_create_public_repositories = false;
        continue;
      }

      if (srcVal !== tgtVal) {
        diffPayload[key] = srcVal;
      }
    }

    if (Object.keys(diffPayload).length > 0) {
      operations.push({
        id: `op-org-settings-${targetOrg}`,
        resourceType: 'org-setting',
        resourceName: targetOrg,
        operation: 'update',
        sourceState: src as Record<string, unknown>,
        destinationCurrentState: targetSettings as Record<string, unknown>,
        payload: diffPayload,
        reason: `Reconciling ${Object.keys(diffPayload).length} organization settings for '${targetOrg}'`,
      });
    } else {
      operations.push({
        id: `op-org-settings-noop-${targetOrg}`,
        resourceType: 'org-setting',
        resourceName: targetOrg,
        operation: 'noop',
        sourceState: src as Record<string, unknown>,
        destinationCurrentState: targetSettings as Record<string, unknown>,
        reason: `Organization settings for '${targetOrg}' already match source configuration`,
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
        const writeOp: TargetWriteOperation = {
          id: `mutate-${op.id}`,
          method: 'PATCH',
          path: '/orgs/{org}',
          pathParams: { org: targetOrg },
          body: payload,
        };

        let res: { status: number; data?: unknown };
        try {
          res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);
        } catch (patchErr: unknown) {
          const patchMsg =
            patchErr instanceof Error ? patchErr.message : String(patchErr);
          if (
            patchMsg.includes('409') &&
            patchMsg.includes('default_repository_permission')
          ) {
            const {
              default_repository_permission: _omitted,
              ...remainingPayload
            } = payload;
            void _omitted;
            if (Object.keys(remainingPayload).length > 0) {
              res = await ctx.targetWriteClient.mutate(
                {
                  ...writeOp,
                  body: remainingPayload,
                },
                ctx.signal,
              );
            } else {
              res = { status: 200 };
            }
          } else {
            throw patchErr;
          }
        }
        results.push({
          operationId: op.id,
          status: 'succeeded',
          httpStatus: res.status,
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

    let targetSettings: OrgSettingsState;
    try {
      const res = await ctx.targetClient.readSingle<RawOrgSettingsResponse>(
        {
          id: 'rest.orgs.verifyOrgSettings',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}',
          pathParams: { org: targetOrg },
        },
        ctx.signal,
      );
      targetSettings = parseOrgSettings(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:settings`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target organization settings: ${message}`,
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
        const sourceState = (op.sourceState as Record<string, unknown>) ?? {};

        const keysToCheck =
          op.operation === 'update'
            ? Object.keys(payload)
            : [
                'default_repository_permission',
                'members_can_create_repositories',
                'members_can_fork_private_repositories',
                'web_commit_signoff_required',
              ];

        for (const k of keysToCheck) {
          const key = k as keyof OrgSettingsState;
          const expectedVal =
            payload[key] !== undefined ? payload[key] : sourceState[key];
          const actualVal = targetSettings[key];

          if (expectedVal !== undefined && actualVal !== expectedVal) {
            discrepancies.push({
              resourceName: `${targetOrg} (${key})`,
              expected: expectedVal,
              actual: actualVal,
              message: `Setting '${key}' mismatch: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`,
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
