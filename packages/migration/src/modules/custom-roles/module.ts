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
  assertReadResponseOk,
  formatSanitizedReadError,
  isExpectedFeatureAbsentError,
} from '../../core/read-error-classifier.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  TargetWriteOperation,
} from '../../core/types.js';
import type {
  CustomOrganizationRoleDefinition,
  CustomRepoBaseRole,
  CustomRepositoryRoleDefinition,
  CustomRolesMigrationData,
  RawCustomOrgRole,
  RawCustomRepoRole,
} from './types.js';

function normalizeRepoBaseRole(raw: string | undefined): CustomRepoBaseRole {
  const normalized = raw?.toLowerCase();
  switch (normalized) {
    case 'admin':
      return 'admin';
    case 'maintain':
      return 'maintain';
    case 'write':
      return 'write';
    case 'triage':
      return 'triage';
    case 'read':
    default:
      return 'read';
  }
}

function arePermissionsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((val, idx) => val === sortedRight[idx]);
}

function parseRawCustomRepoRoles(data: unknown): RawCustomRepoRole[] {
  if (Array.isArray(data)) {
    return data as RawCustomRepoRole[];
  }
  if (
    data &&
    typeof data === 'object' &&
    'custom_roles' in data &&
    Array.isArray((data as { custom_roles: unknown }).custom_roles)
  ) {
    return (data as { custom_roles: RawCustomRepoRole[] }).custom_roles;
  }
  return [];
}

function parseRawCustomOrgRoles(data: unknown): RawCustomOrgRole[] {
  if (Array.isArray(data)) {
    return data as RawCustomOrgRole[];
  }
  if (
    data &&
    typeof data === 'object' &&
    'roles' in data &&
    Array.isArray((data as { roles: unknown }).roles)
  ) {
    return (data as { roles: RawCustomOrgRole[] }).roles;
  }
  return [];
}

export class CustomRolesMigrationModule implements MigrationModule<CustomRolesMigrationData> {
  readonly id = 'custom-roles';
  readonly displayName = 'Custom Organization & Repository Roles';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = [];

  async discover(ctx: MigrationContext): Promise<CustomRolesMigrationData> {
    const sourceOrg = ctx.scope.sourceOrg;
    const repositoryRoles: CustomRepositoryRoleDefinition[] = [];
    const organizationRoles: CustomOrganizationRoleDefinition[] = [];

    // 1. Discover Custom Repository Roles
    try {
      const res = await ctx.sourceClient.readSingle<unknown>(
        {
          id: 'rest.orgs.listCustomRepoRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/custom-repository-roles',
          pathParams: { org: sourceOrg },
        },
        ctx.signal,
      );
      assertReadResponseOk(res, `/orgs/${sourceOrg}/custom-repository-roles`);

      const rawRoles = parseRawCustomRepoRoles(res.data);
      for (const raw of rawRoles) {
        if (!raw.name) continue;
        repositoryRoles.push({
          id: raw.id,
          name: raw.name,
          description: raw.description ?? undefined,
          baseRole: normalizeRepoBaseRole(raw.base_role),
          permissions: raw.permissions ? [...raw.permissions].sort() : [],
        });
      }
    } catch (err: unknown) {
      if (isExpectedFeatureAbsentError(err)) {
        ctx.logger?.warn?.(
          `Custom repository roles not available for '${sourceOrg}': ${formatSanitizedReadError(err)}`,
        );
      } else {
        const msg = formatSanitizedReadError(
          `Failed to discover custom repository roles for '${sourceOrg}'`,
          err,
        );
        ctx.logger?.error?.(msg);
        throw new Error(msg, { cause: err });
      }
    }

    // 2. Discover Custom Organization Roles
    try {
      const res = await ctx.sourceClient.readSingle<unknown>(
        {
          id: 'rest.orgs.listOrgRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/organization-roles',
          pathParams: { org: sourceOrg },
        },
        ctx.signal,
      );
      assertReadResponseOk(res, `/orgs/${sourceOrg}/organization-roles`);

      const rawRoles = parseRawCustomOrgRoles(res.data);
      for (const raw of rawRoles) {
        if (!raw.name) continue;
        organizationRoles.push({
          id: raw.id,
          name: raw.name,
          description: raw.description ?? undefined,
          permissions: raw.permissions ? [...raw.permissions].sort() : [],
        });
      }
    } catch (err: unknown) {
      if (isExpectedFeatureAbsentError(err)) {
        ctx.logger?.warn?.(
          `Custom organization roles not available for '${sourceOrg}': ${formatSanitizedReadError(err)}`,
        );
      } else {
        const msg = formatSanitizedReadError(
          `Failed to discover custom organization roles for '${sourceOrg}'`,
          err,
        );
        ctx.logger?.error?.(msg);
        throw new Error(msg, { cause: err });
      }
    }

    return {
      organization: sourceOrg,
      repositoryRoles,
      organizationRoles,
    };
  }

