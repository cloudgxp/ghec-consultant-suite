import {
  PLATFORM_LIMITS,
  type GitSizerRawOutput,
  type GitSizingStats,
} from './types.js';

/**
 * Formats a byte quantity into a human-readable string (B, KiB, MiB, GiB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Normalizes input numbers to safe non-negative integers.
 */
function toNonNegativeInt(value: unknown): number {
  if (
    typeof value === 'number' &&
    !Number.isNaN(value) &&
    Number.isFinite(value)
  ) {
    return Math.max(0, Math.floor(value));
  }
  return 0;
}

/**
 * Parses raw JSON output from `git-sizer --json` or native inspection data into normalized GitSizingStats.
 */
export function parseGitSizerOutput(
  raw: string | GitSizerRawOutput | Record<string, unknown>,
): GitSizingStats {
  let parsed: GitSizerRawOutput;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as GitSizerRawOutput;
    } catch (err) {
      throw new Error(
        `Failed to parse git-sizer output JSON: ${(err as Error).message}`,
        { cause: err },
      );
    }
  } else {
    parsed = raw;
  }

  const gitSizeBytes = toNonNegativeInt(
    parsed.unique_blob_size ??
      parsed.uniqueBlobSize ??
      parsed.total_blob_size ??
      parsed.totalBlobSize ??
      parsed.gitSizeBytes,
  );

  const largestCommitBytes = toNonNegativeInt(
    parsed.max_commit_size ?? parsed.maxCommitSize ?? parsed.largestCommitBytes,
  );

  const largestBlobBytes = toNonNegativeInt(
    parsed.max_blob_size ?? parsed.maxBlobSize ?? parsed.largestBlobBytes,
  );

  const longestRefLength = toNonNegativeInt(
    parsed.max_ref_name_length ??
      parsed.longest_ref_length ??
      parsed.maxRefNameLength ??
      parsed.longestRefLength,
  );

  return {
    gitSizeBytes,
    largestCommitBytes,
    largestBlobBytes,
    longestRefLength,
  };
}

export interface SizingEvaluationResult {
  readonly withinLimits: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Evaluates repository Git sizing metrics against authoritative GitHub and GEI limits.
 */
export function evaluateSizingLimits(
  stats: GitSizingStats,
): SizingEvaluationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Total blob / repo size limit (40 GiB)
  if (stats.gitSizeBytes > PLATFORM_LIMITS.MAX_REPO_GIT_SIZE_BYTES) {
    blockers.push(
      `Repository Git size (${formatBytes(stats.gitSizeBytes)}) exceeds GitHub platform limit of 40 GiB (${formatBytes(PLATFORM_LIMITS.MAX_REPO_GIT_SIZE_BYTES)}).`,
    );
  }

  // 2. Commit size limit (2 GiB)
  if (stats.largestCommitBytes > PLATFORM_LIMITS.MAX_COMMIT_SIZE_BYTES) {
    blockers.push(
      `Largest commit (${formatBytes(stats.largestCommitBytes)}) exceeds GitHub limit of 2 GiB (${formatBytes(PLATFORM_LIMITS.MAX_COMMIT_SIZE_BYTES)}).`,
    );
  }

  // 3. File / blob size limit (400 MiB during migration)
  if (stats.largestBlobBytes > PLATFORM_LIMITS.MAX_MIGRATION_BLOB_SIZE_BYTES) {
    blockers.push(
      `Largest file (${formatBytes(stats.largestBlobBytes)}) exceeds GitHub migration limit of 400 MiB (${formatBytes(PLATFORM_LIMITS.MAX_MIGRATION_BLOB_SIZE_BYTES)}).`,
    );
  } else if (
    stats.largestBlobBytes > PLATFORM_LIMITS.MAX_POST_MIGRATION_BLOB_SIZE_BYTES
  ) {
    warnings.push(
      `Largest file (${formatBytes(stats.largestBlobBytes)}) exceeds standard GitHub post-migration limit of 100 MiB (${formatBytes(PLATFORM_LIMITS.MAX_POST_MIGRATION_BLOB_SIZE_BYTES)}). Use Git LFS to track large files.`,
    );
  }

  // 4. Git reference length limit (255 bytes)
  if (stats.longestRefLength > PLATFORM_LIMITS.MAX_REF_NAME_LENGTH_BYTES) {
    blockers.push(
      `Longest Git reference (${stats.longestRefLength} bytes) exceeds GitHub limit of 255 bytes.`,
    );
  }

  return {
    withinLimits: blockers.length === 0,
    blockers,
    warnings,
  };
}
