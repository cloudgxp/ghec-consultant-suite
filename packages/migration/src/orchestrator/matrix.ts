import type { DependencyGraph } from '@ghec/analysis';
import type {
  MigrationScope,
  ModuleExecutionResult,
  VerificationDiscrepancy,
  VerificationReport,
} from '@ghec/contracts';

/**
 * Options for configuring matrix partitioning.
 */
export interface ScopeMatrixOptions {
  /** Maximum number of repositories in each parallel cohort. Minimum 1. Optional when runnerCapacity is specified. */
  readonly batchSize?: number | undefined;
  /** Number of parallel runners allocated (capacity). Determines dynamic cohort count and batch size. Minimum 1. */
  readonly runnerCapacity?: number | undefined;
  /** Optional dependency graph from analysis or discovery bundle for coupling-aware grouping. */
  readonly dependencyGraph?: DependencyGraph | undefined;
  /** Custom prefix for cohort identifiers (defaults to 'cohort'). */
  readonly namingPrefix?: string | undefined;
}

/**
 * An individual parallel cohort partition for a GitHub Actions job matrix.
 */
export interface MatrixCohort {
  /** Unique cohort identifier (e.g. 'cohort-1'). */
  readonly cohortId: string;
  /** Suggested wave index based on dependency ordering (1-indexed). */
  readonly wave: number;
  /** Number of repositories assigned to this cohort. */
  readonly repoCount: number;
  /** Repository identifiers in "sourceOrg/sourceRepo" format. */
  readonly repositories: readonly string[];
  /** Serialized JSON string of the scoped MigrationScope slice for direct matrix consumption. */
  readonly scopeJson: string;
  /** Parsed MigrationScope slice containing only the repositories in this cohort. */
  readonly scope: MigrationScope;
  /** Explanation of grouping rationale (e.g. cycles, coupled component, or batch partition). */
  readonly rationale?: string | undefined;
}

/**
 * Standard GitHub Actions matrix specification payload.
 * Compatible with `jobs.<job_id>.strategy.matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}`.
 */
export interface GitHubActionsMatrix {
  readonly include: readonly MatrixCohort[];
}

/**
 * Result shape returned by an individual parallel cohort worker.
 */
export interface CohortExecutionResult {
  readonly cohortId: string;
  readonly status: 'complete' | 'failed' | 'skipped';
  readonly repositoryCount: number;
  readonly completedRepositories: readonly string[];
  readonly failedRepositories?: readonly string[] | undefined;
  readonly moduleResults?: readonly ModuleExecutionResult[] | undefined;
  readonly verificationReport?: VerificationReport | undefined;
  readonly discrepancies?: readonly VerificationDiscrepancy[] | undefined;
  readonly error?: string | undefined;
  readonly durationMs?: number | undefined;
}

/**
 * Consolidated aggregate summary combining parallel cohort execution results into a unified view.
 */
export interface AggregatedMigrationSummary {
  readonly status: 'complete' | 'failed' | 'partial';
  readonly totalCohorts: number;
  readonly completedCohorts: number;
  readonly failedCohorts: number;
  readonly totalRepositories: number;
  readonly completedRepositories: number;
  readonly failedRepositories: number;
  readonly totalDiscrepancies: number;
  readonly durationMs: number;
  readonly errors: readonly string[];
  readonly cohortSummaries: readonly {
    readonly cohortId: string;
    readonly status: 'complete' | 'failed' | 'skipped';
    readonly repositoryCount: number;
    readonly failedCount: number;
    readonly error?: string | undefined;
  }[];
}
