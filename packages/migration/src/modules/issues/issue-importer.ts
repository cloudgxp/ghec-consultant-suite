import type { TargetWriteClient } from '../../core/types.js';
import type { IssueImportPayload } from './types.js';

export interface IssueImportExecutionResult {
  readonly success: boolean;
  readonly mode: 'preview' | 'rest-fallback' | 'dry-run';
  readonly status: number;
  readonly createdNumber?: number | undefined;
  readonly error?: string | undefined;
}

export async function executeIssueImport(
  targetWriteClient: TargetWriteClient,
  targetOrg: string,
  targetRepo: string,
  payload: IssueImportPayload,
  signal: AbortSignal,
  dryRun: boolean,
): Promise<IssueImportExecutionResult> {
  if (dryRun) {
    return {
      success: true,
      mode: 'dry-run',
      status: 200,
    };
  }

  // 1. Attempt GitHub Issue Import API with golden-comet preview
  try {
    const res = await targetWriteClient.mutate<{
      id?: number;
      status?: string;
    }>(
      {
        id: 'rest.issues.importIssue',
        method: 'POST',
        path: '/repos/{owner}/{repo}/import/issues',
        pathParams: { owner: targetOrg, repo: targetRepo },
        headers: {
          Accept: 'application/vnd.github.golden-comet-preview+json',
        },
        body: payload,
      },
      signal,
    );

    if (res.status >= 200 && res.status < 300) {
      return {
        success: true,
        mode: 'preview',
        status: res.status,
        createdNumber: res.data?.id,
      };
    }
  } catch (err: unknown) {
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status: number }).status
        : 0;

    // Only fallback if preview API is unsupported / not found / rejected
    if (status !== 404 && status !== 415 && status !== 422) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        mode: 'preview',
        status: status || 500,
        error: `Issue Import API failed: ${msg}`,
      };
    }
  }

  // 2. Fallback to standard Issues REST API
  try {
    const issueBodyWithAttribution = payload.issue.created_at
      ? `${payload.issue.body}\n\n*Imported from source repository (created at: ${payload.issue.created_at})*`
      : payload.issue.body;

    const createRes = await targetWriteClient.mutate<{ number: number }>(
      {
        id: 'rest.issues.createIssue',
        method: 'POST',
        path: '/repos/{owner}/{repo}/issues',
        pathParams: { owner: targetOrg, repo: targetRepo },
        body: {
          title: payload.issue.title,
          body: issueBodyWithAttribution,
          labels: payload.issue.labels,
          milestone: payload.issue.milestone,
        },
      },
      signal,
    );

    if (
      createRes.status < 200 ||
      createRes.status >= 300 ||
      !createRes.data?.number
    ) {
      return {
        success: false,
        mode: 'rest-fallback',
        status: createRes.status,
        error: `Standard issue creation returned status ${createRes.status}`,
      };
    }

    const issueNumber = createRes.data.number;

    // Close issue if source issue was closed
    if (payload.issue.closed) {
      await targetWriteClient.mutate(
        {
          id: 'rest.issues.updateIssueState',
          method: 'PATCH',
          path: '/repos/{owner}/{repo}/issues/{issue_number}',
          pathParams: {
            owner: targetOrg,
            repo: targetRepo,
            issue_number: String(issueNumber),
          },
          body: { state: 'closed' },
        },
        signal,
      );
    }

    // Replay comments
    if (payload.comments && payload.comments.length > 0) {
      for (const comment of payload.comments) {
        const commentBody = comment.created_at
          ? `${comment.body}\n\n*Original comment date: ${comment.created_at}*`
          : comment.body;

        await targetWriteClient.mutate(
          {
            id: 'rest.issues.createComment',
            method: 'POST',
            path: '/repos/{owner}/{repo}/issues/{issue_number}/comments',
            pathParams: {
              owner: targetOrg,
              repo: targetRepo,
              issue_number: String(issueNumber),
            },
            body: { body: commentBody },
          },
          signal,
        );
      }
    }

    return {
      success: true,
      mode: 'rest-fallback',
      status: createRes.status,
      createdNumber: issueNumber,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      mode: 'rest-fallback',
      status: 500,
      error: `Fallback REST issue creation failed: ${msg}`,
    };
  }
}
