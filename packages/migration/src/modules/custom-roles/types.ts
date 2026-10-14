export type CustomRepoBaseRole =
  'read' | 'triage' | 'write' | 'maintain' | 'admin';

export interface CustomRepositoryRoleDefinition {
  readonly id?: number | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly baseRole: CustomRepoBaseRole;
  readonly permissions: readonly string[];
}

export interface CustomOrganizationRoleDefinition {
  readonly id?: number | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly permissions: readonly string[];
}

export interface CustomRolesMigrationData {
  readonly organization: string;
  readonly repositoryRoles: readonly CustomRepositoryRoleDefinition[];
  readonly organizationRoles: readonly CustomOrganizationRoleDefinition[];
}

export interface RawCustomRepoRole {
  readonly id?: number | undefined;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly base_role?: string | undefined;
  readonly permissions?: readonly string[] | undefined;
}

export interface RawCustomOrgRole {
  readonly id?: number | undefined;
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly permissions?: readonly string[] | undefined;
}
