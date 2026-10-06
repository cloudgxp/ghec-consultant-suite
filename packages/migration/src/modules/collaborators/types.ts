import type { IdentityMappingConfig } from '../teams/types.js';

export type CollaboratorPermission =
  'pull' | 'triage' | 'push' | 'maintain' | 'admin';

export interface RawApiCollaboratorPermissions {
  admin?: boolean;
  maintain?: boolean;
  push?: boolean;
  triage?: boolean;
  pull?: boolean;
}

export interface RawApiCollaborator {
  id: number;
  login: string;
  permissions?: RawApiCollaboratorPermissions;
  role_name?: string;
}

export interface MigrationCollaborator {
  id: number;
  login: string;
  permission: CollaboratorPermission;
}

export interface CollaboratorsMigrationData {
  repo: string;
  collaborators: readonly MigrationCollaborator[];
}

export interface CollaboratorsModuleOptions {
  readonly identityMappingConfig?: IdentityMappingConfig | undefined;
}

export interface AddCollaboratorPayload {
  permission: CollaboratorPermission;
}
