import type { GitHubTargetClient } from '@ghec/github-client';

export type GeiRepositoryVisibility = 'private' | 'internal' | 'public';

export interface GeiCommandOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly onStdout?: (line: string) => void;
  readonly onStderr?: (line: string) => void;
  readonly secrets?: readonly string[];
}

export interface GeiCommandResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injectable boundary around child-process execution for deterministic tests. */
export type GeiCommandRunner = (
  command: string,
  args: readonly string[],
  options?: GeiCommandOptions,
) => Promise<GeiCommandResult>;

export interface GeiMigrationRequest {
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly sourceToken?: string;
  readonly targetToken?: string;
  readonly sourceApiUrl?: string;
  readonly targetApiUrl?: string;
  readonly targetRepoVisibility?: GeiRepositoryVisibility;
  readonly skipReleases?: boolean;
  readonly releaseBytes?: number;
  readonly metadataBytes?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onOutput?: (line: string) => void;
}

export type GeiMetadataStatus = 'complete' | 'partial' | 'failed' | 'skipped';

export interface GeiMetadataDiagnostics {
  readonly metadataState: GeiMetadataStatus;
  readonly gitDataPreserved: boolean;
  readonly failedMetadataCategories: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface GeiMigrationResult {
  readonly migrationId?: string;
  readonly skippedReleases: boolean;
  readonly command: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly metadataDiagnostics?: GeiMetadataDiagnostics;
}

export interface GeiPreflightCheck {
  readonly name: 'gh' | 'gh-gei';
  readonly ready: boolean;
  readonly detail: string;
  readonly installCommand?: string;
}

export interface GeiPreflightResult {
  readonly ready: boolean;
  readonly checks: readonly GeiPreflightCheck[];
}

export interface GeiStatusOptions {
  readonly targetOrg?: string;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly maxAttempts?: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface GeiMigrationStatus {
  readonly migrationId: string;
  readonly state: string;
  readonly raw: unknown;
}

export interface GeiLogDownloadOptions {
  readonly runner?: GeiCommandRunner;
  readonly sourceApiUrl?: string;
  readonly targetApiUrl?: string;
  readonly sourceToken?: string;
  readonly targetToken?: string;
  readonly signal?: AbortSignal;
}

export interface GeiMigrationLog {
  readonly filePath: string;
  readonly warnings: readonly string[];
}

export interface GeiAbortOptions {
  readonly runner?: GeiCommandRunner;
  readonly sourceApiUrl?: string;
  readonly targetApiUrl?: string;
  readonly sourceToken?: string;
  readonly targetToken?: string;
  readonly signal?: AbortSignal;
}

export type GeiStatusClient = Pick<GitHubTargetClient, 'readSingle'>;
