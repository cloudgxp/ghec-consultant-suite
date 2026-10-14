import type { TargetWriteClient } from '../../core/types.js';
import type { RepositoryVisibility } from './types.js';

export interface ReconcileVisibilityResult {
  readonly repositoryName: string;
  readonly targetOrg: string;
  readonly previousVisibility?: RepositoryVisibility;
  readonly restoredVisibility: RepositoryVisibility;
  readonly reconciled: boolean;
  readonly error?: string;
}

export async function reconcilePostGeiVisibility(
  targetWriteClient: TargetWriteClient,
  targetOrg: string,
  targetRepo: string,
  sourceVisibility: RepositoryVisibility,
  signal: AbortSignal = AbortSignal.timeout(30_000),
): Promise<ReconcileVisibilityResult> {
  // GEI forces destination repositories to 'private'.
  // If the source was already private, no mutation is required.
  if (sourceVisibility === 'private') {
    return {
      repositoryName: targetRepo,
      targetOrg,
      previousVisibility: 'private',
      restoredVisibility: 'private',
      reconciled: false,
    };
  }

  try {
    const res = await targetWriteClient.mutate<{ visibility?: string }>(
      {
        id: 'rest.repos.updateVisibility',
        method: 'PATCH',
        path: '/repos/{owner}/{repo}',
        pathParams: { owner: targetOrg, repo: targetRepo },
        body: { visibility: sourceVisibility },
      },
      signal,
    );

    if (res.status >= 200 && res.status < 300) {
      return {
        repositoryName: targetRepo,
        targetOrg,
        previousVisibility: 'private',
        restoredVisibility: sourceVisibility,
        reconciled: true,
      };
    }

    // Handle enterprise policy fallback (EMU disallows public -> fallback to internal)
    if (res.status === 422 && sourceVisibility === 'public') {
      const fallbackRes = await targetWriteClient.mutate<{
        visibility?: string;
      }>(
        {
          id: 'rest.repos.updateVisibilityFallback',
          method: 'PATCH',
          path: '/repos/{owner}/{repo}',
          pathParams: { owner: targetOrg, repo: targetRepo },
          body: { visibility: 'internal' },
        },
        signal,
      );

      if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
        return {
          repositoryName: targetRepo,
          targetOrg,
          previousVisibility: 'private',
          restoredVisibility: 'internal',
          reconciled: true,
        };
      }
    }

    return {
      repositoryName: targetRepo,
      targetOrg,
      previousVisibility: 'private',
      restoredVisibility: 'private',
      reconciled: false,
      error: `Failed to update visibility: HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      repositoryName: targetRepo,
      targetOrg,
      previousVisibility: 'private',
      restoredVisibility: 'private',
      reconciled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
