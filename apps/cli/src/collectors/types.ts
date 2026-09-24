import type {
  CollectorExecution,
  DiscoveryBundle,
  Entity,
  ModuleId,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '../github/adapter.js';

export interface DiscoveredState {
  readonly repositories?: readonly Extract<Entity, { kind: 'repository' }>[];
  readonly teams?: readonly Extract<Entity, { kind: 'team' }>[];
}

export interface CollectorContext {
  readonly organizationId: string;
  readonly executionId: string;
  readonly adapter: GitHubReadAdapter;
  readonly signal: AbortSignal;
  readonly configuration: DiscoveryBundle['configuration'];
  readonly sharedState?: DiscoveredState;
}

export interface CollectorResult {
  execution: CollectorExecution;
  entities: Entity[];
  organizations: DiscoveryBundle['organizations'];
}

export interface Collector {
  readonly id: ModuleId;
  readonly implementation: 'placeholder' | 'implemented';
  collect(context: CollectorContext): Promise<CollectorResult>;
}
