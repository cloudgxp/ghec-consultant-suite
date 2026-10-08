import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  MigrationModuleIdSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampSchema,
} from '../migration-common.js';

export const OperationExecutionResultSchema = z
  .object({
    operationId: NonEmptyStringSchema,
    status: z.enum(['succeeded', 'failed', 'skipped']),
    httpStatus: z.number().int().min(100).max(599).optional(),
    error: z.string().trim().min(1).max(2048).optional(),
    completedAt: TimestampSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.status === 'failed' && !result.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Failed operations require an error message.',
        path: ['error'],
      });
    }
    if (result.status !== 'failed' && result.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only failed operations can include an error message.',
        path: ['error'],
      });
    }
  });

export const ModuleExecutionResultSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    moduleId: MigrationModuleIdSchema,
    status: z.enum(['complete', 'partial', 'failed', 'skipped']),
    results: z.array(OperationExecutionResultSchema),
    durationMs: NonNegativeIntegerSchema,
    metadataState: z
      .enum(['complete', 'partial', 'failed', 'skipped'])
      .optional(),
    failedMetadataCategories: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((result, ctx) => {
    const operationIds = new Set<string>();
    const failed = result.results.some(
      (operation) => operation.status === 'failed',
    );
    for (const [index, operation] of result.results.entries()) {
      if (operationIds.has(operation.operationId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Operation execution result IDs must be unique.',
          path: ['results', index, 'operationId'],
        });
      }
      operationIds.add(operation.operationId);
    }
    if (result.status === 'complete' && failed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A complete module execution cannot contain failed operations.',
        path: ['status'],
      });
    }
    if (result.status === 'failed' && !failed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A failed module execution requires a failed operation.',
        path: ['status'],
      });
    }
  });

export type OperationExecutionResult = z.infer<
  typeof OperationExecutionResultSchema
>;
export type ModuleExecutionResult = z.infer<typeof ModuleExecutionResultSchema>;

export function validateModuleExecutionResult(input: unknown) {
  return ModuleExecutionResultSchema.safeParse(input);
}
