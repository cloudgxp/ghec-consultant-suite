import { createHash } from 'node:crypto';
import { sanitizeDiagnostics } from '@ghec/github-client';
import type {
  LfsBatchAction,
  LfsBatchResponse,
  LfsObject,
  LfsStreamerInterface,
} from './types.js';

export class LfsStreamer implements LfsStreamerInterface {
  async requestBatch(
    repoEndpoint: string,
    operation: 'upload' | 'download',
    objects: readonly LfsObject[],
    signal?: AbortSignal,
    token?: string,
  ): Promise<LfsBatchResponse> {
    let baseEndpoint = repoEndpoint;
    while (baseEndpoint.endsWith('/')) {
      baseEndpoint = baseEndpoint.slice(0, -1);
    }
    const url = repoEndpoint.endsWith('/info/lfs/objects/batch')
      ? repoEndpoint
      : `${baseEndpoint}/info/lfs/objects/batch`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
    };

    if (token) {
      if (token.startsWith('Basic ') || token.startsWith('Bearer ')) {
        headers.Authorization = token;
      } else {
        const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
        headers.Authorization = `Basic ${basic}`;
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operation,
        transfers: ['basic'],
        objects: objects.map((o) => ({ oid: o.oid, size: o.size })),
        hash_algo: 'sha256',
      }),
      ...(signal ? { signal } : {}),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Git LFS Batch API error (${res.status} ${res.statusText}): ${sanitizeDiagnostics(errText)}`,
      );
    }

    return (await res.json()) as LfsBatchResponse;
  }

  async transferObject(
    sourceUrl: string,
    targetUrl: string,
    expectedOid: string,
    expectedSize: number,
    uploadHeaders?: Record<string, string>,
    downloadHeaders?: Record<string, string>,
    verifyAction?: LfsBatchAction,
    signal?: AbortSignal,
  ): Promise<void> {
    const downloadRes = await fetch(sourceUrl, {
      headers: downloadHeaders ?? {},
      ...(signal ? { signal } : {}),
    });

    if (!downloadRes.ok) {
      throw new Error(
        `Failed to download source LFS object: HTTP ${downloadRes.status} ${downloadRes.statusText}`,
      );
    }

    const arrayBuf = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // SHA-256 integrity validation
    const computedHash = createHash('sha256').update(buffer).digest('hex');
    if (computedHash.toLowerCase() !== expectedOid.toLowerCase()) {
      throw new Error(
        `LFS object integrity violation: computed SHA-256 (${computedHash}) does not match expected OID (${expectedOid})`,
      );
    }

    // Stream / upload to target
    const putHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      ...(uploadHeaders ?? {}),
    };

    const uploadRes = await fetch(targetUrl, {
      method: 'PUT',
      headers: putHeaders,
      body: buffer,
      ...(signal ? { signal } : {}),
      // @ts-expect-error duplex is required in node fetch for streaming/buffers
      duplex: 'half',
    });

    if (
      !uploadRes.ok &&
      uploadRes.status !== 200 &&
      uploadRes.status !== 201 &&
      uploadRes.status !== 204
    ) {
      const errText = await uploadRes.text().catch(() => '');
      throw new Error(
        `Failed to upload LFS object to target store (HTTP ${uploadRes.status}): ${errText}`,
      );
    }

    // Call verify action if provided by batch handshake
    if (verifyAction?.href) {
      const verifyHeaders: Record<string, string> = {
        'Content-Type': 'application/vnd.git-lfs+json',
        ...(verifyAction.header ?? {}),
      };

      const verifyRes = await fetch(verifyAction.href, {
        method: 'POST',
        headers: verifyHeaders,
        body: JSON.stringify({
          oid: expectedOid,
          size: expectedSize,
        }),
        ...(signal ? { signal } : {}),
      });

      if (!verifyRes.ok && verifyRes.status !== 200) {
        throw new Error(
          `LFS verify action failed with HTTP ${verifyRes.status}`,
        );
      }
    }
  }
}
