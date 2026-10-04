import type { IdentityMappingEngine } from '../teams/identity-mapper.js';

export interface EnvironmentReviewer {
  readonly type: 'User' | 'Team';
  readonly id?: number | undefined;
  readonly login?: string | undefined;
  readonly slug?: string | undefined;
  readonly mappedLogin?: string | undefined;
}

export interface DeploymentBranchPolicy {
  readonly protected_branches: boolean;
  readonly custom_branch_policies: boolean;
}

export interface DeploymentBranchPolicyRule {
  readonly id?: number | undefined;
  readonly name: string;
  readonly type?: 'branch' | 'tag' | undefined;
}

export interface EnvironmentVariable {
  readonly name: string;
  readonly value: string;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
}

export interface EnvironmentSecret {
  readonly name: string;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
}

export interface EnvironmentDefinition {
  readonly name: string;
  readonly waitTimer?: number | undefined;
  readonly preventSelfReview?: boolean | undefined;
  readonly reviewers?: readonly EnvironmentReviewer[] | undefined;
  readonly deploymentBranchPolicy?: DeploymentBranchPolicy | null | undefined;
  readonly customBranchPolicies?:
    readonly DeploymentBranchPolicyRule[] | undefined;
  readonly variables?: readonly EnvironmentVariable[] | undefined;
  readonly secrets?: readonly EnvironmentSecret[] | undefined;
}

export interface EnvironmentsData {
  readonly repo: string;
  readonly environments: readonly EnvironmentDefinition[];
}

export interface EnvironmentsModuleOptions {
  readonly identityMapper?: IdentityMappingEngine | undefined;
}

export interface RawGitHubEnvironmentProtectionRule {
  readonly id?: number | undefined;
  readonly node_id?: string | undefined;
  readonly type: string;
  readonly wait_timer?: number | undefined;
  readonly prevent_self_review?: boolean | undefined;
  readonly reviewers?:
    | readonly {
        readonly type: 'User' | 'Team';
        readonly reviewer: {
          readonly id: number;
          readonly login?: string | undefined;
          readonly name?: string | undefined;
          readonly slug?: string | undefined;
        };
      }[]
    | undefined;
}

export interface RawGitHubEnvironmentItem {
  readonly id?: number | undefined;
  readonly node_id?: string | undefined;
  readonly name: string;
  readonly url?: string | undefined;
  readonly html_url?: string | undefined;
  readonly created_at?: string | undefined;
  readonly updated_at?: string | undefined;
  readonly protection_rules?:
    readonly RawGitHubEnvironmentProtectionRule[] | undefined;
  readonly deployment_branch_policy?: DeploymentBranchPolicy | null | undefined;
}

export interface RawGitHubEnvironmentsResponse {
  readonly total_count?: number | undefined;
  readonly environments?: readonly RawGitHubEnvironmentItem[] | undefined;
}

export interface RawGitHubEnvironmentVariablesResponse {
  readonly total_count?: number | undefined;
  readonly variables?:
    | readonly {
        readonly name: string;
        readonly value?: string | undefined;
        readonly created_at?: string | undefined;
        readonly updated_at?: string | undefined;
      }[]
    | undefined;
}

export interface RawGitHubEnvironmentSecretsResponse {
  readonly total_count?: number | undefined;
  readonly secrets?:
    | readonly {
        readonly name: string;
        readonly created_at?: string | undefined;
        readonly updated_at?: string | undefined;
      }[]
    | undefined;
}

export interface RawGitHubEnvironmentPublicKeyResponse {
  readonly key_id?: string | undefined;
  readonly key?: string | undefined;
}

export interface RawGitHubBranchPoliciesResponse {
  readonly total_count?: number | undefined;
  readonly branch_policies?:
    | readonly {
        readonly id?: number | undefined;
        readonly name: string;
        readonly type?: 'branch' | 'tag' | undefined;
      }[]
    | undefined;
}
