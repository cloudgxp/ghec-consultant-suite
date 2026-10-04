export type RulesetEnforcement = 'active' | 'evaluate' | 'disabled';
export type RulesetTarget = 'branch' | 'tag' | 'push';
export type RulesetSourceType = 'Repository' | 'Organization';

export interface RulesetRefConditions {
  readonly include?: readonly string[] | undefined;
  readonly exclude?: readonly string[] | undefined;
}

export interface RulesetConditions {
  readonly ref_name?: RulesetRefConditions | undefined;
}

export interface PullRequestRuleParameters {
  readonly required_approving_review_count?: number | undefined;
  readonly dismiss_stale_reviews_on_push?: boolean | undefined;
  readonly require_code_owner_review?: boolean | undefined;
  readonly require_last_push_approval?: boolean | undefined;
  readonly required_review_thread_resolution?: boolean | undefined;
}

export interface StatusCheckItem {
  readonly context: string;
  readonly integration_id?: number | undefined;
}

export interface StatusChecksRuleParameters {
  readonly required_status_checks?: readonly StatusCheckItem[] | undefined;
  readonly strict_required_status_checks_policy?: boolean | undefined;
}

export interface DeploymentsRuleParameters {
  readonly required_deployment_environments?: readonly string[] | undefined;
}

export interface RulesetRule {
  readonly type:
    | 'pull_request'
    | 'required_status_checks'
    | 'required_linear_history'
    | 'required_signatures'
    | 'deletion'
    | 'non_fast_forward'
    | 'creation'
    | 'update'
    | 'required_deployments'
    | (string & {});
  readonly parameters?:
    | PullRequestRuleParameters
    | StatusChecksRuleParameters
    | DeploymentsRuleParameters
    | Record<string, unknown>
    | undefined;
}

export interface BypassActor {
  readonly actor_id?: number | null | undefined;
  readonly actor_type?:
    | 'Team'
    | 'Role'
    | 'Integration'
    | 'OrganizationAdmin'
    | (string & {})
    | undefined;
  readonly bypass_mode?:
    | 'always'
    | 'pull_request_only'
    | 'pull_request'
    | 'exempt'
    | (string & {})
    | undefined;
  readonly actor_name?: string | null | undefined;
  readonly name?: string | null | undefined;
}

export interface GitHubRuleset {
  readonly id?: number | undefined;
  readonly name: string;
  readonly target?: RulesetTarget | string | undefined;
  readonly enforcement: RulesetEnforcement;
  readonly source_type?: RulesetSourceType | undefined;
  readonly source?: string | undefined;
  readonly conditions?: RulesetConditions | undefined;
  readonly rules?: readonly RulesetRule[] | undefined;
  readonly bypass_actors?: readonly BypassActor[] | undefined;
  readonly _links?:
    | {
        readonly self?: { readonly href?: string | undefined } | undefined;
        readonly html?: { readonly href?: string | undefined } | undefined;
      }
    | undefined;
}

export interface RulesetsData {
  readonly rulesets: readonly GitHubRuleset[];
}
