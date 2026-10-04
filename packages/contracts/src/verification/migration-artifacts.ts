import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  NonEmptyStringSchema,
} from '../migration-common.js';

const CustomPropertyValueSchema = z.union([
  z.string().max(2048),
  z.boolean(),
  z.array(z.string().max(2048)),
]);

export const CustomPropertyMappingSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    sourceOrg: NonEmptyStringSchema,
    targetOrg: NonEmptyStringSchema,
    properties: z.array(
      z
        .object({
          sourceName: NonEmptyStringSchema,
          targetName: NonEmptyStringSchema,
          valueType: z.enum([
            'string',
            'single_select',
            'multi_select',
            'true_false',
          ]),
          sourceValue: CustomPropertyValueSchema.optional(),
          targetValue: CustomPropertyValueSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((mapping, ctx) => {
    const sourceNames = new Set<string>();
    const targetNames = new Set<string>();
    for (const [index, property] of mapping.properties.entries()) {
      if (sourceNames.has(property.sourceName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A source custom property can map only once.',
          path: ['properties', index, 'sourceName'],
        });
      }
      if (targetNames.has(property.targetName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A target custom property can map only once.',
          path: ['properties', index, 'targetName'],
        });
      }
      sourceNames.add(property.sourceName);
      targetNames.add(property.targetName);
    }
  });

const MannequinEntrySchema = z
  .object({
    mannequinUser: NonEmptyStringSchema,
    mannequinId: NonEmptyStringSchema,
    targetUser: NonEmptyStringSchema.nullable(),
    status: z.enum(['completed', 'invited', 'unmapped']),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.status === 'unmapped' && entry.targetUser !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unmapped mannequins cannot have a target user.',
        path: ['targetUser'],
      });
    }
    if (entry.status !== 'unmapped' && entry.targetUser === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mapped mannequins require a target user.',
        path: ['targetUser'],
      });
    }
  });

export const MannequinReclamationPlanSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    targetOrg: NonEmptyStringSchema,
    identityStrategy: z.enum(['emu-saml', 'manual', 'pass-through']),
    skipInvitation: z.boolean(),
    entries: z.array(MannequinEntrySchema),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.identityStrategy === 'emu-saml' && !plan.skipInvitation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'EMU SAML mannequin reclamation requires skipInvitation.',
        path: ['skipInvitation'],
      });
    }
    const mannequinIds = new Set<string>();
    for (const [index, entry] of plan.entries.entries()) {
      if (mannequinIds.has(entry.mannequinId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each mannequin can appear only once in a reclamation plan.',
          path: ['entries', index, 'mannequinId'],
        });
      }
      mannequinIds.add(entry.mannequinId);
    }
  });

export type CustomPropertyMapping = z.infer<typeof CustomPropertyMappingSchema>;
export type MannequinReclamationPlan = z.infer<
  typeof MannequinReclamationPlanSchema
>;

export function validateCustomPropertyMapping(input: unknown) {
  return CustomPropertyMappingSchema.safeParse(input);
}

export function validateMannequinReclamationPlan(input: unknown) {
  return MannequinReclamationPlanSchema.safeParse(input);
}