  async plan(
    ctx: MigrationContext,
    source: CustomRolesMigrationData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];

    // 1. Query target custom repository roles
    const targetRepoRolesByName = new Map<
      string,
      CustomRepositoryRoleDefinition
    >();
    try {
      const res = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.orgs.listTargetCustomRepoRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/custom-repository-roles',
          pathParams: { org: targetOrg },
        },
        ctx.signal,
      );
      const rawRoles = parseRawCustomRepoRoles(res.data);
      for (const raw of rawRoles) {
        if (!raw.name) continue;
        targetRepoRolesByName.set(raw.name, {
          id: raw.id,
          name: raw.name,
          description: raw.description ?? undefined,
          baseRole: normalizeRepoBaseRole(raw.base_role),
          permissions: raw.permissions ? [...raw.permissions].sort() : [],
        });
      }
    } catch {
      // Fresh target or feature unavailable
    }

    // 2. Query target custom organization roles
    const targetOrgRolesByName = new Map<
      string,
      CustomOrganizationRoleDefinition
    >();
    try {
      const res = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.orgs.listTargetOrgRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/organization-roles',
          pathParams: { org: targetOrg },
        },
        ctx.signal,
      );
      const rawRoles = parseRawCustomOrgRoles(res.data);
      for (const raw of rawRoles) {
        if (!raw.name) continue;
        targetOrgRolesByName.set(raw.name, {
          id: raw.id,
          name: raw.name,
          description: raw.description ?? undefined,
          permissions: raw.permissions ? [...raw.permissions].sort() : [],
        });
      }
    } catch {
      // Fresh target or feature unavailable
    }

    // Plan repository roles
    for (const srcRole of source.repositoryRoles) {
      const targetRole = targetRepoRolesByName.get(srcRole.name);
      if (!targetRole) {
        operations.push({
          id: `op-custom-repo-role-create-${srcRole.name}`,
          resourceType: 'custom-repository-role',
          resourceName: srcRole.name,
          operation: 'create',
          sourceState: srcRole,
          destinationCurrentState: undefined,
          reason: `Recreating custom repository role '${srcRole.name}' with base role '${srcRole.baseRole}'`,
        });
      } else {
        const needsUpdate =
          srcRole.baseRole !== targetRole.baseRole ||
          (srcRole.description &&
            srcRole.description !== targetRole.description) ||
          !arePermissionsEqual(srcRole.permissions, targetRole.permissions);

        if (needsUpdate) {
          operations.push({
            id: `op-custom-repo-role-update-${srcRole.name}`,
            resourceType: 'custom-repository-role',
            resourceName: srcRole.name,
            operation: 'update',
            sourceState: srcRole,
            destinationCurrentState: targetRole,
            reason: `Aligning custom repository role '${srcRole.name}' configuration`,
          });
        } else {
          operations.push({
            id: `op-custom-repo-role-noop-${srcRole.name}`,
            resourceType: 'custom-repository-role',
            resourceName: srcRole.name,
            operation: 'noop',
            sourceState: srcRole,
            destinationCurrentState: targetRole,
            reason: `Custom repository role '${srcRole.name}' already matches target configuration`,
          });
        }
      }
    }

    // Plan organization roles
    for (const srcRole of source.organizationRoles) {
      const targetRole = targetOrgRolesByName.get(srcRole.name);
      if (!targetRole) {
        operations.push({
          id: `op-custom-org-role-create-${srcRole.name}`,
          resourceType: 'custom-organization-role',
          resourceName: srcRole.name,
          operation: 'create',
          sourceState: srcRole,
          destinationCurrentState: undefined,
          reason: `Recreating custom organization role '${srcRole.name}'`,
        });
      } else {
        const needsUpdate =
          (srcRole.description &&
            srcRole.description !== targetRole.description) ||
          !arePermissionsEqual(srcRole.permissions, targetRole.permissions);

        if (needsUpdate) {
          operations.push({
            id: `op-custom-org-role-update-${srcRole.name}`,
            resourceType: 'custom-organization-role',
            resourceName: srcRole.name,
            operation: 'update',
            sourceState: srcRole,
            destinationCurrentState: targetRole,
            reason: `Aligning custom organization role '${srcRole.name}' configuration`,
          });
        } else {
          operations.push({
            id: `op-custom-org-role-noop-${srcRole.name}`,
            resourceType: 'custom-organization-role',
            resourceName: srcRole.name,
            operation: 'noop',
            sourceState: srcRole,
            destinationCurrentState: targetRole,
            reason: `Custom organization role '${srcRole.name}' already matches target configuration`,
          });
        }
      }
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: targetOrg,
      operations,
      warnings: [],
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
        if (op.resourceType === 'custom-repository-role') {
          const role = op.sourceState as CustomRepositoryRoleDefinition;
          const payload: Record<string, unknown> = {
            name: role.name,
            base_role: role.baseRole,
            permissions: role.permissions,
            ...(role.description ? { description: role.description } : {}),
          };

          if (op.operation === 'create') {
            const writeOp: TargetWriteOperation = {
              id: `mutate-${op.id}`,
              method: 'POST',
              path: '/orgs/{org}/custom-repository-roles',
              pathParams: { org: targetOrg },
              body: payload,
            };
            const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } else if (op.operation === 'update') {
            const targetRole = op.destinationCurrentState as
              CustomRepositoryRoleDefinition | undefined;
            const roleId = targetRole?.id;
            const writeOp: TargetWriteOperation = {
              id: `mutate-${op.id}`,
              method: 'PATCH',
              path: roleId
                ? '/orgs/{org}/custom-repository-roles/{role_id}'
                : '/orgs/{org}/custom-repository-roles',
              pathParams: {
                org: targetOrg,
                ...(roleId ? { role_id: String(roleId) } : {}),
              },
              body: payload,
            };
            const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          }
        } else if (op.resourceType === 'custom-organization-role') {
          const role = op.sourceState as CustomOrganizationRoleDefinition;
          const payload: Record<string, unknown> = {
            name: role.name,
            permissions: role.permissions,
            ...(role.description ? { description: role.description } : {}),
          };

          if (op.operation === 'create') {
            const writeOp: TargetWriteOperation = {
              id: `mutate-${op.id}`,
              method: 'POST',
              path: '/orgs/{org}/organization-roles',
              pathParams: { org: targetOrg },
              body: payload,
            };
            const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          } else if (op.operation === 'update') {
            const targetRole = op.destinationCurrentState as
              CustomOrganizationRoleDefinition | undefined;
            const roleId = targetRole?.id;
            const writeOp: TargetWriteOperation = {
              id: `mutate-${op.id}`,
              method: 'PATCH',
              path: roleId
                ? '/orgs/{org}/organization-roles/{role_id}'
                : '/orgs/{org}/organization-roles',
              pathParams: {
                org: targetOrg,
                ...(roleId ? { role_id: String(roleId) } : {}),
              },
              body: payload,
            };
            const res = await ctx.targetWriteClient.mutate(writeOp, ctx.signal);
            results.push({
              operationId: op.id,
              status: 'succeeded',
              httpStatus: res.status,
              completedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err: unknown) {
        results.push({
          operationId: op.id,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: (err as Error).message || String(err),
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

    // Fetch target custom repo roles
    const targetRepoRolesByName = new Map<
      string,
      CustomRepositoryRoleDefinition
    >();
    try {
      const res = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.orgs.verifyCustomRepoRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/custom-repository-roles',
          pathParams: { org: targetOrg },
        },
        ctx.signal,
      );
      const rawRoles = parseRawCustomRepoRoles(res.data);
      for (const raw of rawRoles) {
        if (!raw.name) continue;
        targetRepoRolesByName.set(raw.name, {
          id: raw.id,
          name: raw.name,
          description: raw.description ?? undefined,
          baseRole: normalizeRepoBaseRole(raw.base_role),
          permissions: raw.permissions ? [...raw.permissions].sort() : [],
        });
      }
    } catch (err) {
      discrepancies.push({
        resourceName: `${targetOrg}:custom-repo-roles`,
        expected: 'accessible',
        actual: `Failed to query: ${(err as Error).message || String(err)}`,
        message: `Failed to query target custom repository roles: ${(err as Error).message || String(err)}`,
      });
    }

    // Fetch target custom org roles
    const targetOrgRolesByName = new Map<
      string,
      CustomOrganizationRoleDefinition
    >();
    try {
      const res = await ctx.targetClient.readSingle<unknown>(
        {
          id: 'rest.orgs.verifyOrgRoles',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/organization-roles',
          pathParams: { org: targetOrg },
        },
        ctx.signal,
      );
      const rawRoles = parseRawCustomOrgRoles(res.data);
      for (const raw of rawRoles) {
        if (!raw.name) continue;
        targetOrgRolesByName.set(raw.name, {
          id: raw.id,
          name: raw.name,
          description: raw.description ?? undefined,
          permissions: raw.permissions ? [...raw.permissions].sort() : [],
        });
      }
    } catch (err) {
      discrepancies.push({
        resourceName: `${targetOrg}:custom-org-roles`,
        expected: 'accessible',
        actual: `Failed to query: ${(err as Error).message || String(err)}`,
        message: `Failed to query target custom organization roles: ${(err as Error).message || String(err)}`,
      });
    }

    for (const op of plan.operations) {
      if (op.operation === 'noop' || op.operation === 'skip') {
        continue;
      }

      if (op.resourceType === 'custom-repository-role') {
        const expectedRole = op.sourceState as CustomRepositoryRoleDefinition;
        const actualRole = targetRepoRolesByName.get(expectedRole.name);

        if (!actualRole) {
          discrepancies.push({
            resourceName: `repo-role:${expectedRole.name}`,
            expected: `Role '${expectedRole.name}' present`,
            actual: 'missing',
            message: `Custom repository role '${expectedRole.name}' is missing on '${targetOrg}'`,
          });
        } else {
          if (actualRole.baseRole !== expectedRole.baseRole) {
            discrepancies.push({
              resourceName: `repo-role:${expectedRole.name}:base_role`,
              expected: expectedRole.baseRole,
              actual: actualRole.baseRole,
              message: `Base role mismatch for '${expectedRole.name}': expected '${expectedRole.baseRole}', found '${actualRole.baseRole}'`,
            });
          }
          if (
            !arePermissionsEqual(
              expectedRole.permissions,
              actualRole.permissions,
            )
          ) {
            discrepancies.push({
              resourceName: `repo-role:${expectedRole.name}:permissions`,
              expected: expectedRole.permissions.join(','),
              actual: actualRole.permissions.join(','),
              message: `Permissions mismatch for '${expectedRole.name}': expected [${expectedRole.permissions.join(',')}], found [${actualRole.permissions.join(',')}]`,
            });
          }
        }
      } else if (op.resourceType === 'custom-organization-role') {
        const expectedRole = op.sourceState as CustomOrganizationRoleDefinition;
        const actualRole = targetOrgRolesByName.get(expectedRole.name);

        if (!actualRole) {
          discrepancies.push({
            resourceName: `org-role:${expectedRole.name}`,
            expected: `Role '${expectedRole.name}' present`,
            actual: 'missing',
            message: `Custom organization role '${expectedRole.name}' is missing on '${targetOrg}'`,
          });
        } else {
          if (
            !arePermissionsEqual(
              expectedRole.permissions,
              actualRole.permissions,
            )
          ) {
            discrepancies.push({
              resourceName: `org-role:${expectedRole.name}:permissions`,
              expected: expectedRole.permissions.join(','),
              actual: actualRole.permissions.join(','),
              message: `Permissions mismatch for '${expectedRole.name}': expected [${expectedRole.permissions.join(',')}], found [${actualRole.permissions.join(',')}]`,
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
