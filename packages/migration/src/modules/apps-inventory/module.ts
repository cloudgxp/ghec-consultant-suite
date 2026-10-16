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
} from '../../core/types.js';
import type {
  AppInstallationState,
  AppsInventoryData,
  RawAppInstallationResponse,
  RawAppInstallationsListResponse,
} from './types.js';

function parseInstallations(
  data: RawAppInstallationsListResponse | unknown,
): AppInstallationState[] {
  if (!data || typeof data !== 'object') return [];
  const list = data as RawAppInstallationsListResponse;
  const items = Array.isArray(list.installations) ? list.installations : [];

  return items.map((inst: RawAppInstallationResponse) => ({
    id: inst.id,
    app_id: inst.app_id,
    app_slug: inst.app_slug ?? `app-${inst.app_id}`,
    repository_selection:
      inst.repository_selection?.toLowerCase() === 'selected'
        ? 'selected'
        : 'all',
    permissions: inst.permissions ?? {},
    events: Array.isArray(inst.events) ? [...inst.events] : [],
    html_url: inst.html_url ?? undefined,
  }));
}

function comparePermissions(
  source: Readonly<Record<string, string>>,
  target: Readonly<Record<string, string>>,
): { matches: boolean; diffs: string[] } {
  const diffs: string[] = [];
  for (const [key, val] of Object.entries(source)) {
    if (target[key] !== val) {
      diffs.push(`${key}: expected "${val}", got "${target[key] ?? 'none'}"`);
    }
  }
  return { matches: diffs.length === 0, diffs };
}

export class AppsInventoryMigrationModule implements MigrationModule<AppsInventoryData> {
  readonly id = 'apps-inventory';
  readonly displayName = 'GitHub Apps & Integrations Inventory';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = ['org-settings'];

