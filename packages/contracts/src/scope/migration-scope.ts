import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  MigrationModuleIdSchema,
  NonEmptyStringSchema,
} from '../migration-common.js';

export const TargetTenantTypeSchema = z.enum(['ghec', 'emu']);

export type TargetTenantType = z.infer<typeof TargetTenantTypeSchema>;

export const OrgItemsModeSchema = z.enum(['all', 'associated-only', 'none']);

export type OrgItemsMode = z.infer<typeof OrgItemsModeSchema>;

const OrganizationMappingSchema = z
  .object({
    source: NonEmptyStringSchema,
    target: NonEmptyStringSchema,
    targetType: TargetTenantTypeSchema.optional(),
    orgItemsMode: OrgItemsModeSchema.optional(),
    sandboxRehearsal: z.boolean().optional(),
    modules: z.array(MigrationModuleIdSchema).optional(),
  })
  .strict();

export const GitTransferStrategySchema = z.enum(['auto', 'gei', 'mirror-push']);

export type GitTransferStrategy = z.infer<typeof GitTransferStrategySchema>;

export const MirrorPushModeSchema = z.enum(['fast-snapshot', 'full-history']);

export type MirrorPushMode = z.infer<typeof MirrorPushModeSchema>;

export const RepositoryOptionsSchema = z
  .object({
    skipReleases: z.boolean().optional(),
    skipLfs: z.boolean().optional(),
    skipDiskCheck: z.boolean().optional(),
    customTimeout: z.number().int().positive().optional(),
    timeoutSeconds: z.number().int().positive().optional(),
    lfsStrategy: z.enum(['dual-remote-stream', 'skip']).optional(),
    gitTransferStrategy: GitTransferStrategySchema.optional(),
    mirrorPushMode: MirrorPushModeSchema.optional(),
    targetRepoVisibility: z.enum(['private', 'internal', 'public']).optional(),
    archived: z.boolean().optional(),
    sandboxRehearsal: z.boolean().optional(),
  })
  .strict();

export type RepositoryOptions = z.infer<typeof RepositoryOptionsSchema>;

export const RepositoryMappingSchema = z
  .object({
    sourceOrg: NonEmptyStringSchema,
    sourceRepo: NonEmptyStringSchema,
    targetOrg: NonEmptyStringSchema,
    targetRepo: NonEmptyStringSchema,
    useGei: z.boolean(),
    archived: z.boolean().optional(),
    targetRepoVisibility: z.enum(['private', 'internal', 'public']).optional(),
    skipReleases: z.boolean().optional(),
    skipDiskCheck: z.boolean().optional(),
    lfsStrategy: z.enum(['dual-remote-stream', 'skip']).optional(),
    gitTransferStrategy: GitTransferStrategySchema.optional(),
    mirrorPushMode: MirrorPushModeSchema.optional(),
    sandboxRehearsal: z.boolean().optional(),
    modules: z.array(MigrationModuleIdSchema).optional(),
    options: RepositoryOptionsSchema.optional(),
  })
  .strict();

export const SkippedArchivedRepositorySchema = z
  .object({
    sourceOrg: NonEmptyStringSchema,
    sourceRepo: NonEmptyStringSchema,
    visibility: z.enum(['public', 'private', 'internal', 'unknown']).optional(),
    isFork: z.boolean().optional(),
    reason: z.string().max(512).optional(),
  })
  .strict();

export type SkippedArchivedRepository = z.infer<
  typeof SkippedArchivedRepositorySchema
>;

const IdentityMappingSchema = z
  .object({
    strategy: z.enum(['emu-saml', 'manual', 'pass-through']),
    suffix: z.string().max(256).optional(),
    mappings: z.record(z.string(), NonEmptyStringSchema).optional(),
  })
  .strict();

export const TeamManagementSchema = z
  .object({
    defaultMode: z.enum(['idp', 'native', 'hybrid']).optional(),
    nonIdpTeams: z.array(NonEmptyStringSchema).optional(),
    idpTeams: z.array(NonEmptyStringSchema).optional(),
    migrateMembers: z.boolean().optional(),
  })
  .strict();

export type TeamManagement = z.infer<typeof TeamManagementSchema>;

/**
 * A declarative source-to-target boundary. Repository mappings must use the
 * organization pair declared in this scope when an organization mapping exists.
 */
export const MigrationScopeSchema = z
  .object({
    version: z.literal(MIGRATION_SCHEMA_VERSION),
    name: NonEmptyStringSchema,
    targetType: TargetTenantTypeSchema.optional(),
    orgItemsMode: OrgItemsModeSchema.optional(),
    mirrorPushMode: MirrorPushModeSchema.optional(),
    sandboxRehearsal: z.boolean().optional(),
    enterprise: z
      .object({
        sourceSlug: NonEmptyStringSchema,
        targetSlug: NonEmptyStringSchema,
      })
      .strict()
      .optional(),
    organizations: z.array(OrganizationMappingSchema),
    repositories: z.array(RepositoryMappingSchema),
    skippedArchivedRepositories: z
      .array(SkippedArchivedRepositorySchema)
      .optional(),
    repositoryOptions: z
      .record(NonEmptyStringSchema, RepositoryOptionsSchema)
      .optional(),
    identityMapping: IdentityMappingSchema.optional(),
    teamManagement: TeamManagementSchema.optional(),
  })
  .strict()
  .superRefine((scope, ctx) => {
    const organizationPairs = new Map<string, string>();
    const sourceRepositories = new Set<string>();
    const targetRepositories = new Set<string>();

    for (const [index, organization] of scope.organizations.entries()) {
      const priorTarget = organizationPairs.get(organization.source);
      if (priorTarget !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            priorTarget !== organization.target
              ? 'A source organization can map to only one target organization.'
              : 'A source organization can appear in only one organization mapping.',
          path: ['organizations', index, 'source'],
        });
      }
      organizationPairs.set(organization.source, organization.target);
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
