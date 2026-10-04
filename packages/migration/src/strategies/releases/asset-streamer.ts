import {
  RELEASE_ASSET_REST_LIMIT_BYTES,
  type ReleaseAsset,
  type ReleaseTransport,
} from './types.js';

export interface AssetStreamResult {
  readonly transferred: boolean;
  readonly warning?: string;
}

/** Transfers a release asset as a Web stream, never materializing it in memory. */
export class ReleaseAssetStreamer {
  constructor(private readonly transport: ReleaseTransport) {}

  async stream(
    targetReleaseId: number,
    asset: ReleaseAsset,
    signal: AbortSignal,
  ): Promise<AssetStreamResult> {
    if (asset.size > RELEASE_ASSET_REST_LIMIT_BYTES) {
      return {
        transferred: false,
        warning: `Release asset ${asset.name} exceeds GitHub's 2 GiB REST upload limit and requires manual transfer.`,
      };
    }
    const body = await this.transport.downloadAsset(asset, signal);
    await this.transport.uploadAsset(targetReleaseId, asset, body, signal);
    return { transferred: true };
  }
}
