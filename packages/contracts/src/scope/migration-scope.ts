import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  MigrationModuleIdSchema,
  NonEmptyStringSchema,
} from '../migration-common.js';

const OrganizationMappingSchema = z
  .object({
    source: NonEmptyStringSchema,
    target: NonEmptyStringSchema,
    modules: z.array(MigrationModuleIdSchema).optional(),
  })
  .strict();

const RepositoryMappingSchema = z
  .object({
    sourceOrg: NonEmptyStringSchema,
    sourceRepo: NonEmptyStringSchema,
    targetOrg: NonEmptyStringSchema,
    targetRepo: NonEmptyStringSchema,
    useGei: z.boolean(),
    targetRepoVisibility: z.enum(['private', 'internal', 'public']).optional(),
    skipReleases: z.boolean().optional(),
    lfsStrategy: z.enum(['dual-remote-stream', 'skip']).optional(),
    modules: z.array(MigrationModuleIdSchema).optional(),
  })
  .strict();

const IdentityMappingSchema = z
  .object({
    strategy: z.enum(['emu-saml', 'manual', 'pass-through']),
    suffix: z.string().max(256).optional(),
    mappings: z.record(NonEmptyStringSchema).optional(),
  })
  .strict();

/**
 * A declarative source-to-target boundary. Repository mappings must use the
 * organization pair declared in this scope when an organization mapping exists.
 */
export const MigrationScopeSchema = z
  .object({
    version: z.literal(MIGRATION_SCHEMA_VERSION),
    name: NonEmptyStringSchema,
    enterprise: z
      .object({
        sourceSlug: NonEmptyStringSchema,
        targetSlug: NonEmptyStringSchema,
      })
      .strict()
      .optional(),
    organizations: z.array(OrganizationMappingSchema),
    repositories: z.array(RepositoryMappingSchema),
    identityMapping: IdentityMappingSchema.optional(),
  })
  .strict()
  .superRefine((scope, ctx) => {
    const organizationPairs = new Map<string, string>();
    const targetOrganizations = new Set<string>();
    const sourceRepositories = new Set<string>();
    const targetRepositories = new Set<string>();

    for (const [index, organization] of scope.organizations.entries()) {
      const priorTarget = organizationPairs.get(organization.source);
      if (priorTarget && priorTarget !== organization.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A source organization can map to only one target organization.',
          path: ['organizations', index, 'source'],
        });
      }
      if (targetOrganizations.has(organization.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A target organization can appear in only one organization mapping.',
          path: ['organizations', index, 'target'],
        });
      }
      organizationPairs.set(organization.source, organization.target);
      targetOrganizations.add(organization.target);
    }

    for (const [index, repository] of scope.repositories.entries()) {
      const sourceKey = `${repository.sourceOrg}/${repository.sourceRepo}`;
      const targetKey = `${repository.targetOrg}/${repository.targetRepo}`;
      if (sourceRepositories.has(sourceKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A source repository can appear only once.',
          path: ['repositories', index],
        });
      }
      if (targetRepositories.has(targetKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A target repository can appear only once.',
          path: ['repositories', index],
        });
      }
      sourceRepositories.add(sourceKey);
      targetRepositories.add(targetKey);

      const mappedTarget = organizationPairs.get(repository.sourceOrg);
      if (mappedTarget && mappedTarget !== repository.targetOrg) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Repository target organization must match its source organization mapping.',
          path: ['repositories', index, 'targetOrg'],
        });
      }
    }
  });

export type MigrationScope = z.infer<typeof MigrationScopeSchema>;

export function validateMigrationScope(input: unknown) {
  return MigrationScopeSchema.safeParse(input);
}
