import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  MigrationModuleIdSchema,
  MigrationScopeLevelSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PlannedOperationTypeSchema,
  TimestampSchema,
} from '../migration-common.js';

export const PlannedOperationSchema = z
  .object({
    id: NonEmptyStringSchema,
    resourceType: NonEmptyStringSchema,
    resourceName: NonEmptyStringSchema,
    operation: PlannedOperationTypeSchema,
    sourceState: z.unknown().optional(),
    destinationCurrentState: z.unknown().optional(),
    payload: z.unknown().optional(),
    reason: z.string().max(2048).optional(),
  })
  .strict();

const PlanSummarySchema = z
  .object({
    create: NonNegativeIntegerSchema,
    update: NonNegativeIntegerSchema,
    noop: NonNegativeIntegerSchema,
    skip: NonNegativeIntegerSchema,
    warn: NonNegativeIntegerSchema,
  })
  .strict();

export const ModulePlanSchema = z
  .object({
    moduleId: MigrationModuleIdSchema,
    scopeLevel: MigrationScopeLevelSchema,
    targetIdentifier: NonEmptyStringSchema,
    operations: z.array(PlannedOperationSchema),
    warnings: z.array(z.string().max(2048)),
  })
  .strict();

/** Immutable, reviewed plan for all mutations in a migration scope. */
export const MigrationPlanSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    planId: NonEmptyStringSchema,
    createdAt: TimestampSchema,
    scopeName: NonEmptyStringSchema,
    summary: PlanSummarySchema,
    modules: z.array(ModulePlanSchema),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const operationIds = new Set<string>();
    const moduleTargets = new Set<string>();
    const observed = { create: 0, update: 0, noop: 0, skip: 0, warn: 0 };

    for (const [moduleIndex, module] of plan.modules.entries()) {
      const moduleTarget = `${module.moduleId}/${module.scopeLevel}/${module.targetIdentifier}`;
      if (moduleTargets.has(moduleTarget)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Each module, scope level, and target combination must be unique.',
          path: ['modules', moduleIndex],
        });
      }
      moduleTargets.add(moduleTarget);
      for (const [operationIndex, operation] of module.operations.entries()) {
        if (operationIds.has(operation.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Planned operation IDs must be unique across the plan.',
            path: ['modules', moduleIndex, 'operations', operationIndex, 'id'],
          });
        }
        operationIds.add(operation.id);
        observed[operation.operation]++;
      }
    }

    for (const operation of Object.keys(observed) as Array<
      keyof typeof observed
    >) {
      if (plan.summary[operation] !== observed[operation]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Plan summary does not match ${operation} operations.`,
          path: ['summary', operation],
        });
      }
    }
  });

export type PlannedOperation = z.infer<typeof PlannedOperationSchema>;
export type ModulePlan = z.infer<typeof ModulePlanSchema>;
export type MigrationPlan = z.infer<typeof MigrationPlanSchema>;

export function validateMigrationPlan(input: unknown) {
  return MigrationPlanSchema.safeParse(input);
}
