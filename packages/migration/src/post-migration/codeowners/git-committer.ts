import type { MigrationContext } from '../../core/types.js';
import type { CodeownersFileDiff } from './types.js';

export interface ApplyFileResult {
  readonly path: string;
  readonly status: 'succeeded' | 'failed';
  readonly mode: 'direct-commit' | 'pull-request';
  readonly httpStatus?: number | undefined;
  readonly pullRequestUrl?: string | undefined;
  readonly error?: string | undefined;
  readonly warning?: string | undefined;
}

const COMMIT_MESSAGE =
  'chore: update CODEOWNERS team references for GHEC-EMU migration';

export async function applyFileRepair(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  diff: CodeownersFileDiff,
  options: {
    mode?: 'direct-commit' | 'pull-request' | 'auto' | undefined;
    defaultBranch?: string | undefined;
  } = {},
): Promise<ApplyFileResult> {
  const mode = options.mode ?? 'auto';
  const defaultBranch = options.defaultBranch ?? 'main';
  const newContentBase64 = Buffer.from(diff.updatedContent, 'utf8').toString(
    'base64',
  );

  if (mode !== 'pull-request') {
    // Attempt direct commit to default branch first
    try {
      const response = await ctx.targetWriteClient!.mutate(
        {
          id: 'rest.repos.createOrUpdateFileContents',
          method: 'PUT',
          path: '/repos/{owner}/{repo}/contents/{path}',
          pathParams: { owner, repo, path: diff.path },
          body: {
            message: COMMIT_MESSAGE,
            content: newContentBase64,
            sha: diff.sha,
            branch: defaultBranch,
          },
        },
        ctx.signal,
      );

      if (response.status >= 200 && response.status < 300) {
        return {
          path: diff.path,
          status: 'succeeded',
          mode: 'direct-commit',
          httpStatus: response.status,
        };
      }

      // If status indicates branch protection or permission block and auto mode is enabled, fall back to PR
      if (
        mode === 'auto' &&
        (response.status === 403 ||
          response.status === 404 ||
          response.status === 422)
      ) {
        ctx.logger.warn(
          `Direct commit to ${diff.path} on branch ${defaultBranch} returned HTTP ${response.status}; falling back to pull request branch.`,
        );
      } else {
        return {
          path: diff.path,
          status: 'failed',
          mode: 'direct-commit',
          httpStatus: response.status,
          error: `Direct commit failed with HTTP ${response.status}`,
        };
      }
    } catch (err) {
      if (mode !== 'auto') {
        return {
          path: diff.path,
          status: 'failed',
          mode: 'direct-commit',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  // Pull request creation fallback
  try {
    const prBranch = 'migration/repair-team-references';

    // 1. Commit file to PR branch
    const fileRes = await ctx.targetWriteClient!.mutate(
      {
        id: 'rest.repos.createOrUpdateFileContentsPrBranch',
        method: 'PUT',
        path: '/repos/{owner}/{repo}/contents/{path}',
        pathParams: { owner, repo, path: diff.path },
        body: {
          message: COMMIT_MESSAGE,
          content: newContentBase64,
          sha: diff.sha,
          branch: prBranch,
        },
      },
      ctx.signal,
    );

    if (fileRes.status >= 300 && fileRes.status !== 409) {
      return {
        path: diff.path,
        status: 'failed',
        mode: 'pull-request',
        httpStatus: fileRes.status,
        error: `Failed to commit to PR branch ${prBranch}: HTTP ${fileRes.status}`,
      };
    }

    // 2. Open pull request
    const prRes = await ctx.targetWriteClient!.mutate<{
      html_url?: string;
    }>(
      {
        id: 'rest.repos.createPullRequest',
        method: 'POST',
        path: '/repos/{owner}/{repo}/pulls',
        pathParams: { owner, repo },
        body: {
          title: COMMIT_MESSAGE,
          head: prBranch,
          base: defaultBranch,
          body: `Automated repair of team references for GHEC-EMU migration.\n\nUpdated files:\n- \`${diff.path}\``,
        },
      },
      ctx.signal,
    );

    const prUrl = prRes.data?.html_url;
    return {
      path: diff.path,
      status:
        prRes.status < 300 || prRes.status === 422 ? 'succeeded' : 'failed',
      mode: 'pull-request',
      httpStatus: prRes.status,
      pullRequestUrl: prUrl,
      warning:
        'Direct commit blocked by branch protection; pull request created instead.',
    };
  } catch (err) {
    return {
      path: diff.path,
      status: 'failed',
      mode: 'pull-request',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
