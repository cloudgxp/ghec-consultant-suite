import type { MigrationCheckpointManager } from '../../checkpoint/manager.js';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { GeiCommandRunner } from '../../gei/types.js';

export interface GitLfsQuota {
  readonly enabled: boolean;
  readonly storageEnabled?: boolean;
  readonly bandwidthEnabled?: boolean;
  readonly storageRemainingBytes?: number;
  readonly bandwidthRemainingBytes?: number;
  readonly detail?: string;
}

export interface GitLfsQuotaChecker {
  check(
    targetOrg: string,
    targetRepo: string,
    signal: AbortSignal,
  ): Promise<GitLfsQuota>;
}

export interface GitLfsPreflightResult {
  readonly usesLfs: boolean;
  readonly gitLfsAvailable: boolean;
  readonly targetQuota: GitLfsQuota;
}

export interface GitLfsTransferMetrics {
  readonly objectCount: number;
  readonly bytesPushed: number;
  readonly durationMs: number;
}

export interface GitLfsMigrationRequest {
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly sourceToken: string;
  readonly targetToken: string;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly signal: AbortSignal;
  /** Must be true only after GEI has completed repository transfer. */
  readonly geiCompleted: boolean;
  readonly expectedObjectCount?: number;
  readonly expectedBytes?: number;
  readonly stagingRoot?: string;
  readonly checkpointManager?: MigrationCheckpointManager;
  readonly checkpointRepository?: string;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface GitLfsMigrationResult {
  readonly status: 'completed' | 'skipped';
  readonly stagingDirectory: string;
  readonly metrics: GitLfsTransferMetrics;
}

export interface GitLfsStrategyOptions {
  readonly runner?: GeiCommandRunner;
  readonly quotaChecker: GitLfsQuotaChecker;
  readonly now?: () => number;
}