  async discover(ctx: MigrationContext): Promise<AppsInventoryData> {
    const sourceOrg = ctx.scope.sourceOrg;
    let installations: AppInstallationState[];

    try {
      const res =
        await ctx.sourceClient.readSingle<RawAppInstallationsListResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: sourceOrg },
          },
          ctx.signal,
        );

      installations = parseInstallations(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to discover GitHub Apps inventory for ${sourceOrg}: ${message}`,
        { cause: err },
      );
    }

    return {
      organization: sourceOrg,
      installations,
    };
  }

  async plan(
    ctx: MigrationContext,
    source: AppsInventoryData,
  ): Promise<ModulePlan> {
    const targetOrg = ctx.scope.targetOrg;
    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    let targetInstallations: AppInstallationState[] = [];
    try {
      const res =
        await ctx.targetClient.readSingle<RawAppInstallationsListResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );
      targetInstallations = parseInstallations(res.data);
    } catch (err: unknown) {
      ctx.logger.warn(
        `Could not query target installations for ${targetOrg}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const targetMap = new Map<string, AppInstallationState>();
    for (const inst of targetInstallations) {
      targetMap.set(inst.app_slug.toLowerCase(), inst);
    }

    for (const app of source.installations) {
      const slugKey = app.app_slug.toLowerCase();
      const existing = targetMap.get(slugKey);

      if (existing) {
        const { matches, diffs } = comparePermissions(
          app.permissions,
          existing.permissions,
        );
        if (matches) {
          operations.push({
            id: `op-noop-app-${slugKey}`,
            resourceType: 'github_app_installation',
            resourceName: app.app_slug,
            operation: 'noop',
            sourceState: app as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            reason: `GitHub App "${app.app_slug}" already installed with matching permissions on target`,
          });
        } else {
          const warnMsg = `GitHub App "${app.app_slug}" is installed on target but has permission differences: ${diffs.join('; ')}`;
          warnings.push(warnMsg);
          operations.push({
            id: `op-advisory-app-perms-${slugKey}`,
            resourceType: 'github_app_installation',
            resourceName: app.app_slug,
            operation: 'warn',
            sourceState: app as unknown as Record<string, unknown>,
            destinationCurrentState: existing as unknown as Record<
              string,
              unknown
            >,
            payload: {
              app_slug: app.app_slug,
              diffs,
              expectedPermissions: app.permissions,
              actualPermissions: existing.permissions,
            },
            reason: warnMsg,
          });
        }
      } else {
        const advisory = `GitHub Apps cannot be installed programmatically via API. An organization administrator must authorize and install "${app.app_slug}" (ID: ${app.app_id}) on ${targetOrg}.`;
        warnings.push(
          `Manual reinstallation advisory: GitHub App "${app.app_slug}" must be installed on ${targetOrg} manually.`,
        );

        operations.push({
          id: `op-advisory-app-${slugKey}`,
          resourceType: 'github_app_installation',
          resourceName: app.app_slug,
          operation: 'warn',
          sourceState: app as unknown as Record<string, unknown>,
          payload: {
            app_id: app.app_id,
            app_slug: app.app_slug,
            html_url: app.html_url,
            permissions: app.permissions,
            events: app.events,
            repository_selection: app.repository_selection,
            advisory,
          },
          reason: advisory,
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

    for (const op of plan.operations) {
      const completedAt = new Date().toISOString();

      if (op.operation === 'warn') {
        const payload = op.payload as { advisory?: string } | undefined;
        ctx.logger.info(
          `[Advisory] ${op.reason ?? op.resourceName}${payload?.advisory ? `: ${payload.advisory}` : ''}`,
        );
      }

      results.push({
        operationId: op.id,
        status: 'succeeded',
        completedAt,
      });
    }

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: 'complete',
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

    let targetInstallations: AppInstallationState[];
    try {
      const res =
        await ctx.targetClient.readSingle<RawAppInstallationsListResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: targetOrg },
          },
          ctx.signal,
        );
      targetInstallations = parseInstallations(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      discrepancies.push({
        resourceName: `${targetOrg}:apps-inventory`,
        expected: 'accessible',
        actual: `Failed to query: ${message}`,
        message: `Failed to query target app installations on ${targetOrg}: ${message}`,
      });
      return {
        moduleId: this.id,
        verified: false,
        discrepancies,
      };
    }

    const targetMap = new Map<string, AppInstallationState>();
    for (const inst of targetInstallations) {
      targetMap.set(inst.app_slug.toLowerCase(), inst);
    }

    for (const op of plan.operations) {
      if (op.operation === 'warn' || op.operation === 'noop') {
        const appSlug = op.resourceName;
        const act = targetMap.get(appSlug.toLowerCase());

        if (!act) {
          const isManualInstallAdvisory =
            op.operation === 'warn' &&
            typeof (op.payload as { advisory?: unknown } | undefined)
              ?.advisory === 'string';
          if (isManualInstallAdvisory && ctx.continueOnError) {
            ctx.logger.warn(
              `[Advisory] GitHub App "${appSlug}" requires manual administrator installation on ${targetOrg}.`,
            );
            continue;
          }
          discrepancies.push({
            resourceName: `${targetOrg} (installations.${appSlug})`,
            expected: appSlug,
            actual: null,
            message: `GitHub App "${appSlug}" is not installed on target organization ${targetOrg}.`,
          });
          continue;
        }

        const expectedPermissions =
          (
            op.payload as
              | {
                  permissions?: Readonly<Record<string, string>>;
                  expectedPermissions?: Readonly<Record<string, string>>;
                }
              | undefined
          )?.permissions ??
          (
            op.payload as
              | {
                  permissions?: Readonly<Record<string, string>>;
                  expectedPermissions?: Readonly<Record<string, string>>;
                }
              | undefined
          )?.expectedPermissions ??
          (
            op.sourceState as
              { permissions?: Readonly<Record<string, string>> } | undefined
          )?.permissions;

        if (expectedPermissions) {
          const { matches, diffs } = comparePermissions(
            expectedPermissions,
            act.permissions,
          );
          if (!matches) {
            discrepancies.push({
              resourceName: `${targetOrg} (installations.${appSlug}.permissions)`,
              expected: expectedPermissions,
              actual: act.permissions,
              message: `GitHub App "${appSlug}" permissions mismatch: ${diffs.join('; ')}`,
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
