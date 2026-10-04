import type { MigrationCheckpointManager } from '../../checkpoint/manager.js';

export const RELEASE_ASSET_REST_LIMIT_BYTES = 2 * 1024 ** 3;

export interface ReleaseAsset {
  readonly id: number;
  readonly name: string;
  readonly label?: string | null;
  readonly contentType: string;
  readonly size: number;
  readonly downloadUrl: string;
}

export interface SourceRelease {
  readonly id: number;
  readonly tagName: string;
  readonly targetCommitish: string;
  readonly name?: string | null;
  readonly body?: string | null;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly makeLatest?: 'true' | 'false' | 'legacy';
  readonly createdAt: string;
  readonly publishedAt?: string | null;
  readonly assets: readonly ReleaseAsset[];
}

export interface TargetRelease {
  readonly id: number;
  readonly tagName: string;
  readonly assets: readonly Pick<ReleaseAsset, 'name' | 'size'>[];
}

export interface CreateReleaseInput {
  readonly tagName: string;
  readonly targetCommitish: string;
  readonly name?: string | null;
  readonly body?: string | null;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly makeLatest?: 'true' | 'false' | 'legacy';
}

/** A stream-only transport boundary for source download and target upload. */
export interface ReleaseTransport {
  listSourceReleases(signal: AbortSignal): Promise<readonly SourceRelease[]>;
  listTargetReleases(signal: AbortSignal): Promise<readonly TargetRelease[]>;
  createTargetRelease(
    input: CreateReleaseInput,
    signal: AbortSignal,
  ): Promise<TargetRelease>;
  downloadAsset(
    asset: ReleaseAsset,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  uploadAsset(
    releaseId: number,
    asset: ReleaseAsset,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void>;
}

export interface ReleaseMigrationRequest {
  readonly geiSkippedReleases: boolean;
  readonly signal: AbortSignal;
  readonly checkpointManager?: MigrationCheckpointManager;
  readonly checkpointRepository?: string;
}

export interface ReleaseMigrationMetrics {
  readonly releasesRecreated: number;
  readonly assetsTransferred: number;
  readonly bytesStreamed: number;
}

export interface ReleaseMigrationResult {
  readonly status: 'completed' | 'skipped';
  readonly warnings: readonly string[];
  readonly metrics: ReleaseMigrationMetrics;
}
