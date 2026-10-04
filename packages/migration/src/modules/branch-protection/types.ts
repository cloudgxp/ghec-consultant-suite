export interface ProtectionActorsAllowances {
  readonly users?: readonly string[] | undefined;
  readonly teams?: readonly string[] | undefined;
  readonly apps?: readonly string[] | undefined;
}

export interface RequiredStatusChecksConfig {
  readonly strict?: boolean | undefined;
  readonly contexts?: readonly string[] | undefined;
  readonly checks?:
    | readonly {
        readonly context: string;
        readonly app_id?: number | undefined;
      }[]
    | undefined;
}

export interface RequiredPullRequestReviewsConfig {
  readonly dismissal_restrictions?: ProtectionActorsAllowances | undefined;
  readonly dismiss_stale_reviews?: boolean | undefined;
  readonly require_code_owner_reviews?: boolean | undefined;
  readonly required_approving_review_count?: number | undefined;
  readonly require_last_push_approval?: boolean | undefined;
  readonly bypass_pull_request_allowances?:
    ProtectionActorsAllowances | undefined;
}

export interface BranchProtectionRule {
  readonly branch: string;
  readonly required_status_checks?:
    RequiredStatusChecksConfig | null | undefined;
  readonly enforce_admins?:
    { readonly enabled: boolean } | boolean | null | undefined;
  readonly required_pull_request_reviews?:
    RequiredPullRequestReviewsConfig | null | undefined;
  readonly restrictions?: ProtectionActorsAllowances | null | undefined;
  readonly required_linear_history?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly allow_force_pushes?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly allow_deletions?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly block_creations?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly required_conversation_resolution?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly lock_branch?: { readonly enabled: boolean } | boolean | undefined;
  readonly allow_fork_syncing?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly required_signatures?:
    { readonly enabled: boolean } | boolean | undefined;
  readonly required_deployments?:
    { readonly environments?: readonly string[] | undefined } | undefined;
}

export interface BranchProtectionData {
  readonly protections: readonly BranchProtectionRule[];
}

export interface BranchProtectionReconciliationDiff {
  readonly branch: string;
  readonly needsReconciliation: boolean;
  readonly omittedSettings: {
    readonly bypassPullRequestAllowances: boolean;
    readonly requireLastPushApproval: boolean;
    readonly requiredDeployments: boolean;
    readonly lockBranch: boolean;
    readonly blockCreations: boolean;
    readonly allowForcePushesCustom: boolean;
    readonly dismissalRestrictions: boolean;
  };
  readonly reconciledPayload: Record<string, unknown>;
}
