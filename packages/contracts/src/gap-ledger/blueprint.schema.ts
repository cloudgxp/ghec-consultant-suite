import { z } from 'zod';
import { NonEmptyStringSchema } from '../migration-common.js';

export const DiscrepancySeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const ModuleDecompositionBlueprintSchema = z
  .object({
    moduleId: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        'Module ID must be lowercase kebab-case.',
      ),
    targetResource: NonEmptyStringSchema,
    dependencies: z.array(z.string().trim().min(1)),
    discoverStage: z
      .object({
        clientMethod: NonEmptyStringSchema,
        payloadType: NonEmptyStringSchema,
        queryPattern: NonEmptyStringSchema,
      })
      .strict(),
    planStage: z
      .object({
        diffStrategy: NonEmptyStringSchema,
        actionTypes: z.array(NonEmptyStringSchema).min(1),
        idempotencyKey: NonEmptyStringSchema,
      })
      .strict(),
    applyStage: z
      .object({
        clientMethod: NonEmptyStringSchema,
        dryRunSupported: z.literal(true),
        rateLimitBucket: NonEmptyStringSchema,
        mutationEndpoint: NonEmptyStringSchema,
      })
      .strict(),
    verifyStage: z
      .object({
        verificationQuery: NonEmptyStringSchema,
        comparisonKeys: z.array(NonEmptyStringSchema).min(1),
        discrepancySeverity: DiscrepancySeveritySchema,
      })
      .strict(),
  })
  .strict();
