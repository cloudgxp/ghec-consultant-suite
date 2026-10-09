import type { RepositoryAssessment } from '@ghec/contracts';
import {
  PLATFORM_LIMITS,
  type GitSizingStats,
  type SourceInspectorOptions,
} from './types.js';
import { evaluateSizingLimits } from './sizer.js';

interface GitHubRepoResponse {
  id?: number | undefined;
  name?: string | undefined;
  size?: number | undefined; // size in KiB
  default_branch?: string | undefined;
}

interface GitHubReleaseAsset {
  id?: number | undefined;
  name?: string | undefined;
  size?: number | undefined; // size in bytes
}

interface GitHubReleaseResponse {
  id?: number | undefined;
  name?: string | undefined;
  tag_name?: string | undefined;
  assets?: readonly GitHubReleaseAsset[] | undefined;
}

interface GitHubContentResponse {
  content?: string | undefined;
  encoding?: string | undefined;
}

export class SourceRepositoryInspector {
  private readonly adapter: SourceInspectorOptions['adapter'];
  private readonly sourceOrg: string;
  private readonly signal: AbortSignal | undefined;
  private readonly discoveryBundle: SourceInspectorOptions['discoveryBundle'];

  constructor(options: SourceInspectorOptions) {
    this.adapter = options.adapter;
    this.sourceOrg = options.sourceOrg;
    this.signal = options.signal;
    this.discoveryBundle = options.discoveryBundle;
  }

  /**
   * Inspects a single source repository and returns its complete assessment.
   */
  async inspect(
    repoName: string,
    sizingStats?: GitSizingStats | undefined,
  ): Promise<RepositoryAssessment> {
    const blockers: string[] = [];

    // 1. Fetch repository metadata from discovery bundle or GitHub REST API
    let repoSizeFromApi = 0;
    const bundleRepoEntity = this.discoveryBundle?.entities.find(
      (e) => e.kind === 'repository' && e.name === repoName,
    );

    if (bundleRepoEntity && bundleRepoEntity.kind === 'repository') {
      repoSizeFromApi = bundleRepoEntity.size?.value ?? 0;
    } else {
      try {
        const res = await this.adapter.readSingle<GitHubRepoResponse>(
          {
            id: 'rest.repos.get',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}',
            pathParams: { owner: this.sourceOrg, repo: repoName },
          },
          this.signal ?? new AbortController().signal,
        );

        if (res.status === 200 && res.data) {
          repoSizeFromApi = (res.data.size ?? 0) * 1024;
        } else if (res.status === 404) {
          blockers.push(
            `Source repository ${this.sourceOrg}/${repoName} does not exist or is inaccessible (HTTP 404).`,
          );
        } else if (res.status >= 400) {
          blockers.push(
            `Failed to inspect source repository ${this.sourceOrg}/${repoName} (HTTP ${res.status}).`,
          );
        }
      } catch (err) {
        blockers.push(
          `Failed to reach source repository ${this.sourceOrg}/${repoName}: ${(err as Error).message}`,
        );
      }
    }

    // 2. Resolve Git sizing statistics
    const effectiveSizing: GitSizingStats = {
      gitSizeBytes: sizingStats?.gitSizeBytes ?? repoSizeFromApi,
      largestCommitBytes: sizingStats?.largestCommitBytes ?? 0,
      largestBlobBytes: sizingStats?.largestBlobBytes ?? 0,
      longestRefLength: sizingStats?.longestRefLength ?? 0,
    };

    // Evaluate sizing limits
    const sizingEval = evaluateSizingLimits(effectiveSizing);
    blockers.push(...sizingEval.blockers);

    // 3. Inspect releases and release assets
    let releaseCount = 0;
    let releaseTotalAssetBytes = 0;
    try {
      const releasesRes = await this.adapter.fetchAll<GitHubReleaseResponse>(
        {
          id: 'rest.repos.getReleases',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/releases',
          pathParams: { owner: this.sourceOrg, repo: repoName },
          queryParams: { per_page: 100 },
        },
        this.signal ?? new AbortController().signal,
      );

      if (releasesRes.items && releasesRes.items.length > 0) {
        releaseCount = releasesRes.items.length;
        for (const release of releasesRes.items) {
          if (release.assets && Array.isArray(release.assets)) {
            for (const asset of release.assets) {
              releaseTotalAssetBytes += asset.size ?? 0;
            }
          }
        }
      }
    } catch {
      // If fetching releases fails gracefully (e.g. 404 on clean repos or lack of permission), default to 0
      releaseCount = 0;
      releaseTotalAssetBytes = 0;
    }

    // 4. Inspect Git LFS usage
    let lfsObjectCount = 0;
    let lfsTotalBytes = 0;

    // Check bundle first if available
    if (this.discoveryBundle) {
      const repoEntity = this.discoveryBundle.entities.find(
        (e) => e.kind === 'repository' && e.name === repoName,
      );
      if (repoEntity) {
        const lfsEntity = this.discoveryBundle.entities.find(
          (e) => e.kind === 'lfs' && e.repositoryId === repoEntity.id,
        );
        if (lfsEntity && lfsEntity.kind === 'lfs') {
          if (lfsEntity.indicator === 'detected') {
            lfsObjectCount = lfsEntity.objectCount.value ?? 1;
            lfsTotalBytes = lfsEntity.storage.value ?? 1024;
          }
        }
      }
    }

    // If still 0, check for .gitattributes via REST
    if (lfsObjectCount === 0 && lfsTotalBytes === 0) {
      try {
        const attrRes = await this.adapter.readSingle<GitHubContentResponse>(
          {
            id: 'rest.repos.getContent',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/contents/{path}',
            pathParams: {
              owner: this.sourceOrg,
              repo: repoName,
              path: '.gitattributes',
            },
          },
          this.signal ?? new AbortController().signal,
        );

        if (attrRes.status === 200 && attrRes.data?.content) {
          const content = Buffer.from(attrRes.data.content, 'base64').toString(
            'utf-8',
          );
          if (content.includes('filter=lfs')) {
            lfsObjectCount = 1;
            lfsTotalBytes = 1024;
          }
        }
      } catch {
        // .gitattributes does not exist, no LFS detected
      }
    }

    // 5. Determine readiness status
    let status: RepositoryAssessment['status'];
    const finalBlockers: string[] = [];

    if (blockers.length > 0) {
      status = 'blocked';
      finalBlockers.push(...blockers);
    } else if (
      releaseTotalAssetBytes > PLATFORM_LIMITS.MAX_RELEASES_TOTAL_ASSET_BYTES
    ) {
      status = 'requires-special-strategy';
      finalBlockers.push(
        `Total release assets exceed 10 GiB (${releaseTotalAssetBytes} bytes); requires --skip-releases flag and REST release fallback.`,
      );
    } else if (lfsObjectCount > 0 || lfsTotalBytes > 0) {
      status = 'ready-with-follow-up';
      finalBlockers.push(
        'Git LFS objects detected; requires post-migration dual-remote LFS push.',
      );
    } else {
      status = 'ready';
    }

    return {
      repo: repoName,
      gitSizeBytes: effectiveSizing.gitSizeBytes,
      largestCommitBytes: effectiveSizing.largestCommitBytes,
      largestBlobBytes: effectiveSizing.largestBlobBytes,
      longestRefLength: effectiveSizing.longestRefLength,
      lfsObjectCount,
      lfsTotalBytes,
      releaseCount,
      releaseTotalAssetBytes,
      status,
      blockers: finalBlockers,
    };
  }
}
