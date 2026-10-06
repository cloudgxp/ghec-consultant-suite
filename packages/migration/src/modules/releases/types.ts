export interface MigrationReleaseAsset {
  readonly id: number;
  readonly name: string;
  readonly label?: string | null | undefined;
  readonly contentType: string;
  readonly size: number;
  readonly downloadUrl: string;
}

export interface MigrationRelease {
  readonly id: number;
  readonly tagName: string;
  readonly targetCommitish: string;
  readonly name?: string | null | undefined;
  readonly body?: string | null | undefined;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly makeLatest?: 'true' | 'false' | 'legacy' | undefined;
  readonly createdAt: string;
  readonly publishedAt?: string | null | undefined;
  readonly assets: readonly MigrationReleaseAsset[];
}

export interface ReleasesMigrationData {
  readonly repo: string;
  readonly releases: readonly MigrationRelease[];
}

export interface ReleasesModuleOptions {
  readonly maxAssetSizeBytes?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface RawApiAsset {
  readonly id: number;
  readonly name: string;
  readonly label?: string | null | undefined;
  readonly content_type?: string | undefined;
  readonly size?: number | undefined;
  readonly url?: string | undefined;
  readonly browser_download_url?: string | undefined;
}

export interface RawApiRelease {
  readonly id: number;
  readonly tag_name: string;
  readonly target_commitish?: string | undefined;
  readonly name?: string | null | undefined;
  readonly body?: string | null | undefined;
  readonly draft?: boolean | undefined;
  readonly prerelease?: boolean | undefined;
  readonly make_latest?: 'true' | 'false' | 'legacy' | undefined;
  readonly created_at?: string | undefined;
  readonly published_at?: string | null | undefined;
  readonly assets?: readonly RawApiAsset[] | undefined;
}
