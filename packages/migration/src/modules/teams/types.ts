export type TeamPrivacy = 'closed' | 'secret';

export type StandardTeamRepoPermission =
  'pull' | 'triage' | 'push' | 'maintain' | 'admin';

export type TeamRepoPermission = StandardTeamRepoPermission | string;

export interface TeamRepositoryAccess {
  readonly repositoryName: string;
  readonly permission: TeamRepoPermission;
}

export type TeamOrgRoleType = 'security_manager' | 'custom_org_role';

export interface TeamOrgRoleBinding {
  readonly roleType: TeamOrgRoleType;
  readonly roleName: string;
  readonly roleId?: number | undefined;
}

export type TeamMemberRole = 'member' | 'maintainer';

export interface TeamMember {
  readonly login: string;
  readonly role: TeamMemberRole;
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
  readonly orgRoles?: readonly TeamOrgRoleBinding[] | undefined;
  readonly members?: readonly TeamMember[] | undefined;
  readonly isIdpManaged?: boolean | undefined;
}

export interface TeamsMigrationData {
  readonly teams: readonly TeamDefinition[];
  readonly defaultRepositoryPermission?: string | undefined;
  readonly teamSlugMap: Record<string, string>;
  readonly securityManagerTeams?: readonly string[] | undefined;
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

export interface TeamManagementConfig {
  readonly defaultMode?: 'idp' | 'native' | 'hybrid' | undefined;
  readonly nonIdpTeams?: readonly string[] | undefined;
  readonly idpTeams?: readonly string[] | undefined;
  readonly migrateMembers?: boolean | undefined;
}

export interface TeamsModuleOptions {
  readonly identityMappingConfig?: IdentityMappingConfig | undefined;
  readonly teamManagement?: TeamManagementConfig | undefined;
}
