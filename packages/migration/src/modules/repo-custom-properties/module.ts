import { MIGRATION_SCHEMA_VERSION } from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
} from '../../core/types.js';
import type {
  RawRepositoryCustomPropertyValue,
  RepoCustomPropertiesData,
  RepositoryCustomPropertyValue,
} from './types.js';

const valuesPath = '/repos/{owner}/{repo}/properties/values';
const normalize = (
  item: RawRepositoryCustomPropertyValue,
): RepositoryCustomPropertyValue | undefined =>
  item.property_name
    ? { propertyName: item.property_name, value: item.value ?? null }
    : undefined;
const same = (
  left: RepositoryCustomPropertyValue,
  right: RepositoryCustomPropertyValue | undefined,
) => JSON.stringify(left?.value) === JSON.stringify(right?.value);

export class RepoCustomPropertiesMigrationModule implements MigrationModule<RepoCustomPropertiesData> {
  readonly id = 'repo-custom-properties';
  readonly displayName = 'Repository Custom Property Values';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = [
    'gei-repo',
    'org-custom-properties',
  ];
  async discover(ctx: MigrationContext): Promise<RepoCustomPropertiesData> {
    const repo = ctx.scope.sourceRepo ?? '';
    const response = await ctx.sourceClient.readSingle<{
      properties?: RawRepositoryCustomPropertyValue[];
    }>(
      {
        id: 'rest.repos.listCustomPropertyValues',
        transport: 'rest',
        verifiedReadOnly: true,
        path: valuesPath,
        pathParams: { owner: ctx.scope.sourceOrg, repo },
      },
      ctx.signal,
    );
    return {
      repository: repo,
      values: (response.data?.properties ?? []).flatMap((item) => {
        const value = normalize(item);
        return value ? [value] : [];
      }),
    };
  }
  async plan(
    ctx: MigrationContext,
    source: RepoCustomPropertiesData,
  ): Promise<ModulePlan> {
    const repo = ctx.scope.targetRepo ?? source.repository;
    let rawProperties: RawRepositoryCustomPropertyValue[];
    try {
      const response = await ctx.targetClient.readSingle<{
        properties?: RawRepositoryCustomPropertyValue[];
      }>(
        {
          id: 'rest.repos.listCustomPropertyValues',
          transport: 'rest',
          verifiedReadOnly: true,
          path: valuesPath,
          pathParams: { owner: ctx.scope.targetOrg, repo },
        },
        ctx.signal,
      );
      rawProperties = response.data?.properties ?? [];
    } catch {
      rawProperties = [];
    }
    const target = new Map(
      rawProperties.flatMap((item) => {
        const value = normalize(item);
        return value ? [[value.propertyName, value] as const] : [];
      }),
    );
    const changed = source.values.filter(
      (value) => !same(value, target.get(value.propertyName)),
    );
    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${ctx.scope.targetOrg}/${repo}`,
      operations: changed.length
        ? [
            {
              id: `repo-custom-properties:${repo}`,
              resourceType: 'custom-property-values',
              resourceName: repo,
              operation: 'update',
              sourceState: source.values,
              payload: {
                repository_names: [repo],
                properties: changed.map((value) => ({
                  property_name: value.propertyName,
                  value: value.value,
                })),
              },
            },
          ]
        : [
            {
              id: `repo-custom-properties:${repo}`,
              resourceType: 'custom-property-values',
              resourceName: repo,
              operation: 'noop',
            },
          ],
      warnings: [],
    };
  }
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    const op = plan.operations[0];
    if (!op || op.operation === 'noop')
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        results: [],
        durationMs: 0,
      };
    if (!ctx.targetWriteClient && !ctx.dryRun)
      throw new Error('TargetWriteClient must be provided.');
    if (ctx.dryRun)
      return {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: this.id,
        status: 'complete',
        results: [
          {
            operationId: op.id,
            status: 'succeeded',
            completedAt: new Date().toISOString(),
          },
        ],
        durationMs: 0,
      };
    const response = await ctx.targetWriteClient!.mutate(
      {
        id: 'rest.orgs.patchCustomPropertyValues',
        method: 'PATCH',
        path: '/orgs/{org}/properties/values',
        pathParams: { org: ctx.scope.targetOrg },
        body: op.payload,
      },
      ctx.signal,
    );
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: response.status < 300 ? 'complete' : 'failed',
      results: [
        {
          operationId: op.id,
          status: response.status < 300 ? 'succeeded' : 'failed',
          httpStatus: response.status,
          completedAt: new Date().toISOString(),
        },
      ],
      durationMs: 0,
    };
  }
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const source = plan.operations[0]?.sourceState as
      readonly RepositoryCustomPropertyValue[] | undefined;
    if (!source)
      return { moduleId: this.id, verified: true, discrepancies: [] };
    const actual = await this.discover({
      ...ctx,
      sourceClient: ctx.targetClient,
      scope: {
        level: 'repository',
        sourceOrg: ctx.scope.targetOrg,
        targetOrg: ctx.scope.targetOrg,
        sourceRepo: ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '',
      },
    });
    const map = new Map(
      actual.values.map((value) => [value.propertyName, value]),
    );
    const discrepancies = source
      .filter((value) => !same(value, map.get(value.propertyName)))
      .map((value) => ({
        resourceName: value.propertyName,
        expected: 'matching value',
        actual: 'mismatched',
        message: 'Custom property value differs.',
      }));
    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
