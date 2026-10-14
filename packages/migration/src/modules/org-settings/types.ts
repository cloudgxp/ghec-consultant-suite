/**
 * Domain types for Organization Settings & Member Privileges migration module.
 */

export type DefaultRepositoryPermission = 'read' | 'write' | 'admin' | 'none';

export interface OrgSettingsState {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly company?: string | undefined;
  readonly blog?: string | undefined;
  readonly location?: string | undefined;
  readonly email?: string | undefined;
  readonly has_organization_projects?: boolean | undefined;
  readonly has_repository_projects?: boolean | undefined;
  readonly default_repository_permission?:
    DefaultRepositoryPermission | undefined;
  readonly members_can_create_repositories?: boolean | undefined;
  readonly members_can_create_public_repositories?: boolean | undefined;
  readonly members_can_create_private_repositories?: boolean | undefined;
  readonly members_can_create_internal_repositories?: boolean | undefined;
  readonly members_can_create_pages?: boolean | undefined;
  readonly members_can_create_public_pages?: boolean | undefined;
  readonly members_can_create_private_pages?: boolean | undefined;
  readonly members_can_fork_private_repositories?: boolean | undefined;
  readonly web_commit_signoff_required?: boolean | undefined;
}

export interface OrgSettingsData {
  readonly organization: string;
  readonly settings: OrgSettingsState;
}

export interface RawOrgSettingsResponse {
  readonly name?: string | null;
  readonly description?: string | null;
  readonly company?: string | null;
  readonly blog?: string | null;
  readonly location?: string | null;
  readonly email?: string | null;
  readonly has_organization_projects?: boolean | null;
  readonly has_repository_projects?: boolean | null;
  readonly default_repository_permission?: string | null;
  readonly members_can_create_repositories?: boolean | null;
  readonly members_can_create_public_repositories?: boolean | null;
  readonly members_can_create_private_repositories?: boolean | null;
  readonly members_can_create_internal_repositories?: boolean | null;
  readonly members_can_create_pages?: boolean | null;
  readonly members_can_create_public_pages?: boolean | null;
  readonly members_can_create_private_pages?: boolean | null;
  readonly members_can_fork_private_repositories?: boolean | null;
  readonly web_commit_signoff_required?: boolean | null;
}
