import type { MigrationReleaseAsset } from './types.js';

export interface AssetTransferOptions {
  readonly asset: MigrationReleaseAsset;
  readonly targetReleaseId: number;
  readonly targetOrg: string;
  readonly targetRepo: string;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly fetchImpl?: typeof globalThis.fetch | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly maxAttempts?: number | undefined;
}

export interface AssetTransferResult {
  readonly success: boolean;
  readonly bytesStreamed: number;
  readonly error?: string | undefined;
}

export async function transferReleaseAsset(
  options: AssetTransferOptions,
): Promise<AssetTransferResult> {
  const {
    asset,
    targetReleaseId,
    targetOrg,
    targetRepo,
    sourceToken,
    targetToken,
    fetchImpl = globalThis.fetch,
    signal,
    maxAttempts = 3,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Asset transfer aborted');
    }

    try {
      // 1. Download stream from source asset
      const downloadHeaders: Record<string, string> = {
        Accept: 'application/octet-stream',
      };
      if (sourceToken) {
        downloadHeaders.Authorization = `Bearer ${sourceToken}`;
      }

      const downloadRes = await fetchImpl(asset.downloadUrl, {
        method: 'GET',
        headers: downloadHeaders,
        ...(signal ? { signal } : {}),
      });

      if (!downloadRes.ok) {
        throw new Error(
          `Failed to download asset ${asset.name}: HTTP ${downloadRes.status} ${downloadRes.statusText}`,
        );
      }

      if (!downloadRes.body) {
        throw new Error(`Empty body when downloading asset ${asset.name}`);
      }

      // 2. Stream to destination upload URL
      const uploadUrl = `https://uploads.github.com/repos/${encodeURIComponent(targetOrg)}/${encodeURIComponent(targetRepo)}/releases/${targetReleaseId}/assets?name=${encodeURIComponent(asset.name)}`;
      const uploadHeaders: Record<string, string> = {
        'Content-Type': asset.contentType || 'application/octet-stream',
        'Content-Length': String(asset.size),
      };
      if (targetToken) {
        uploadHeaders.Authorization = `Bearer ${targetToken}`;
      }

      const uploadRes = await fetchImpl(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        body: downloadRes.body,
        // @ts-expect-error duplex required for streaming request body in Node.js fetch
        duplex: 'half',
        ...(signal ? { signal } : {}),
      });

      if (!uploadRes.ok && uploadRes.status !== 201) {
        const errorText = await uploadRes.text().catch(() => '');
        throw new Error(
          `Failed to upload asset ${asset.name}: HTTP ${uploadRes.status} ${errorText}`,
        );
      }

      return {
        success: true,
        bytesStreamed: asset.size,
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  return {
    success: false,
    bytesStreamed: 0,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}
