import { z } from 'zod';
import { NonEmptyStringSchema } from '../migration-common.js';

export const ResourceCategorySchema = z.enum([
  'organization',
  'repository',
  'actions',
  'security',
  'identity',
]);

export const MigrationMechanismSchema = z.enum([
  'gei_native',
  'rest_rehydration',
  'graphql_mutation',
  'manual_advisory',
]);

export const ImplementationStatusSchema = z.enum([
  'implemented',
  'partial',
  'missing',
]);

export const SecretHandlingStrategySchema = z.enum([
  'sealed_box_blank',
  'vault_hook',
  'none',
  'ephemeral_runtime',
]);

export const EmuConstraintTypeSchema = z.enum([
  'scim_identity',
  'saml_sso',
  'mannequin_mapping',
  'visibility_policy',
  'outside_collaborator',
  'runner_network',
]);

export const EmuGovernanceConstraintSchema = z
  .object({
    type: EmuConstraintTypeSchema,
    description: NonEmptyStringSchema,
    mitigation: NonEmptyStringSchema,
  })
  .strict();

export const CapabilityGapEntrySchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        'Resource ID must be lowercase kebab-case.',
      ),
    name: NonEmptyStringSchema,
    category: ResourceCategorySchema,
    docsRef: z.string().trim().min(1),
    mechanism: MigrationMechanismSchema,
    status: ImplementationStatusSchema,
    existingModuleId: z.string().trim().min(1).optional(),
    proposedModuleId: z.string().trim().min(1).optional(),
    secretHandling: SecretHandlingStrategySchema,
    emuConstraints: z.array(EmuGovernanceConstraintSchema),
    notes: z.string().trim().min(1),
  })
  .strict();
