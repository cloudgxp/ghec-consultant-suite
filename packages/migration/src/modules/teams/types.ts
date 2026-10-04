export type TeamPrivacy = 'closed' | 'secret';

export type TeamRepoPermission =
  'pull' | 'triage' | 'push' | 'maintain' | 'admin';

export interface TeamRepositoryAccess {
  readonly repositoryName: string;
  readonly permission: TeamRepoPermission;
}

export interface TeamDefinition {
  readonly id?: number | undefined;
  readonly slug: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly privacy: TeamPrivacy;
  readonly parentSlug?: string | undefined;
  readonly parentTeamId?: number | undefined;
  readonly membershipCount: number;
  readonly repositoryAccess: readonly TeamRepositoryAccess[];
}

export interface TeamsMigrationData {
  readonly teams: readonly TeamDefinition[];
  readonly defaultRepositoryPermission?: string | undefined;
  readonly teamSlugMap: Record<string, string>;
}

export interface IdentityMappingConfig {
  readonly strategy: 'emu-saml' | 'manual' | 'pass-through';
  readonly suffix?: string | undefined;
  readonly mappings?: Record<string, string> | undefined;
}

export type IdentityMappingStatus = 'mapped' | 'unmapped' | 'pass-through';

export interface IdentityMappingResult {
  readonly sourceLogin: string;
  readonly mappedLogin: string;
  readonly status: IdentityMappingStatus;
  readonly warning?: string | undefined;
}

export interface IdpGroupSyncBlueprintRow {
  readonly teamSlug: string;
  readonly teamName: string;
  readonly parentTeamSlug: string;
  readonly privacy: string;
  readonly memberCount: number;
  readonly recommendedIdpGroupName: string;
  readonly recommendedScimDisplayName: string;
  readonly repositoryPermissions: string;
}
