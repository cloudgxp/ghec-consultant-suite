import type { TargetWriteClient } from '../../core/types.js';
import type { CreatePullRequestPayload } from './types.js';

export interface PrRecreationResult {
  readonly success: boolean;
  readonly createdNumber?: number | undefined;
  readonly error?: string | undefined;
}

export async function recreatePullRequest(
  targetWriteClient: TargetWriteClient,
  targetOrg: string,
  targetRepo: string,
  payload: CreatePullRequestPayload,
  signal: AbortSignal,
  dryRun: boolean,
): Promise<PrRecreationResult> {
  if (dryRun) {
    return { success: true };
  }

  const attributionFooter = `\n\n---\n*Recreated during migration from source PR #${payload.sourceNumber}*`;
  const pullBody = `${payload.body}${attributionFooter}`;

  try {
    const res = await targetWriteClient.mutate<{ number: number }>(
      {
        id: 'rest.pulls.createPull',
        method: 'POST',
        path: '/repos/{owner}/{repo}/pulls',
        pathParams: { owner: targetOrg, repo: targetRepo },
        body: {
          title: payload.title,
          body: pullBody,
          head: payload.head,
          base: payload.base,
        },
      },
      signal,
    );

    if (res.status < 200 || res.status >= 300 || !res.data?.number) {
      return {
        success: false,
        error: `Failed to create pull request: HTTP ${res.status}`,
      };
    }

    const prNumber = res.data.number;

    // Apply labels if any
    if (payload.labels && payload.labels.length > 0) {
      try {
        await targetWriteClient.mutate(
          {
            id: 'rest.issues.addLabels',
            method: 'POST',
            path: '/repos/{owner}/{repo}/issues/{issue_number}/labels',
            pathParams: {
              owner: targetOrg,
              repo: targetRepo,
              issue_number: String(prNumber),
            },
            body: { labels: payload.labels },
          },
          signal,
        );
      } catch {
        // Labels failure is non-fatal for PR recreation
      }
    }

    // Replay discussion comments if any
    if (payload.comments && payload.comments.length > 0) {
      for (const comment of payload.comments) {
        const commentBody = `${comment.body}\n\n*Original comment by ${comment.author ?? 'unknown'} on ${comment.createdAt}*`;
        try {
          await targetWriteClient.mutate(
            {
              id: 'rest.issues.createComment',
              method: 'POST',
              path: '/repos/{owner}/{repo}/issues/{issue_number}/comments',
              pathParams: {
                owner: targetOrg,
                repo: targetRepo,
                issue_number: String(prNumber),
              },
              body: { body: commentBody },
            },
            signal,
          );
        } catch {
          // Comment replay failure is non-fatal
        }
      }
    }

    return {
      success: true,
      createdNumber: prNumber,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Pull request recreation failed: ${msg}`,
    };
  }
}
