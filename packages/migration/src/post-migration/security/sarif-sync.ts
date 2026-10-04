import type { GitHubReadAdapter } from '@ghec/github-client';
import type { MigrationContext } from '../../core/types.js';
import type { SarifAnalysisRecord } from './types.js';

export const SARIF_LIMITATION_NOTICE =
  'Code scanning alerts uploaded via SARIF reflect the PAT owner as the actor and the upload execution timestamp. Alert dismissals and custom resolution reasons from the source repository are omitted from SARIF uploads.';

export async function fetchCodeScanningAnalyses(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  client?: GitHubReadAdapter,
): Promise<SarifAnalysisRecord[]> {
  const readClient =
    client ??
    (owner === ctx.scope.sourceOrg ? ctx.sourceClient : ctx.targetClient);

  try {
    const response = await readClient.readSingle<
      SarifAnalysisRecord[] | { analyses?: SarifAnalysisRecord[] }
    >(
      {
        id: 'rest.codeScanning.listAnalyses',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/code-scanning/analyses',
        pathParams: { owner, repo },
        queryParams: { per_page: '10' },
      },
      ctx.signal,
    );

    if (Array.isArray(response.data)) {
      return response.data;
    }
    if (response.data && Array.isArray(response.data.analyses)) {
      return response.data.analyses;
    }
    return [];
  } catch (err) {
    ctx.logger.warn(
      `Could not list code scanning analyses for ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

export interface SarifUploadPayload {
  readonly commit_sha: string;
  readonly ref: string;
  readonly sarif: string;
  readonly tool_name?: string | undefined;
}

export async function uploadSarif(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  payload: SarifUploadPayload,
): Promise<{
  status: number;
  id?: string | undefined;
  error?: string | undefined;
}> {
  if (!ctx.targetWriteClient) {
    return {
      status: 400,
      error: 'TargetWriteClient required for SARIF upload',
    };
  }

  try {
    const response = await ctx.targetWriteClient.mutate<{ id?: string }>(
      {
        id: 'rest.codeScanning.uploadSarif',
        method: 'POST',
        path: '/repos/{owner}/{repo}/code-scanning/sarifs',
        pathParams: { owner, repo },
        body: payload,
      },
      ctx.signal,
    );

    return {
      status: response.status,
      id: response.data?.id,
    };
  } catch (err) {
    return {
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
