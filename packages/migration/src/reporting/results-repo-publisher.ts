import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import { sanitizeDiagnostics } from '@ghec/github-client';
import type {
  StructuredLogger,
  TargetWriteClient,
  TargetWriteOperation,
} from '../core/types.js';

export interface ResultsRepoPublisherOptions {
  readonly targetOrg: string;
  readonly repoName?: string | undefined;
  readonly targetClient: GitHubReadAdapter;
  readonly targetWriteClient?: TargetWriteClient | undefined;
  readonly dryRun?: boolean | undefined;
  readonly branch?: string | undefined;
  readonly commitMessage?: string | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface EnsureRepositoryResult {
  readonly created: boolean;
  readonly exists: boolean;
  readonly dryRun: boolean;
}

export interface PublishCommitResult {
  readonly commitSha: string;
  readonly filesCommitted: number;
  readonly dryRun: boolean;
  readonly repoUrl: string;
}

export class MigrationResultsRepoPublisher {
  private readonly targetOrg: string;
  private readonly repoName: string;
  private readonly targetClient: GitHubReadAdapter;
  private readonly targetWriteClient?: TargetWriteClient | undefined;
  private readonly dryRun: boolean;
  private readonly branch: string;
  private readonly commitMessage: string;
  private readonly logger?: StructuredLogger | undefined;
  private readonly signal: AbortSignal;

  constructor(options: ResultsRepoPublisherOptions) {
    this.targetOrg = options.targetOrg;
    this.repoName = options.repoName ?? 'gei-migration-results';
    this.targetClient = options.targetClient;
    this.targetWriteClient = options.targetWriteClient;
    this.dryRun = options.dryRun ?? false;
    this.branch = options.branch ?? 'main';
    this.commitMessage =
      options.commitMessage ??
      'chore: publish automated migration results and audit logs [skip ci]';
    this.logger = options.logger;
    this.signal = options.signal ?? new AbortController().signal;
  }

