import { z } from 'zod';

export const ORCHESTRATOR_SCHEMA_VERSION = '1.0.0' as const;

// --- Slicer Matrix Contract ---

export const SlicerTierSchema = z.enum([
  'standard',
  'large-releases',
  'git-lfs',
  'massive-mirror',
]);
export type SlicerTier = z.infer<typeof SlicerTierSchema>;

export const SlicerCohortItemSchema = z
  .object({
    cohortId: z.string().trim().min(1),
    runnerLabels: z.array(z.string().trim().min(1)).min(1),
    repositories: z.array(z.string().trim().min(1)),
    tier: SlicerTierSchema,
    useGei: z.boolean().optional().default(true),
    skipReleases: z.boolean().optional().default(false),
    useReleaseFallback: z.boolean().optional().default(false),
    useLfsStreamer: z.boolean().optional().default(false),
    useMirrorPush: z.boolean().optional().default(false),
    requiresHeadroomCheck: z.boolean().optional().default(false),
    estimatedScratchBytes: z.number().nonnegative().optional().default(0),
  })
  .strict();
export type SlicerCohortItem = z.infer<typeof SlicerCohortItemSchema>;

export const SlicerMatrixSchema = z
  .object({
    schemaVersion: z.literal(ORCHESTRATOR_SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }).optional(),
    cohortCount: z.number().int().nonnegative(),
    matrix: z
      .object({
        include: z.array(SlicerCohortItemSchema),
      })
      .strict(),
  })
  .strict();
export type SlicerMatrix = z.infer<typeof SlicerMatrixSchema>;

// --- Checkpoint State Contract ---

export const CheckpointStageSchema = z.enum([
  'discover',
  'plan',
  'apply',
  'verify',
]);
export type CheckpointStage = z.infer<typeof CheckpointStageSchema>;

export const CheckpointStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
]);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export const CheckpointStateSchema = z
  .object({
    schemaVersion: z.literal(ORCHESTRATOR_SCHEMA_VERSION),
    cohortId: z.string().trim().min(1),
    moduleId: z.string().trim().min(1),
    stage: CheckpointStageSchema,
    status: CheckpointStatusSchema,
    updatedAt: z.string().datetime({ offset: true }),
    resumptionToken: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    metrics: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type CheckpointState = z.infer<typeof CheckpointStateSchema>;

// --- Remediation Execution Contract ---

export const RemediationActionExecutionStatusSchema = z.enum([
  'succeeded',
  'failed',
  'skipped',
]);
export type RemediationActionExecutionStatus = z.infer<
  typeof RemediationActionExecutionStatusSchema
>;

export const RemediationActionResultSchema = z
  .object({
    actionId: z.string().trim().min(1),
    moduleId: z.string().trim().min(1),
    resourceName: z.string().trim().min(1),
    status: RemediationActionExecutionStatusSchema,
    durationMs: z.number().nonnegative().optional(),
    error: z.string().nullable().optional(),
  })
  .strict();
export type RemediationActionResult = z.infer<
  typeof RemediationActionResultSchema
>;

export const RemediationUnresolvedItemSchema = z
  .object({
    discrepancyId: z.string().trim().min(1),
    moduleId: z.string().trim().min(1),
    resourceIdentifier: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict();
export type RemediationUnresolvedItem = z.infer<
  typeof RemediationUnresolvedItemSchema
>;

export const RemediationExecutionSchema = z
  .object({
    schemaVersion: z.literal(ORCHESTRATOR_SCHEMA_VERSION),
    planId: z.string().trim().min(1),
    round: z.number().int().min(1),
    executedAt: z.string().datetime({ offset: true }),
    dryRun: z.boolean().optional().default(false),
    totalActions: z.number().int().nonnegative(),
    successfulActions: z.number().int().nonnegative(),
    failedActions: z.number().int().nonnegative(),
    actionResults: z
      .array(RemediationActionResultSchema)
      .optional()
      .default([]),
    preRemediationDiscrepancies: z.number().int().nonnegative(),
    postRemediationDiscrepancies: z.number().int().nonnegative(),
    resolvedDiscrepancies: z.number().int().nonnegative(),
    remainingDiscrepancies: z.number().int().nonnegative(),
    unresolvedItems: z
      .array(RemediationUnresolvedItemSchema)
      .optional()
      .default([]),
  })
  .strict();
export type RemediationExecution = z.infer<typeof RemediationExecutionSchema>;

// --- Teardown Manifest Contract ---

export const TeardownTargetTypeSchema = z.enum([
  'repository',
  'team',
  'custom-role',
  'ruleset',
]);
export type TeardownTargetType = z.infer<typeof TeardownTargetTypeSchema>;

export const TeardownTargetStatusSchema = z.enum([
  'pending',
  'deleted',
  'skipped',
  'failed',
]);
export type TeardownTargetStatus = z.infer<typeof TeardownTargetStatusSchema>;

export const TeardownTargetSchema = z
  .object({
    type: TeardownTargetTypeSchema,
    identifier: z.string().trim().min(1),
    status: TeardownTargetStatusSchema,
    error: z.string().nullable().optional(),
  })
  .strict();
export type TeardownTarget = z.infer<typeof TeardownTargetSchema>;

export const TeardownManifestSchema = z
  .object({
    schemaVersion: z.literal(ORCHESTRATOR_SCHEMA_VERSION),
    targetOrg: z.string().trim().min(1),
    prefixFilter: z
      .string()
      .trim()
      .min(3, 'prefixFilter must be at least 3 characters long'),
    dryRun: z.boolean(),
    discoveredAt: z.string().datetime({ offset: true }),
    totalDiscovered: z.number().int().nonnegative(),
    totalPurged: z.number().int().nonnegative(),
    totalRetained: z.number().int().nonnegative(),
    targets: z.array(TeardownTargetSchema).optional().default([]),
  })
  .strict();
export type TeardownManifest = z.infer<typeof TeardownManifestSchema>;

// --- Validator Helpers ---

export function validateSlicerMatrix(raw: unknown): SlicerMatrix {
  return SlicerMatrixSchema.parse(raw);
}

export function validateCheckpointState(raw: unknown): CheckpointState {
  return CheckpointStateSchema.parse(raw);
}

export function validateRemediationExecution(
  raw: unknown,
): RemediationExecution {
  return RemediationExecutionSchema.parse(raw);
}

export function validateTeardownManifest(raw: unknown): TeardownManifest {
  return TeardownManifestSchema.parse(raw);
}
