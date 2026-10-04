import { sanitizeDiagnostics } from '@ghec/github-client';
import type {
  CreateReleaseInput,
  ReleaseAsset,
  ReleaseTransport,
  SourceRelease,
  TargetRelease,
} from './types.js';

interface ReleaseEndpoint {
  readonly organization: string;
  readonly repository: string;
  readonly token: string;
  readonly apiUrl?: string;
  readonly uploadsUrl?: string;
}

export interface GitHubReleaseTransportOptions {
  readonly source: ReleaseEndpoint;
  readonly target: ReleaseEndpoint;
  readonly fetchImpl?: typeof globalThis.fetch;
}

interface ApiAsset {
  id: number;
  name: string;
  label?: string | null;
  content_type?: string;
  size?: number;
  url?: string;
  browser_download_url?: string;
}

interface ApiRelease {
  id: number;
  tag_name: string;
  target_commitish?: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  make_latest?: 'true' | 'false' | 'legacy';
  created_at?: string;
  published_at?: string | null;
  assets?: ApiAsset[];
}

function baseUrl(endpoint: ReleaseEndpoint): string {
  return (endpoint.apiUrl ?? 'https://api.github.com').replace(/\/$/, '');
}

function asset(asset: ApiAsset): ReleaseAsset {
  return {
    id: asset.id,
    name: asset.name,
    ...(asset.label !== undefined ? { label: asset.label } : {}),
    contentType: asset.content_type ?? 'application/octet-stream',
    size: asset.size ?? 0,
    downloadUrl: asset.url ?? asset.browser_download_url ?? '',
  };
}

function sourceRelease(release: ApiRelease): SourceRelease {
  return {
    id: release.id,
    tagName: release.tag_name,
    targetCommitish: release.target_commitish ?? release.tag_name,
    ...(release.name !== undefined ? { name: release.name } : {}),
    ...(release.body !== undefined ? { body: release.body } : {}),
    draft: release.draft ?? false,
    prerelease: release.prerelease ?? false,
    ...(release.make_latest ? { makeLatest: release.make_latest } : {}),
    createdAt: release.created_at ?? new Date(0).toISOString(),
    ...(release.published_at !== undefined
      ? { publishedAt: release.published_at }
      : {}),
    assets: (release.assets ?? []).map(asset),
  };
}

function targetRelease(release: ApiRelease): TargetRelease {
  return {
    id: release.id,
    tagName: release.tag_name,
    assets: (release.assets ?? []).map((item) => ({
      name: item.name,
      size: item.size ?? 0,
    })),
  };
}

/** REST transport that streams release downloads directly into upload requests. */
export class GitHubReleaseTransport implements ReleaseTransport {
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(private readonly options: GitHubReleaseTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async listSourceReleases(
    signal: AbortSignal,
  ): Promise<readonly SourceRelease[]> {
    return (await this.list(this.options.source, signal)).map(sourceRelease);
  }

  async listTargetReleases(
    signal: AbortSignal,
  ): Promise<readonly TargetRelease[]> {
    return (await this.list(this.options.target, signal)).map(targetRelease);
  }

  async createTargetRelease(
    input: CreateReleaseInput,
    signal: AbortSignal,
  ): Promise<TargetRelease> {
    const endpoint = this.options.target;
    const response = await this.fetchImpl(
      `${baseUrl(endpoint)}/repos/${encodeURIComponent(endpoint.organization)}/${encodeURIComponent(endpoint.repository)}/releases`,
      {
        method: 'POST',
        signal,
        headers: this.headers(endpoint, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tag_name: input.tagName,
          target_commitish: input.targetCommitish,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          draft: input.draft,
          prerelease: input.prerelease,
          ...(input.makeLatest ? { make_latest: input.makeLatest } : {}),
        }),
      },
    );
    return targetRelease(await this.json<ApiRelease>(response));
  }

  async downloadAsset(
    assetDetails: ReleaseAsset,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchImpl(assetDetails.downloadUrl, {
      signal,
      headers: this.headers(this.options.source, {
        Accept: 'application/octet-stream',
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(
        `Release asset download failed: ${sanitizeDiagnostics(response.statusText)}.`,
      );
    }
    return response.body;
  }

  async uploadAsset(
    releaseId: number,
    assetDetails: ReleaseAsset,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const endpoint = this.options.target;
    const uploadBase = (
      endpoint.uploadsUrl ?? 'https://uploads.github.com'
    ).replace(/\/$/, '');
    const url = `${uploadBase}/repos/${encodeURIComponent(endpoint.organization)}/${encodeURIComponent(endpoint.repository)}/releases/${releaseId}/assets?name=${encodeURIComponent(assetDetails.name)}${assetDetails.label ? `&label=${encodeURIComponent(assetDetails.label)}` : ''}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      signal,
      headers: this.headers(endpoint, {
        'Content-Type': assetDetails.contentType,
        'Content-Length': String(assetDetails.size),
      }),
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!response.ok) {
      throw new Error(
        `Release asset upload failed: ${sanitizeDiagnostics(response.statusText)}.`,
      );
    }
  }

  private async list(
    endpoint: ReleaseEndpoint,
    signal: AbortSignal,
  ): Promise<ApiRelease[]> {
    const releases: ApiRelease[] = [];
    for (let page = 1; ; page++) {
      const response = await this.fetchImpl(
        `${baseUrl(endpoint)}/repos/${encodeURIComponent(endpoint.organization)}/${encodeURIComponent(endpoint.repository)}/releases?per_page=100&page=${page}`,
        { signal, headers: this.headers(endpoint) },
      );
      const pageItems = await this.json<ApiRelease[]>(response);
      releases.push(...pageItems);
      if (pageItems.length < 100) return releases;
    }
  }

  private headers(
    endpoint: ReleaseEndpoint,
    extra: Record<string, string> = {},
  ): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${endpoint.token}`,
      ...extra,
    };
  }

  private async json<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(
        `GitHub release API request failed: ${sanitizeDiagnostics(response.statusText)}.`,
      );
    }
    return (await response.json()) as T;
  }
}
