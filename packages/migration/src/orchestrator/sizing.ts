import type { GitHubReadAdapter } from '@ghec/github-client';
import { repositoryUsesLfs } from '../strategies/git-lfs/verifier.js';

export interface RepositorySizingProfile {
  readonly repositoryName: string;
  readonly gitDiskUsageBytes: number;
  readonly gitLfsObjectCount: number;
  readonly gitLfsTotalBytes: number;
  readonly releaseCount: number;
  readonly releaseAssetsTotalBytes: number;
  readonly estimatedScratchBytes: number;
  readonly sourceVisibility: 'public' | 'internal' | 'private';
}

interface RepoDetailsResponse {
  readonly size: number; // size in KiB
  readonly visibility?: string;
  readonly private?: boolean;
}

interface ReleaseAsset {
  readonly size: number;
}

interface ReleaseItem {
  readonly assets?: readonly ReleaseAsset[];
}

export async function assessRepositorySizing(
  client: GitHubReadAdapter,
  owner: string,
  repo: string,
  signal: AbortSignal = AbortSignal.timeout(30_000),
): Promise<RepositorySizingProfile> {
  // 1. Fetch repo details (size in KiB, visibility)
  let gitDiskUsageBytes: number;
  let sourceVisibility: 'public' | 'internal' | 'private';

  try {
    const repoRes = await client.readSingle<RepoDetailsResponse>(
      {
        id: 'rest.repos.get',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}',
        pathParams: { owner, repo },
      },
      signal,
    );

    const sizeKiB = repoRes.data.size ?? 0;
    gitDiskUsageBytes = sizeKiB * 1024;

    if (repoRes.data.visibility === 'public') {
      sourceVisibility = 'public';
    } else if (repoRes.data.visibility === 'internal') {
      sourceVisibility = 'internal';
    } else {
      sourceVisibility = repoRes.data.private ? 'private' : 'public';
    }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status?: unknown }).status === 404
    ) {
      throw new Error(
        `Repository ${owner}/${repo} not found on source tenant.`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }

  // 2. Query releases and aggregate release asset byte volume
  let releaseCount = 0;
  let releaseAssetsTotalBytes = 0;

  try {
    const releasesRes = await client.readSingle<readonly ReleaseItem[]>(
      {
        id: 'rest.repos.list-releases',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/releases',
        pathParams: { owner, repo },
      },
      signal,
    );

    if (Array.isArray(releasesRes.data)) {
      releaseCount = releasesRes.data.length;
      for (const rel of releasesRes.data) {
        if (Array.isArray(rel.assets)) {
          for (const asset of rel.assets) {
            releaseAssetsTotalBytes += asset.size || 0;
          }
        }
      }
    }
  } catch {
    // Non-fatal if releases endpoint is unavailable or empty
    releaseCount = 0;
    releaseAssetsTotalBytes = 0;
  }

  // 3. Query LFS presence
  let hasLfs: boolean;
  try {
    hasLfs = await repositoryUsesLfs(client, owner, repo, signal);
  } catch {
    hasLfs = false;
  }

  const gitLfsObjectCount = hasLfs ? 1 : 0;
  const gitLfsTotalBytes = hasLfs ? 1048576 : 0; // Baseline indicator if present

  // 4. Calculate estimated scratch space
  // Repositories with >10 GiB releases stream chunk-by-chunk without full disk buffering
  const TEN_GIB = 10 * 1024 * 1024 * 1024;
  const estimatedScratchBytes = Math.ceil(
    gitDiskUsageBytes * 1.5 +
      (releaseAssetsTotalBytes > TEN_GIB ? 0 : releaseAssetsTotalBytes),
  );

  return {
    repositoryName: repo,
    gitDiskUsageBytes,
    gitLfsObjectCount,
    gitLfsTotalBytes,
    releaseCount,
    releaseAssetsTotalBytes,
    estimatedScratchBytes,
    sourceVisibility,
  };
}
