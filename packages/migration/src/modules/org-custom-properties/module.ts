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
  CustomPropertyDefinition,
  OrgCustomPropertiesData,
  RawCustomPropertyDefinition,
} from './types.js';

const path = '/orgs/{org}/properties/schema';
const normalize = (
  item: RawCustomPropertyDefinition,
): CustomPropertyDefinition | undefined =>
  item.property_name && item.value_type
    ? {
        propertyName: item.property_name,
        valueType: item.value_type,
        description: item.description,
        required: item.required ?? false,
        defaultValue: item.default_value,
        allowedValues: item.allowed_values ?? [],
      }
    : undefined;
const equal = (
  left: CustomPropertyDefinition,
  right: CustomPropertyDefinition,
) => JSON.stringify(left) === JSON.stringify(right);

export class OrgCustomPropertiesMigrationModule implements MigrationModule<OrgCustomPropertiesData> {
  readonly id = 'org-custom-properties';
  readonly displayName = 'Organization Custom Property Schemas';
  readonly scopeLevel: MigrationScopeLevel = 'organization';
  readonly dependencies: readonly string[] = [];
  async discover(ctx: MigrationContext): Promise<OrgCustomPropertiesData> {
    const response = await ctx.sourceClient.readSingle<{
      properties?: RawCustomPropertyDefinition[];
    }>(
      {
        id: 'rest.orgs.listCustomPropertySchemas',
        transport: 'rest',
        verifiedReadOnly: true,
        path,
        pathParams: { org: ctx.scope.sourceOrg },
      },
      ctx.signal,
    );
    return {
      organization: ctx.scope.sourceOrg,
      definitions: (response.data?.properties ?? []).flatMap((item) => {
        const definition = normalize(item);
        return definition ? [definition] : [];
      }),
    };
  }
  async plan(
    ctx: MigrationContext,
    source: OrgCustomPropertiesData,
  ): Promise<ModulePlan> {
    const response = await ctx.targetClient.readSingle<{
      properties?: RawCustomPropertyDefinition[];
    }>(
      {
        id: 'rest.orgs.listCustomPropertySchemas',
        transport: 'rest',
        verifiedReadOnly: true,
        path,
        pathParams: { org: ctx.scope.targetOrg },
      },
      ctx.signal,
    );
    const target = new Map(
      (response.data?.properties ?? []).flatMap((item) => {
        const definition = normalize(item);
        return definition
          ? [[definition.propertyName, definition] as const]
          : [];
      }),
    );
    const operations = source.definitions.map((definition) => {
      const existing = target.get(definition.propertyName);
      return {
        id: `org-custom-properties:${ctx.scope.targetOrg}:${definition.propertyName}`,
        resourceType: 'custom-property-schema',
        resourceName: definition.propertyName,
        operation: !existing
          ? 'create'
          : equal(definition, existing)
            ? 'noop'
            : 'update' as 'create' | 'update' | 'noop',
        sourceState: definition,
        destinationCurrentState: existing,
        payload: definition,
      };
    });
    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: ctx.scope.targetOrg,
      operations,
      warnings: [],
    };
  }
  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    if (!ctx.targetWriteClient && !ctx.dryRun)
      throw new Error('TargetWriteClient must be provided.');
    const results = [];
    for (const operation of plan.operations) {
      if (operation.operation === 'noop') {
        results.push({
          operationId: operation.id,
          status: 'succeeded' as const,
          completedAt: new Date().toISOString(),
        });
        continue;
      }
      if (ctx.dryRun) {
        results.push({
          operationId: operation.id,
          status: 'succeeded' as const,
          completedAt: new Date().toISOString(),
        });
        continue;
      }
      const result = await ctx.targetWriteClient!.mutate(
        {
          id: 'rest.orgs.createOrUpdateCustomPropertySchema',
          method: 'PUT',
          path,
          pathParams: { org: ctx.scope.targetOrg },
          body: operation.payload,
        },
        ctx.signal,
      );
      results.push({
        operationId: operation.id,
        status:
          result.status < 300 ? ('succeeded' as const) : ('failed' as const),
        httpStatus: result.status,
        completedAt: new Date().toISOString(),
      });
    }
    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: results.some((r) => r.status === 'failed')
        ? 'failed'
        : 'complete',
      results,
      durationMs: 0,
    };
  }
  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const target = await this.discover({
      ...ctx,
      sourceClient: ctx.targetClient,
      scope: {
        level: 'organization',
        sourceOrg: ctx.scope.targetOrg,
        targetOrg: ctx.scope.targetOrg,
      },
    });
    const map = new Map(
      target.definitions.map((definition) => [
        definition.propertyName,
        definition,
      ]),
    );
    const discrepancies = plan.operations.flatMap((operation) => {
      const expected = operation.sourceState as CustomPropertyDefinition;
      return equal(
        expected,
        map.get(expected.propertyName) ?? ({} as CustomPropertyDefinition),
      )
        ? []
        : [
            {
              resourceName: expected.propertyName,
              expected: 'matching schema',
              actual: 'mismatched',
              message: 'Custom property schema differs.',
            },
          ];
    });
    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
