import { ReleaseAssetStreamer } from './asset-streamer.js';
import { ReleaseRecreator } from './release-recreator.js';
import type {
  ReleaseMigrationRequest,
  ReleaseMigrationResult,
  ReleaseTransport,
  SourceRelease,
} from './types.js';

function oldestFirst(left: SourceRelease, right: SourceRelease): number {
  return (left.publishedAt ?? left.createdAt).localeCompare(
    right.publishedAt ?? right.createdAt,
  );
}

/** Stage 4 fallback for releases deliberately omitted from a GEI run. */
export class LargeReleasesMigrationStrategy {
  readonly id = 'strategy-releases-fallback';
  readonly displayName = 'Large Releases & Asset Fallback Streaming';
  private readonly recreator: ReleaseRecreator;
  private readonly streamer: ReleaseAssetStreamer;

  constructor(private readonly transport: ReleaseTransport) {
    this.recreator = new ReleaseRecreator(transport);
    this.streamer = new ReleaseAssetStreamer(transport);
  }

  async execute(
    request: ReleaseMigrationRequest,
  ): Promise<ReleaseMigrationResult> {
    if (!request.geiSkippedReleases) {
      throw new Error(
        'Release fallback may run only when GEI used --skip-releases.',
      );
    }
    const metrics = {
      releasesRecreated: 0,
      assetsTransferred: 0,
      bytesStreamed: 0,
    };
    const warnings: string[] = [];
    try {
      const sourceReleases = [
        ...(await this.transport.listSourceReleases(request.signal)),
      ].sort(oldestFirst);
      for (const sourceRelease of sourceReleases) {
        if (request.signal.aborted)
          throw (
            request.signal.reason ?? new Error('Release fallback was aborted.')
          );
        const target = await this.recreator.recreate(
          sourceRelease,
          request.signal,
        );
        if (target.created) metrics.releasesRecreated++;
        const existingNames = new Set(
          target.release.assets.map((asset) => asset.name),
        );
        for (const asset of sourceRelease.assets) {
          if (existingNames.has(asset.name)) continue;
          const transfer = await this.streamer.stream(
            target.release.id,
            asset,
            request.signal,
          );
          if (transfer.warning) warnings.push(transfer.warning);
          if (transfer.transferred) {
            metrics.assetsTransferred++;
            metrics.bytesStreamed += asset.size;
          }
        }
      }
      await this.verify(request.signal);
      this.recordCheckpoint(request, 'completed');
      return { status: 'completed', warnings, metrics };
    } catch (error) {
      this.recordCheckpoint(request, 'failed', error);
      throw error;
    }
  }

  private async verify(signal: AbortSignal): Promise<void> {
    const [source, target] = await Promise.all([
      this.transport.listSourceReleases(signal),
      this.transport.listTargetReleases(signal),
    ]);
    const targetByTag = new Map(
      target.map((release) => [release.tagName, release]),
    );
    for (const sourceRelease of source) {
      const targetRelease = targetByTag.get(sourceRelease.tagName);
      if (!targetRelease)
        throw new Error(
          `Target release is missing tag ${sourceRelease.tagName}.`,
        );
      const sourceEligibleAssets = sourceRelease.assets.filter(
        (asset) => asset.size <= 2 * 1024 ** 3,
      );
      if (targetRelease.assets.length < sourceEligibleAssets.length) {
        throw new Error(
          `Target release ${sourceRelease.tagName} has fewer assets than the source.`,
        );
      }
    }
  }

  private recordCheckpoint(
    request: ReleaseMigrationRequest,
    status: 'completed' | 'failed',
    error?: unknown,
  ): void {
    if (!request.checkpointManager || !request.checkpointRepository) return;
    request.checkpointManager.recordStageResult(
      request.checkpointRepository,
      'specializedStrategies',
      {
        'releases-fallback': {
          status,
          ...(error instanceof Error ? { error: error.message } : {}),
        },
      },
    );
  }
}
