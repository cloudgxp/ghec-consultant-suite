import {
  MIGRATION_SCHEMA_VERSION,
  type DiscoveryBundle,
} from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '../../core/types.js';
import type {
  OrganizationVariable,
  OrgVariablesData,
  OrgVariablesModuleOptions,
  OrganizationVisibility,
  RawOrganizationVariablesResponse,
  RawSelectedRepositoriesResponse,
  RepositoryIdMap,
} from './types.js';

const variablesPath = '/orgs/{org}/actions/variables';

function isVisibility(value: unknown): value is OrganizationVisibility {
  return value === 'all' || value === 'private' || value === 'selected';
}

function variableFromOperation(
  operation: PlannedOperation,
): OrganizationVariable | undefined {
  const source = operation.sourceState as
    Partial<OrganizationVariable> | undefined;
  return source?.name && isVisibility(source.visibility)
    ? {
        name: source.name,
        value: source.value ?? '',
        visibility: source.visibility,
        selectedRepositoryIds: source.selectedRepositoryIds ?? [],
      }
    : undefined;
}

export class OrgVariablesMigrationModule implements MigrationModule<OrgVariablesData> {
  readonly id = 'org-variables';
  readonly displayName = 'Organization Actions Variables';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = [];
  private readonly repositoryIdMap: RepositoryIdMap;

  constructor(options: OrgVariablesModuleOptions = {}) {
    this.repositoryIdMap = options.repositoryIdMap ?? {};
  }

  async discover(
    ctx: MigrationContext,
    cachedData?: unknown,
  ): Promise<OrgVariablesData> {
    const cached = this.discoverCached(ctx.scope.sourceOrg, cachedData);
    if (cached) return cached;
    const response =
      await ctx.sourceClient.readSingle<RawOrganizationVariablesResponse>(
        {
          id: 'rest.actions.listOrgVariables',
          transport: 'rest',
          verifiedReadOnly: true,
          path: variablesPath,
          pathParams: { org: ctx.scope.sourceOrg },
        },
        ctx.signal,
      );
    const variables: OrganizationVariable[] = [];
    for (const variable of response.data?.variables ?? []) {
      if (!variable.name) continue;
      const visibility = isVisibility(variable.visibility)
        ? variable.visibility
        : 'all';
      variables.push({
        name: variable.name,
        value: variable.value ?? '',
        visibility,
        selectedRepositoryIds:
          visibility === 'selected'
            ? await this.listSelected(
                ctx.sourceClient,
                ctx.scope.sourceOrg,
                variable.name,
                ctx.signal,
              )
            : [],
        updatedAt: variable.updated_at,
      });
    }
    return { organization: ctx.scope.sourceOrg, variables };
  }

  async plan(
    ctx: MigrationContext,
    source: OrgVariablesData,
  ): Promise<ModulePlan> {
    const warnings: string[] = [];
    const target = await this.discoverTarget(ctx, ctx.scope.targetOrg);
    const targetByName = new Map(
      target.map((variable) => [variable.name, variable]),
    );
    const operations: PlannedOperation[] = [];
    for (const variable of source.variables) {
      const mapped = this.mapSelected(variable, warnings);
      const desired = {
        ...variable,
        selectedRepositoryIds: mapped.map(String),
      };
      const existing = targetByName.get(variable.name);
      const sameScope =
        existing &&
        existing.visibility === desired.visibility &&
        sameIds(existing.selectedRepositoryIds, desired.selectedRepositoryIds);
      const sameValue = existing?.value === desired.value;
      const operation = !existing
        ? 'create'
        : sameScope && sameValue
          ? 'noop'
          : 'update';
      operations.push({
        id: `org-variables:${ctx.scope.targetOrg}:${variable.name}`,
        resourceType: 'organization-variable',
        resourceName: variable.name,
        operation,
        sourceState: desired,
        destinationCurrentState: existing,
        payload: operation === 'noop' ? undefined : this.payload(desired),
        reason:
          operation === 'create'
            ? 'Variable is missing on target organization.'
            : undefined,
      });
    }
    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: ctx.scope.targetOrg,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const startedAt = Date.now();
    const results: OperationExecutionResult[] = [];
    if (!ctx.targetWriteClient && !ctx.dryRun)
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    for (const operation of plan.operations) {
      const completedAt = new Date().toISOString();
      if (operation.operation === 'noop') {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }
      if (
        operation.operation !== 'create' &&
        operation.operation !== 'update'
      ) {
        results.push({
          operationId: operation.id,
          status: 'skipped',
          completedAt,
        });
        continue;
      }
      if (ctx.dryRun) {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }
      try {
        const response = await ctx.targetWriteClient!.mutate(
          {
            id: `rest.actions.${operation.operation}OrgVariable`,
            method: operation.operation === 'create' ? 'POST' : 'PATCH',
            path:
              operation.operation === 'create'
                ? variablesPath
                : `${variablesPath}/{name}`,
            pathParams: {
              org: ctx.scope.targetOrg,
              ...(operation.operation === 'update'
                ? { name: operation.resourceName }
                : {}),
            },
            body: operation.payload,
          },
          ctx.signal,
        );
        results.push({
          operationId: operation.id,
          status:
            response.status >= 200 && response.status < 300
              ? 'succeeded'
              : 'failed',
          httpStatus: response.status,
          completedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          operationId: operation.id,
          status: 'failed',
          error: 'Organization variable update failed.',
          completedAt: new Date().toISOString(),
        });
      }
      if (results.at(-1)?.status === 'failed' && !ctx.continueOnError) break;
    }
    const failed = results.some((result) => result.status === 'failed');
    const succeeded = results.some((result) => result.status === 'succeeded');
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: failed
        ? succeeded
          ? 'partial'
          : 'failed'
        : succeeded
          ? 'complete'
          : 'skipped',
      results,
      durationMs: Date.now() - startedAt,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const target = await this.discoverTarget(ctx, ctx.scope.targetOrg);
    const byName = new Map(target.map((variable) => [variable.name, variable]));
    const discrepancies: VerificationDiscrepancy[] = [];
    for (const operation of plan.operations) {
      const expected = variableFromOperation(operation);
      if (
        !expected ||
        !['create', 'update', 'noop'].includes(operation.operation)
      )
        continue;
      const actual = byName.get(expected.name);
      if (
        !actual ||
        actual.value !== expected.value ||
        actual.visibility !== expected.visibility ||
        !sameIds(actual.selectedRepositoryIds, expected.selectedRepositoryIds)
      ) {
        discrepancies.push({
          resourceName: expected.name,
          expected: 'matching value and visibility',
          actual: actual ? 'mismatched' : 'missing',
          message: `Organization variable "${expected.name}" does not match the planned target state.`,
        });
      }
    }
    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }

