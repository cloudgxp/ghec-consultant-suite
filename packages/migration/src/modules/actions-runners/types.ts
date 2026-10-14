/**
 * Domain types for Actions Self-Hosted Runner Groups migration module.
 */

export type RunnerGroupVisibility = 'all' | 'selected';

export interface RunnerGroupDefinition {
  readonly id?: number | undefined;
  readonly name: string;
  readonly visibility: RunnerGroupVisibility;
  readonly default?: boolean | undefined;
  readonly allows_public_repositories: boolean;
  readonly restricted_to_workflows?: boolean | undefined;
  readonly selected_workflows?: readonly string[] | undefined;
}

export interface ActionsRunnersData {
  readonly organization: string;
  readonly runner_groups: readonly RunnerGroupDefinition[];
}

export interface RawRunnerGroupResponse {
  readonly id: number;
  readonly name: string;
  readonly visibility: string;
  readonly default?: boolean | undefined;
  readonly selected_repositories_url?: string | undefined;
  readonly runners_url?: string | undefined;
  readonly inherited?: boolean | undefined;
  readonly allows_public_repositories?: boolean | undefined;
  readonly restricted_to_workflows?: boolean | undefined;
  readonly selected_workflows?: readonly string[] | undefined;
}

export interface RawRunnerGroupsListResponse {
  readonly total_count: number;
  readonly runner_groups: readonly RawRunnerGroupResponse[];
}
