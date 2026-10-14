import { z } from 'zod';

export const SEEDER_SCHEMA_VERSION = '1.0.0' as const;

export const SeedScopeLevelSchema = z.enum([
  'both',
  'organization',
  'repository',
]);
export type SeedScopeLevel = z.infer<typeof SeedScopeLevelSchema>;

export const SeedItemCategorySchema = z.enum([
  'core-governance',
  'actions-and-security',
  'collaboration',
  'artifacts-and-code',
]);
export type SeedItemCategory = z.infer<typeof SeedItemCategorySchema>;

export const SeedExecutionActionSchema = z.enum([
  'created',
  'updated',
  'skipped',
  'deleted',
  'dry-run-create',
  'dry-run-update',
  'dry-run-skip',
  'failed',
]);
export type SeedExecutionAction = z.infer<typeof SeedExecutionActionSchema>;

export const SeedDispatchRequestSchema = z
  .object({
    organization: z
      .string()
      .trim()
      .min(1, 'Organization name is required')
      .max(100)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Organization must contain only alphanumeric characters, dashes, or underscores',
      ),
    repository: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(
        /^[a-zA-Z0-9_.-]+$/,
        'Repository must contain only alphanumeric characters, periods, dashes, or underscores',
      )
      .optional(),
    scopeLevel: SeedScopeLevelSchema.default('both'),
    contentType: z.string().trim().default('all'),
    patSecretName: z.string().trim().default('GHEC_SOURCE_TOKEN'),
    dryRun: z.boolean().default(false),
    cleanupExisting: z.boolean().default(false),
    resourcePrefix: z.string().trim().default('demo-'),
  })
  .strict();
export type SeedDispatchRequest = z.infer<typeof SeedDispatchRequestSchema>;

export const SeedItemDefinitionSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    scopeLevel: z.enum(['organization', 'repository']),
    category: SeedItemCategorySchema,
    dependencies: z.array(z.string().trim().min(1)),
    enterpriseOnly: z.boolean(),
    description: z.string().trim().optional(),
  })
  .strict();
export type SeedItemDefinition = z.infer<typeof SeedItemDefinitionSchema>;

export const SeedManifestSchema = z
  .object({
    schemaVersion: z.literal(SEEDER_SCHEMA_VERSION),
    items: z.array(SeedItemDefinitionSchema),
  })
  .strict();
export type SeedManifest = z.infer<typeof SeedManifestSchema>;

export const SeedItemExecutionResultSchema = z
  .object({
    itemId: z.string().trim().min(1),
    itemName: z.string().trim().min(1),
    scope: z.enum(['organization', 'repository']),
    action: SeedExecutionActionSchema,
    durationMs: z.number().nonnegative(),
    resourceIdentifier: z.string().trim().min(1),
    details: z.string().nullable().optional(),
    warning: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
  })
  .strict();
export type SeedItemExecutionResult = z.infer<
  typeof SeedItemExecutionResultSchema
>;

export const ExecutionCountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();
export type ExecutionCounts = z.infer<typeof ExecutionCountsSchema>;

export const SeedExecutionSummarySchema = z
  .object({
    schemaVersion: z.literal(SEEDER_SCHEMA_VERSION),
    runId: z.string().trim().min(1),
    organization: z.string().trim().min(1),
    repository: z.string().trim().nullable().optional(),
    scopeLevel: SeedScopeLevelSchema,
    contentType: z.string().trim().min(1),
    dryRun: z.boolean(),
    cleanupExisting: z.boolean(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    totalDurationMs: z.number().nonnegative(),
    counts: ExecutionCountsSchema,
    items: z.array(SeedItemExecutionResultSchema),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  })
  .strict();
export type SeedExecutionSummary = z.infer<typeof SeedExecutionSummarySchema>;

export function validateSeedDispatchRequest(raw: unknown): SeedDispatchRequest {
  return SeedDispatchRequestSchema.parse(raw);
}

export function validateSeedManifest(raw: unknown): SeedManifest {
  return SeedManifestSchema.parse(raw);
}

export function validateSeedExecutionSummary(
  raw: unknown,
): SeedExecutionSummary {
  return SeedExecutionSummarySchema.parse(raw);
}
