import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampSchema,
} from '../migration-common.js';

export const RepositoryAssessmentSchema = z
  .object({
    repo: NonEmptyStringSchema,
    gitSizeBytes: NonNegativeIntegerSchema,
    largestCommitBytes: NonNegativeIntegerSchema,
    largestBlobBytes: NonNegativeIntegerSchema,
    longestRefLength: NonNegativeIntegerSchema,
    lfsObjectCount: NonNegativeIntegerSchema,
    lfsTotalBytes: NonNegativeIntegerSchema,
    releaseCount: NonNegativeIntegerSchema,
    releaseTotalAssetBytes: NonNegativeIntegerSchema,
    status: z.enum([
      'ready',
      'ready-with-follow-up',
      'requires-special-strategy',
      'blocked',
    ]),
    blockers: z.array(z.string().trim().min(1).max(2048)),
  })
  .strict()
  .superRefine((assessment, ctx) => {
    if (assessment.status === 'ready' && assessment.blockers.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ready repositories cannot have blockers.',
        path: ['blockers'],
      });
    }
    if (assessment.status === 'blocked' && assessment.blockers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Blocked repositories require at least one blocker.',
        path: ['blockers'],
      });
    }
  });

export const DestinationAssessmentSchema = z
  .object({
    rulesetBypassConfigured: z.boolean(),
    ipAllowListReachable: z.boolean(),
    ghasEnabled: z.boolean(),
    nameConflicts: z.array(NonEmptyStringSchema),
  })
  .strict();

export const MigrationPreflightReportSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    reportId: NonEmptyStringSchema,
    evaluatedAt: TimestampSchema,
    sourceOrg: NonEmptyStringSchema,
    targetOrg: NonEmptyStringSchema,
    repositoryAssessments: z.array(RepositoryAssessmentSchema),
    destinationAssessments: z.array(DestinationAssessmentSchema),
  })
  .strict()
  .superRefine((report, ctx) => {
    const repositoryNames = new Set<string>();
    for (const [index, assessment] of report.repositoryAssessments.entries()) {
      if (repositoryNames.has(assessment.repo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Each repository can appear only once in a preflight report.',
          path: ['repositoryAssessments', index, 'repo'],
        });
      }
      repositoryNames.add(assessment.repo);
    }
  });

export type RepositoryAssessment = z.infer<typeof RepositoryAssessmentSchema>;
export type DestinationAssessment = z.infer<typeof DestinationAssessmentSchema>;
export type MigrationPreflightReport = z.infer<
  typeof MigrationPreflightReportSchema
>;

export function validatePreflightReport(input: unknown) {
  return MigrationPreflightReportSchema.safeParse(input);
}
