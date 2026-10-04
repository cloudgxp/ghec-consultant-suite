import type {
  MigrationPreflightReport,
  RepositoryAssessment,
  DestinationAssessment,
  MigrationScope,
  DiscoveryBundle,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';

/**
 * Platform sizing thresholds defined by GitHub Enterprise Importer and GitHub platform limits.
 */
export const PLATFORM_LIMITS = {
  /** Maximum Git repository source size (40 GiB). */
  MAX_REPO_GIT_SIZE_BYTES: 40 * 1024 * 1024 * 1024,
  /** Maximum single Git commit size (2 GiB). */
  MAX_COMMIT_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
  /** Maximum single file/blob size during migration (400 MiB). */
  MAX_MIGRATION_BLOB_SIZE_BYTES: 400 * 1024 * 1024,
  /** Maximum single file/blob size after migration without LFS (100 MiB). */
  MAX_POST_MIGRATION_BLOB_SIZE_BYTES: 100 * 1024 * 1024,
  /** Maximum Git reference name length in bytes (255 bytes). */
  MAX_REF_NAME_LENGTH_BYTES: 255,
  /** Maximum total release assets size before --skip-releases is required (10 GiB). */
  MAX_RELEASES_TOTAL_ASSET_BYTES: 10 * 1024 * 1024 * 1024,
  /** Maximum release metadata threshold before flagging special strategy (40 GiB). */
  MAX_RELEASES_METADATA_BYTES: 40 * 1024 * 1024 * 1024,
} as const;

/**
 * Git repository sizing metrics parsed from `git-sizer` or Git inspect commands.
 */
export interface GitSizingStats {
  readonly gitSizeBytes: number;
  readonly largestCommitBytes: number;
  readonly largestBlobBytes: number;
  readonly longestRefLength: number;
}

/**
 * Raw JSON schema shapes output by `git-sizer --json`.
 */
export interface GitSizerRawOutput {
  readonly max_blob_size?: number | undefined;
  readonly unique_blob_size?: number | undefined;
  readonly total_blob_size?: number | undefined;
  readonly max_commit_size?: number | undefined;
  readonly unique_commit_size?: number | undefined;
  readonly max_ref_name_length?: number | undefined;
  readonly longest_ref_length?: number | undefined;
  readonly maxBlobSize?: number | undefined;
  readonly uniqueBlobSize?: number | undefined;
  readonly totalBlobSize?: number | undefined;
  readonly maxCommitSize?: number | undefined;
  readonly maxRefNameLength?: number | undefined;
  readonly [key: string]: unknown;
}

/**
 * Options for inspecting source repositories.
 */
export interface SourceInspectorOptions {
  readonly adapter: GitHubReadAdapter;
  readonly sourceOrg: string;
  readonly signal?: AbortSignal | undefined;
  readonly discoveryBundle?: DiscoveryBundle | undefined;
}

/**
 * Ruleset bypass actor entry returned by GitHub Ruleset API.
 */
export interface RulesetBypassActor {
  readonly actor_id?: number | null | undefined;
  readonly actor_type?: string | undefined;
  readonly actor_name?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly bypass_mode?:
    'always' | 'exempt' | 'pull_request' | string | undefined;
}

/**
 * Options for inspecting destination blockers.
 */
export interface DestinationInspectorOptions {
  readonly adapter: GitHubReadAdapter;
  readonly targetOrg: string;
  readonly scopedRepos: readonly string[];
  readonly signal?: AbortSignal | undefined;
}

/**
 * Options for the full migration preflight evaluator.
 */
export interface PreflightEvaluatorOptions {
  readonly scope: MigrationScope;
  readonly sourceAdapter: GitHubReadAdapter;
  readonly targetAdapter?: GitHubReadAdapter | undefined;
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly discoveryBundle?: DiscoveryBundle | undefined;
  readonly sizerMetricsMap?: ReadonlyMap<string, GitSizingStats> | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly reportId?: string | undefined;
  readonly evaluatedAt?: string | undefined;
}

export type {
  MigrationPreflightReport,
  RepositoryAssessment,
  DestinationAssessment,
};
