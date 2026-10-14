/**
 * Domain types for Actions Policies & Permissions migration module.
 */

export type EnabledRepositories = 'all' | 'none' | 'selected';
export type AllowedActions = 'all' | 'local_only' | 'selected';

export interface SelectedActionsConfig {
  readonly github_owned_allowed: boolean;
  readonly verified_allowed?: boolean | undefined;
  readonly patterns_allowed?: readonly string[] | undefined;
}

export interface ActionsPermissionsState {
  readonly enabled_repositories: EnabledRepositories;
  readonly allowed_actions?: AllowedActions | undefined;
  readonly selected_actions?: SelectedActionsConfig | undefined;
}

export interface ActionsPoliciesData {
  readonly organization: string;
  readonly permissions: ActionsPermissionsState;
}

export interface RawActionsPermissionsResponse {
  readonly enabled_repositories?: string | null;
  readonly allowed_actions?: string | null;
  readonly selected_actions_url?: string | null;
  readonly selected_repositories_url?: string | null;
}

export interface RawSelectedActionsResponse {
  readonly github_owned_allowed?: boolean | null;
  readonly verified_allowed?: boolean | null;
  readonly patterns_allowed?: readonly string[] | null;
}
