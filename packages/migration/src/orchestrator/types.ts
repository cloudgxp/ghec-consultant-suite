import type {
  DiscoveryBundle,
  MigrationPlan,
  MigrationScope,
  ModuleExecutionResult,
  VerificationReport,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { ModuleRegistry } from '../core/registry.js';
import type { StructuredLogger, TargetWriteClient } from '../core/types.js';

export interface MigrationOrchestratorOptions {
  readonly registry: ModuleRegistry;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly targetWriteClient?: TargetWriteClient | undefined;
  readonly scope?: MigrationScope | undefined;
  readonly plan?: MigrationPlan | undefined;
  readonly cachedDiscoveryBundle?: DiscoveryBundle | unknown | undefined;
  readonly modules?: readonly string[] | undefined;
  readonly dryRun?: boolean | undefined;
  readonly continueOnError?: boolean | undefined;
  readonly runId?: string | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface MigrationExecutionReport {
  readonly schemaVersion: '1.0.0';
  readonly planId: string;
  readonly executedAt: string;
  readonly status: 'complete' | 'partial' | 'failed';
  readonly exitCode: 0 | 1 | 4;
  readonly dryRun: boolean;
  readonly results: readonly ModuleExecutionResult[];
}

export interface VerificationOrchestratorOptions {
  readonly registry: ModuleRegistry;
  readonly targetClient: GitHubReadAdapter;
  readonly sourceClient?: GitHubReadAdapter | undefined;
  readonly plan: MigrationPlan;
  readonly scope?: MigrationScope | undefined;
  readonly runId?: string | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface VerificationOrchestratorResult {
  readonly report: VerificationReport;
  readonly exitCode: 0 | 1;
}