  /**
   * Checks whether the target results repository exists and creates it if missing.
   */
  async ensureTargetRepository(): Promise<EnsureRepositoryResult> {
    try {
      const readOp: ReadOperation = {
        id: `check-results-repo-${this.repoName}`,
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}',
        pathParams: {
          owner: this.targetOrg,
          repo: this.repoName,
        },
      };

      try {
        const response = await this.targetClient.readSingle(
          readOp,
          this.signal,
        );
        if (response.status === 200) {
          this.logger?.info('Target results repository already exists', {
            targetOrg: this.targetOrg,
            repoName: this.repoName,
          });
          return { created: false, exists: true, dryRun: this.dryRun };
        }
      } catch (err: unknown) {
        // If not found (404), proceed to creation
        const msg = err instanceof Error ? err.message : String(err);
        if (
          !msg.includes('404') &&
          !msg.includes('not_found') &&
          !msg.includes('Not Found')
        ) {
          throw err;
        }
      }

      if (this.dryRun) {
        this.logger?.info(
          `[dry-run] Planned creation of target audit repository ${this.targetOrg}/${this.repoName}`,
        );
        return { created: true, exists: false, dryRun: true };
      }

      if (!this.targetWriteClient) {
        throw new Error(
          'TargetWriteClient must be configured to create target results repository in live mode.',
        );
      }

      const createOp: TargetWriteOperation = {
        id: `create-results-repo-${this.repoName}`,
        method: 'POST',
        path: '/orgs/{org}/repos',
        pathParams: { org: this.targetOrg },
        body: {
          name: this.repoName,
          private: true,
          description:
            'Migration audit logs and results for organization transfer',
          auto_init: true,
        },
      };

      await this.targetWriteClient.mutate(createOp, this.signal);
      this.logger?.info('Created target results repository', {
        targetOrg: this.targetOrg,
        repoName: this.repoName,
      });

      return { created: true, exists: true, dryRun: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to ensure target results repository ${this.targetOrg}/${this.repoName}: ${sanitizeDiagnostics(msg)}`,
        { cause: err },
      );
    }
  }

  /**
   * Commits all provided files in a single atomic transaction using the GitHub Git Data API.
   */
  async publishAtomicCommit(
    files: Record<string, string>,
  ): Promise<PublishCommitResult> {
    const fileCount = Object.keys(files).length;
    const repoUrl = `https://github.com/${this.targetOrg}/${this.repoName}`;

    if (fileCount === 0) {
      return {
        commitSha: 'empty',
        filesCommitted: 0,
        dryRun: this.dryRun,
        repoUrl,
      };
    }

    if (this.dryRun) {
      this.logger?.info(
        `[dry-run] Planned atomic commit of ${fileCount} files to ${this.targetOrg}/${this.repoName}:${this.branch}`,
      );
      return {
        commitSha: 'dry-run-sha',
        filesCommitted: fileCount,
        dryRun: true,
        repoUrl,
      };
    }

    if (!this.targetWriteClient) {
      throw new Error(
        'TargetWriteClient must be configured to commit migration results in live mode.',
      );
    }

    try {
      // 1. Resolve base commit SHA for target branch
      let parentCommitSha: string | undefined;
      try {
        const refOp: ReadOperation = {
          id: `get-branch-ref-${this.branch}`,
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/repos/{owner}/{repo}/git/ref/heads/{branch}',
          pathParams: {
            owner: this.targetOrg,
            repo: this.repoName,
            branch: this.branch,
          },
        };
        const refRes = await this.targetClient.readSingle<{
          object: { sha: string };
        }>(refOp, this.signal);
        parentCommitSha = refRes.data.object.sha;
      } catch {
        // Branch might not have any commits or might be auto-initializing
      }

      // 2. Create blobs for each file
      const treeEntries: {
        path: string;
        mode: '100644';
        type: 'blob';
        sha: string;
      }[] = [];

      for (const [filePath, content] of Object.entries(files)) {
        const blobOp: TargetWriteOperation = {
          id: `create-blob-${filePath.replaceAll('/', '-')}`,
          method: 'POST',
          path: '/repos/{owner}/{repo}/git/blobs',
          pathParams: { owner: this.targetOrg, repo: this.repoName },
          body: {
            content,
            encoding: 'utf-8',
          },
        };

        const blobRes = await this.targetWriteClient.mutate<{
          sha: string;
        }>(blobOp, this.signal);

        const sha = blobRes.data?.sha;
        if (!sha) {
          throw new Error(`Failed to create Git blob for file: ${filePath}`);
        }

        treeEntries.push({
          path: filePath,
          mode: '100644',
          type: 'blob',
          sha,
        });
      }

      // 3. Create Tree
      const treeOp: TargetWriteOperation = {
        id: 'create-results-tree',
        method: 'POST',
        path: '/repos/{owner}/{repo}/git/trees',
        pathParams: { owner: this.targetOrg, repo: this.repoName },
        body: parentCommitSha
          ? {
              base_tree: parentCommitSha,
              tree: treeEntries,
            }
          : {
              tree: treeEntries,
            },
      };

      const treeRes = await this.targetWriteClient.mutate<{ sha: string }>(
        treeOp,
        this.signal,
      );
      const treeSha = treeRes.data?.sha;
      if (!treeSha) {
        throw new Error('Failed to create Git tree for migration results.');
      }

      // 4. Create Commit
      const commitOp: TargetWriteOperation = {
        id: 'create-results-commit',
        method: 'POST',
        path: '/repos/{owner}/{repo}/git/commits',
        pathParams: { owner: this.targetOrg, repo: this.repoName },
        body: {
          message: this.commitMessage,
          tree: treeSha,
          parents: parentCommitSha ? [parentCommitSha] : [],
        },
      };

      const commitRes = await this.targetWriteClient.mutate<{ sha: string }>(
        commitOp,
        this.signal,
      );
      const newCommitSha = commitRes.data?.sha;
      if (!newCommitSha) {
        throw new Error('Failed to create Git commit for migration results.');
      }

      // 5. Update Branch Ref
      const updateRefOp: TargetWriteOperation = {
        id: 'update-results-ref',
        method: parentCommitSha ? 'PATCH' : 'POST',
        path: parentCommitSha
          ? '/repos/{owner}/{repo}/git/refs/heads/{branch}'
          : '/repos/{owner}/{repo}/git/refs',
        pathParams: {
          owner: this.targetOrg,
          repo: this.repoName,
          branch: this.branch,
        },
        body: parentCommitSha
          ? {
              sha: newCommitSha,
              force: false,
            }
          : {
              ref: `refs/heads/${this.branch}`,
              sha: newCommitSha,
            },
      };

      await this.targetWriteClient.mutate(updateRefOp, this.signal);

      this.logger?.info('Published atomic commit for migration results', {
        targetOrg: this.targetOrg,
        repoName: this.repoName,
        commitSha: newCommitSha,
        fileCount,
      });

      return {
        commitSha: newCommitSha,
        filesCommitted: fileCount,
        dryRun: false,
        repoUrl,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to publish migration results commit to ${this.targetOrg}/${this.repoName}: ${sanitizeDiagnostics(msg)}`,
        { cause: err },
      );
    }
  }

  /**
   * High-level entry point: ensures target repository exists and publishes files atomically.
   */
  async publish(files: Record<string, string>): Promise<PublishCommitResult> {
    await this.ensureTargetRepository();
    return this.publishAtomicCommit(files);
  }
}
