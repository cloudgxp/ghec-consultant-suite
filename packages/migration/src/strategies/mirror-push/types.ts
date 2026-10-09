import type { GitHubReadAdapter } from '@ghec/github-client';
import type { TargetWriteClient } from '../../core/types.js';

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type GitCommandRunner = (
  command: string,
  args: readonly string[],
  options?: {
    readonly cwd?: string | undefined;
    readonly environment?: Readonly<Record<string, string>> | undefined;
    readonly secrets?: readonly string[] | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly timeoutMs?: number | undefined;
  },
) => Promise<GitCommandResult>;

export interface DiskSpaceCheckResult {
  readonly freeBytes: number;
  readonly requiredBytes: number;
  readonly sufficient: boolean;
  readonly path: string;
}

export interface MirrorPushRequest {
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly targetRepoVisibility?: 'private' | 'internal' | 'public' | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly estimatedSizeBytes?: number | undefined;
  readonly skipDiskCheck?: boolean | undefined;
  readonly scratchDir?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly targetClient?: GitHubReadAdapter | undefined;
  readonly targetWriteClient?: TargetWriteClient | undefined;
  readonly onStdout?: ((line: string) => void) | undefined;
  readonly onStderr?: ((line: string) => void) | undefined;
}

export interface MirrorPushResult {
  readonly sourceOrg: string;
  readonly sourceRepo: string;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly targetCreated: boolean;
  readonly diskSpaceChecked?: DiskSpaceCheckResult | undefined;
}
