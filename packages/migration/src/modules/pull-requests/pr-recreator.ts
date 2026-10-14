import type { GitHubReadAdapter } from '@ghec/github-client';
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
  targetClient?: GitHubReadAdapter,
): Promise<PrRecreationResult> {
  if (dryRun) {
    return { success: true };
  }

  const attributionFooter = `\n\n---\n*Recreated during migration from source PR #${payload.sourceNumber}*`;
  const pullBody = `${payload.body}${attributionFooter}`;

  try {
    let res: { status: number; data?: { number: number } | undefined };
    try {
      res = await targetWriteClient.mutate<{ number: number }>(
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
    } catch (createErr: unknown) {
      const createMsg =
        createErr instanceof Error ? createErr.message : String(createErr);
      if (createMsg.toLowerCase().includes('a pull request already exists')) {
        return { success: true };
      }
      if (
        (createMsg.includes('422') ||
          createMsg.toLowerCase().includes('validation failed')) &&
        targetClient
      ) {
        // Head branch may be missing on target (e.g. shallow single-branch clone or fork PR)
        let baseSha: string | undefined;
        try {
          const refRes = await targetClient.readSingle<{
            object?: { sha?: string };
          }>(
            {
              id: 'rest.git.getBaseRef',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}/git/ref/heads/{branch}',
              pathParams: {
                owner: targetOrg,
                repo: targetRepo,
                branch: payload.base,
              },
            },
            signal,
          );
          baseSha = refRes.data?.object?.sha;
        } catch {
          baseSha = undefined;
        }

        if (baseSha) {
          try {
            await targetWriteClient.mutate(
              {
                id: 'rest.git.createHeadRef',
                method: 'POST',
                path: '/repos/{owner}/{repo}/git/refs',
                pathParams: { owner: targetOrg, repo: targetRepo },
                body: {
                  ref: `refs/heads/${payload.head}`,
                  sha: baseSha,
                },
              },
              signal,
            );
          } catch {
            // Ref may already exist with 0 commits ahead of base
          }

          await targetWriteClient.mutate(
            {
              id: 'rest.repos.createPrMarkerFile',
              method: 'PUT',
              path: '/repos/{owner}/{repo}/contents/{path}',
              pathParams: {
                owner: targetOrg,
                repo: targetRepo,
                path: `.github/migrated-pr-${payload.sourceNumber}.md`,
              },
              body: {
                message: `chore(migration): recreate head branch for PR #${payload.sourceNumber}`,
                content: Buffer.from(
                  `# Migrated Pull Request #${payload.sourceNumber}\n\n${payload.title}\n`,
                  'utf8',
                ).toString('base64'),
                branch: payload.head,
              },
            },
            signal,
          );

          res = await targetWriteClient.mutate<{ number: number }>(
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
        } else {
          throw createErr;
        }
      } else {
        throw createErr;
      }
    }

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
    if (msg.toLowerCase().includes('a pull request already exists')) {
      return {
        success: true,
      };
    }
    return {
      success: false,
      error: `Pull request recreation failed: ${msg}`,
    };
  }
}
