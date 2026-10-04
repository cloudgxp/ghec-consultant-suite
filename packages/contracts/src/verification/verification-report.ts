import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  MigrationModuleIdSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampSchema,
} from '../migration-common.js';

export const VerificationDiscrepancySchema = z
  .object({
    resourceName: NonEmptyStringSchema,
    expected: z.unknown(),
    actual: z.unknown(),
    message: z.string().trim().min(1).max(2048),
  })
  .strict();

export const ModuleVerificationResultSchema = z
  .object({
    moduleId: MigrationModuleIdSchema,
    verified: z.boolean(),
    discrepancies: z.array(VerificationDiscrepancySchema),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.verified && result.discrepancies.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Verified modules cannot contain discrepancies.',
        path: ['discrepancies'],
      });
    }
    if (!result.verified && result.discrepancies.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unverified modules require at least one discrepancy.',
        path: ['discrepancies'],
      });
    }
  });

const VerificationSummarySchema = z
  .object({
    verifiedModuleCount: NonNegativeIntegerSchema,
    unverifiedModuleCount: NonNegativeIntegerSchema,
    discrepancyCount: NonNegativeIntegerSchema,
  })
  .strict();

/** An auditable post-migration assertion of target-state compliance. */
export const VerificationReportSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    reportId: NonEmptyStringSchema,
    verifiedAt: TimestampSchema,
    scopeName: NonEmptyStringSchema,
    sourceOrg: NonEmptyStringSchema,
    targetOrg: NonEmptyStringSchema,
    modules: z.array(ModuleVerificationResultSchema),
    summary: VerificationSummarySchema,
  })
  .strict()
  .superRefine((report, ctx) => {
    const moduleIds = new Set<string>();
    let verifiedModuleCount = 0;
    let discrepancyCount = 0;
    for (const [index, module] of report.modules.entries()) {
      if (moduleIds.has(module.moduleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Verification results must contain each module only once.',
          path: ['modules', index, 'moduleId'],
        });
      }
      moduleIds.add(module.moduleId);
      if (module.verified) verifiedModuleCount++;
      discrepancyCount += module.discrepancies.length;
    }
    const unverifiedModuleCount = report.modules.length - verifiedModuleCount;
    if (report.summary.verifiedModuleCount !== verifiedModuleCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Verification summary does not match verified module results.',
        path: ['summary', 'verifiedModuleCount'],
      });
    }
    if (report.summary.unverifiedModuleCount !== unverifiedModuleCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Verification summary does not match unverified module results.',
        path: ['summary', 'unverifiedModuleCount'],
      });
    }
    if (report.summary.discrepancyCount !== discrepancyCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Verification summary does not match observed discrepancies.',
        path: ['summary', 'discrepancyCount'],
      });
    }
  });

export type VerificationDiscrepancy = z.infer<
  typeof VerificationDiscrepancySchema
>;
export type ModuleVerificationResult = z.infer<
  typeof ModuleVerificationResultSchema
>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export function validateVerificationReport(input: unknown) {
  return VerificationReportSchema.safeParse(input);
}
