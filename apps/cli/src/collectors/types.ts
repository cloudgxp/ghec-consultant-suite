import type {
  CollectorExecution,
  DiscoveryBundle,
  Entity,
  ModuleId,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '../github/adapter.js';

export interface DiscoveredPolicyItem {
  readonly repositoryName: string;
  readonly branchProtectionRules: readonly {
    readonly pattern: string;
    readonly requiresApprovingReviews?: boolean | null;
    readonly requiredApprovingReviewCount?: number | null;
    readonly requiresStatusChecks?: boolean | null;
    readonly requiresStrictStatusChecks?: boolean | null;
  }[];
  readonly rulesets: readonly {
    readonly name: string;
    readonly enforcement: string;
    readonly target?: string | null;
  }[];
}

export interface DiscoveredState {
  readonly repositories?: readonly Extract<Entity, { kind: 'repository' }>[];
  readonly teams?: readonly Extract<Entity, { kind: 'team' }>[];
  readonly repositoryPolicies?: readonly DiscoveredPolicyItem[];
}

export interface CollectorContext {
  readonly organizationId: string;
  readonly executionId: string;
  readonly adapter: GitHubReadAdapter;
  readonly signal: AbortSignal;
  readonly configuration: DiscoveryBundle['configuration'];
  readonly sharedState?: DiscoveredState;
  readonly salt?: string | undefined;
}

export interface CollectorResult {
  execution: CollectorExecution;
  entities: Entity[];
  organizations: DiscoveryBundle['organizations'];
  repositoryPolicies?: readonly DiscoveredPolicyItem[] | undefined;
}

export interface Collector {
  readonly id: ModuleId;
  readonly implementation: 'placeholder' | 'implemented';
  collect(context: CollectorContext): Promise<CollectorResult>;
}
