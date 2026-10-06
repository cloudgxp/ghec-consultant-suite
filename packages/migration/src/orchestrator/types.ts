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

import type { MigrationCheckpointManager } from '../checkpoint/manager.js';
import type { GeiCommandRunner, GeiMigrationResult } from '../gei/types.js';
import type { ReleaseTransport } from '../strategies/releases/types.js';

export interface RepositoryPipelineOptions {
  readonly registry: ModuleRegistry;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly targetWriteClient?: TargetWriteClient | undefined;
  readonly checkpointManager?: MigrationCheckpointManager | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly cachedDiscoveryBundle?: DiscoveryBundle | unknown | undefined;
  readonly dryRun?: boolean | undefined;
  readonly continueOnError?: boolean | undefined;
  readonly runId?: string | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly geiRunner?: GeiCommandRunner | undefined;
  readonly lfsRunner?: GeiCommandRunner | undefined;
  readonly releaseTransport?: ReleaseTransport | undefined;
  readonly scope?: MigrationScope | undefined;
}

export interface RepositoryPipelineResult {
  readonly repositoryName: string;
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly status: 'complete' | 'failed' | 'skipped';
  readonly completedStages: readonly string[];
  readonly error?: string | undefined;
  readonly geiResult?: GeiMigrationResult | undefined;
  readonly moduleResults: readonly ModuleExecutionResult[];
}

export interface MigrationOrchestratorOptions {
  readonly registry: ModuleRegistry;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly targetWriteClient?: TargetWriteClient | undefined;
  readonly checkpointManager?: MigrationCheckpointManager | undefined;
  readonly scope?: MigrationScope | undefined;
  readonly plan?: MigrationPlan | undefined;
  readonly cachedDiscoveryBundle?: DiscoveryBundle | unknown | undefined;
  readonly modules?: readonly string[] | undefined;
  readonly concurrency?: number | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly continueOnError?: boolean | undefined;
  readonly runId?: string | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly geiRunner?: GeiCommandRunner | undefined;
  readonly lfsRunner?: GeiCommandRunner | undefined;
  readonly releaseTransport?: ReleaseTransport | undefined;
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
