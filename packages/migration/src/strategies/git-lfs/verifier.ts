import type { GitHubReadAdapter } from '@ghec/github-client';

interface ContentResponse {
  readonly content?: string;
  readonly encoding?: string;
}

/** Reads `.gitattributes` through the reviewed read-only adapter. */
export async function repositoryUsesLfs(
  client: GitHubReadAdapter,
  owner: string,
  repository: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await client.readSingle<ContentResponse>(
      {
        id: 'rest.repos.get-content',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/contents/{path}',
        pathParams: { owner, repo: repository, path: '.gitattributes' },
      },
      signal,
    );
    if (!response.data.content || response.data.encoding !== 'base64')
      return false;
    return Buffer.from(response.data.content, 'base64')
      .toString('utf8')
      .includes('filter=lfs');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status?: unknown }).status === 404
    ) {
      return false;
    }
    throw error;
  }
}

/** Confirms the target retains LFS tracking after object push. */
export async function verifyTargetLfsAvailability(
  targetClient: GitHubReadAdapter,
  targetOrg: string,
  targetRepo: string,
  signal: AbortSignal,
): Promise<void> {
  await targetClient.readSingle(
    {
      id: 'rest.repos.get',
      transport: 'rest',
      verifiedReadOnly: true,
      path: '/repos/{owner}/{repo}',
      pathParams: { owner: targetOrg, repo: targetRepo },
    },
    signal,
  );
  if (!(await repositoryUsesLfs(targetClient, targetOrg, targetRepo, signal))) {
    throw new Error(
      `Target ${targetOrg}/${targetRepo} does not expose an LFS tracking rule after transfer.`,
    );
  }
}
