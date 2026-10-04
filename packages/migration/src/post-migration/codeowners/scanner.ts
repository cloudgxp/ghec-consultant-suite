import type { GitHubReadAdapter } from '@ghec/github-client';
import type { MigrationContext } from '../../core/types.js';
import type { CodeownersFileCandidate, RawContentResponse } from './types.js';

const CANDIDATE_STATIC_PATHS = [
  '.github/CODEOWNERS',
  'docs/CODEOWNERS',
  'CODEOWNERS',
] as const;

const CANDIDATE_DIRECTORIES = [
  '.github/ISSUE_TEMPLATE',
  '.github/workflows',
] as const;

function isAllowedExtension(filePath: string): boolean {
  return (
    filePath.endsWith('.md') ||
    filePath.endsWith('.yml') ||
    filePath.endsWith('.yaml')
  );
}

function decodeBase64(content: string): string {
  try {
    return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8');
  } catch {
    return content;
  }
}

export async function fetchFileContent(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  filePath: string,
  client?: GitHubReadAdapter,
): Promise<CodeownersFileCandidate | undefined> {
  const readClient =
    client ??
    (owner === ctx.scope.sourceOrg ? ctx.sourceClient : ctx.targetClient);
  try {
    const response = await readClient.readSingle<RawContentResponse>(
      {
        id: 'rest.repos.getContent',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/contents/{path}',
        pathParams: { owner, repo, path: filePath },
      },
      ctx.signal,
    );

    const data = response.data;
    if (!data || data.type !== 'file' || !data.content || !data.sha) {
      return undefined;
    }

    const decoded = decodeBase64(data.content);
    return {
      path: filePath,
      sha: data.sha,
      rawContent: data.content,
      decodedContent: decoded,
    };
  } catch {
    return undefined;
  }
}

export async function scanCodeownersCandidates(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  client?: GitHubReadAdapter,
): Promise<CodeownersFileCandidate[]> {
  const readClient =
    client ??
    (owner === ctx.scope.sourceOrg ? ctx.sourceClient : ctx.targetClient);
  const discoveredFiles: CodeownersFileCandidate[] = [];
  const scannedPaths = new Set<string>();

  // 1. Check static CODEOWNERS paths
  for (const staticPath of CANDIDATE_STATIC_PATHS) {
    const file = await fetchFileContent(
      ctx,
      owner,
      repo,
      staticPath,
      readClient,
    );
    if (file && !scannedPaths.has(file.path)) {
      scannedPaths.add(file.path);
      discoveredFiles.push(file);
    }
  }

  // 2. Inspect directories
  for (const dirPath of CANDIDATE_DIRECTORIES) {
    try {
      const response = await readClient.readSingle<
        RawContentResponse | readonly RawContentResponse[]
      >(
        {
          id: 'rest.repos.getContentDir',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/contents/{path}',
          pathParams: { owner, repo, path: dirPath },
        },
        ctx.signal,
      );

      const items = Array.isArray(response.data) ? response.data : [];
      for (const item of items) {
        if (
          item.type === 'file' &&
          item.path &&
          isAllowedExtension(item.path) &&
          !scannedPaths.has(item.path)
        ) {
          const file = await fetchFileContent(
            ctx,
            owner,
            repo,
            item.path,
            readClient,
          );
          if (file) {
            scannedPaths.add(file.path);
            discoveredFiles.push(file);
          }
        }
      }
    } catch {
      // Directory may not exist in repository; safely continue
    }
  }

  return discoveredFiles;
}
