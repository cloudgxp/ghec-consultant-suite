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

export interface HostedRunnerImage {
  readonly id: string;
  readonly source: 'github' | 'partner' | 'custom' | string;
}

export interface HostedRunnerDefinition {
  readonly id?: number | undefined;
  readonly name: string;
  readonly runner_group_id?: number | undefined;
  readonly runner_group_name?: string | undefined;
  readonly size: string;
  readonly image: HostedRunnerImage;
  readonly maximum_runners?: number | undefined;
  readonly enable_static_ip?: boolean | undefined;
  readonly status?: string | undefined;
  readonly platform?: string | undefined;
}

export interface ActionsRunnersData {
  readonly organization: string;
  readonly runner_groups: readonly RunnerGroupDefinition[];
  readonly hosted_runners?: readonly HostedRunnerDefinition[] | undefined;
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

export interface RawHostedRunnerResponse {
  readonly id: number;
  readonly name: string;
  readonly runner_group_id?: number | undefined;
  readonly size?: string | undefined;
  readonly machine_size_details?:
    | {
        readonly id?: string | undefined;
        readonly cpu_cores?: number | undefined;
        readonly memory_gb?: number | undefined;
        readonly storage_gb?: number | undefined;
      }
    | undefined;
  readonly image?:
    | {
        readonly id?: string | undefined;
        readonly source?: string | undefined;
      }
    | undefined;
  readonly image_details?:
    | {
        readonly id?: string | undefined;
        readonly source?: string | undefined;
        readonly display_name?: string | undefined;
      }
    | null
    | undefined;
  readonly maximum_runners?: number | undefined;
  readonly public_ip_enabled?: boolean | undefined;
  readonly enable_static_ip?: boolean | undefined;
  readonly status?: string | undefined;
  readonly platform?: string | undefined;
}

export interface RawHostedRunnersListResponse {
  readonly total_count?: number | undefined;
  readonly runners?: readonly RawHostedRunnerResponse[] | undefined;
}