  private async discoverTarget(
    ctx: MigrationContext,
    organization: string,
  ): Promise<OrganizationVariable[]> {
    const response =
      await ctx.targetClient.readSingle<RawOrganizationVariablesResponse>(
        {
          id: 'rest.actions.listOrgVariables',
          transport: 'rest',
          verifiedReadOnly: true,
          path: variablesPath,
          pathParams: { org: organization },
        },
        ctx.signal,
      );
    const variables: OrganizationVariable[] = [];
    for (const variable of response.data?.variables ?? []) {
      if (!variable.name) continue;
      const visibility = isVisibility(variable.visibility)
        ? variable.visibility
        : 'all';
      variables.push({
        name: variable.name,
        value: variable.value ?? '',
        visibility,
        selectedRepositoryIds:
          visibility === 'selected'
            ? await this.listSelected(
                ctx.targetClient,
                organization,
                variable.name,
                ctx.signal,
              )
            : [],
        updatedAt: variable.updated_at,
      });
    }
    return variables;
  }

  private async listSelected(
    client: MigrationContext['sourceClient'],
    organization: string,
    name: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    const response = await client.readSingle<RawSelectedRepositoriesResponse>(
      {
        id: 'rest.actions.listSelectedOrgVariableRepositories',
        transport: 'rest',
        verifiedReadOnly: true,
        path: `${variablesPath}/{name}/repositories`,
        pathParams: { org: organization, name },
      },
      signal,
    );
    return (response.data?.repositories ?? []).flatMap((repository) =>
      repository.id === undefined ? [] : [String(repository.id)],
    );
  }

  private mapSelected(
    variable: OrganizationVariable,
    warnings: string[],
  ): number[] {
    if (variable.visibility !== 'selected') return [];
    const mapped: number[] = [];
    for (const sourceId of variable.selectedRepositoryIds) {
      const targetId = this.repositoryIdMap[sourceId];
      if (targetId === undefined)
        warnings.push(
          `Selected repository ${sourceId} for variable "${variable.name}" has no target repository ID mapping.`,
        );
      else mapped.push(targetId);
    }
    return [...new Set(mapped)].sort((left, right) => left - right);
  }

  private payload(variable: OrganizationVariable): Record<string, unknown> {
    return {
      name: variable.name,
      value: variable.value,
      visibility: variable.visibility,
      ...(variable.visibility === 'selected'
        ? {
            selected_repository_ids: variable.selectedRepositoryIds.map(Number),
          }
        : {}),
    };
  }

  private discoverCached(
    organization: string,
    cachedData?: unknown,
  ): OrgVariablesData | undefined {
    const bundle = cachedData as DiscoveryBundle | undefined;
    const org = bundle?.organizations.find(
      (candidate) => candidate.login === organization,
    );
    if (!org) return undefined;
    return {
      organization,
      variables: bundle!.entities.flatMap((entity) =>
        entity.kind === 'configuration-metadata' &&
        entity.organizationId === org.id &&
        entity.domain === 'actions' &&
        entity.configurationKind === 'variable' &&
        entity.level === 'organization'
          ? [
              {
                name: entity.name,
                value: '',
                visibility: isVisibility(
                  entity.accessMode === 'all_repositories'
                    ? 'all'
                    : entity.accessMode === 'private_repositories'
                      ? 'private'
                      : entity.accessMode === 'selected_repositories'
                        ? 'selected'
                        : undefined,
                )
                  ? entity.accessMode === 'all_repositories'
                    ? 'all'
                    : entity.accessMode === 'private_repositories'
                      ? 'private'
                      : 'selected'
                  : 'all',
                selectedRepositoryIds: entity.selectedRepositoryIds,
              },
            ]
          : [],
      ),
    };
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}
