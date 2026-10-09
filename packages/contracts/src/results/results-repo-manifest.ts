import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampSchema,
} from '../migration-common.js';

export const OrgModuleResultSummarySchema = z
  .object({
    status: z.enum(['complete', 'partial', 'failed', 'skipped']),
    totalOperations: NonNegativeIntegerSchema,
    succeededOperations: NonNegativeIntegerSchema,
    failedOperations: NonNegativeIntegerSchema,
    skippedOperations: NonNegativeIntegerSchema.default(0),
    durationMs: NonNegativeIntegerSchema.optional(),
    error: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export const MigrationResultsSummarySchema = z
  .object({
    totalRepositories: NonNegativeIntegerSchema,
    succeededCount: NonNegativeIntegerSchema,
    failedCount: NonNegativeIntegerSchema,
    successRatePercent: z.number().min(0).max(100),
    durationMs: NonNegativeIntegerSchema,
    orgModulesSummary: z.record(z.string(), OrgModuleResultSummarySchema),
  })
  .strict();

export const RepositoryMigrationRecordSchema = z
  .object({
    sourceRepo: NonEmptyStringSchema,
    targetRepo: NonEmptyStringSchema,
    status: z.enum(['succeeded', 'failed']),
    relativeFilePath: NonEmptyStringSchema,
    durationMs: NonNegativeIntegerSchema,
    stagesRun: z.array(NonEmptyStringSchema),
    verified: z.boolean(),
    discrepancyCount: NonNegativeIntegerSchema,
    failureReason: z.string().trim().min(1).max(2048).optional(),
    failedStage: z.string().trim().min(1).max(128).optional(),
    failedMetadataCategories: z.array(z.string().trim().min(1)).optional(),
    warnings: z.array(z.string().trim()),
    remediationCommands: z.array(z.string().trim()).optional(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.status === 'failed') {
      if (!record.failureReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failed repository records must provide a failureReason.',
          path: ['failureReason'],
        });
      }
      if (
        !record.relativeFilePath.startsWith('failure/') ||
        !record.relativeFilePath.endsWith('.md')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Failed repository records must have a relativeFilePath starting with "failure/" and ending with ".md".',
          path: ['relativeFilePath'],
        });
      }
    } else {
      if (record.failureReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Succeeded repository records cannot include a failureReason.',
          path: ['failureReason'],
        });
      }
      if (record.failedStage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Succeeded repository records cannot include a failedStage.',
          path: ['failedStage'],
        });
      }
      if (
        !record.relativeFilePath.startsWith('success/') ||
        !record.relativeFilePath.endsWith('.md')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Succeeded repository records must have a relativeFilePath starting with "success/" and ending with ".md".',
          path: ['relativeFilePath'],
        });
      }
      if (record.discrepancyCount > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Succeeded repository records must have 0 discrepancies.',
          path: ['discrepancyCount'],
        });
      }
      if (!record.verified) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Succeeded repository records must be verified (verified: true).',
          path: ['verified'],
        });
      }
    }
  });

export const MigrationResultsManifestSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    runId: NonEmptyStringSchema,
    generatedAt: TimestampSchema,
    sourceOrg: NonEmptyStringSchema,
    targetOrg: NonEmptyStringSchema,
    targetResultsRepo: NonEmptyStringSchema.default('gei-migration-results'),
    executionMode: z.enum(['dry-run', 'live']),
    summary: MigrationResultsSummarySchema,
    repositories: z.array(RepositoryMigrationRecordSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.summary.totalRepositories !== manifest.repositories.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Summary totalRepositories must equal the number of repository records.',
        path: ['summary', 'totalRepositories'],
      });
    }

    const actualSucceeded = manifest.repositories.filter(
      (r) => r.status === 'succeeded',
    ).length;
    const actualFailed = manifest.repositories.filter(
      (r) => r.status === 'failed',
    ).length;

    if (manifest.summary.succeededCount !== actualSucceeded) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Summary succeededCount (${manifest.summary.succeededCount}) does not match repository records count (${actualSucceeded}).`,
        path: ['summary', 'succeededCount'],
      });
    }

    if (manifest.summary.failedCount !== actualFailed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Summary failedCount (${manifest.summary.failedCount}) does not match repository records count (${actualFailed}).`,
        path: ['summary', 'failedCount'],
      });
    }

    if (
      manifest.summary.succeededCount + manifest.summary.failedCount !==
      manifest.summary.totalRepositories
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Summary succeededCount + failedCount must equal totalRepositories.',
        path: ['summary', 'totalRepositories'],
      });
    }

    const expectedRate =
      manifest.summary.totalRepositories === 0
        ? 100
        : Number(
            (
              (actualSucceeded / manifest.summary.totalRepositories) *
              100
            ).toFixed(2),
          );

    if (Math.abs(manifest.summary.successRatePercent - expectedRate) > 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Summary successRatePercent (${manifest.summary.successRatePercent}%) is inconsistent with counts (${expectedRate}% expected).`,
        path: ['summary', 'successRatePercent'],
      });
    }

    const targetRepos = new Set<string>();
    for (const [index, repo] of manifest.repositories.entries()) {
      const targetLower = repo.targetRepo.toLowerCase();
      if (targetRepos.has(targetLower)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate target repository "${repo.targetRepo}" found in repository records.`,
          path: ['repositories', index, 'targetRepo'],
        });
      }
      targetRepos.add(targetLower);
    }
  });

export type OrgModuleResultSummary = z.infer<
  typeof OrgModuleResultSummarySchema
>;
export type MigrationResultsSummary = z.infer<
  typeof MigrationResultsSummarySchema
>;
export type RepositoryMigrationRecord = z.infer<
  typeof RepositoryMigrationRecordSchema
>;
export type MigrationResultsManifest = z.infer<
  typeof MigrationResultsManifestSchema
>;

export function validateMigrationResultsManifest(input: unknown) {
  return MigrationResultsManifestSchema.safeParse(input);
}
