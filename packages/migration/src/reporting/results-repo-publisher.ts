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
  readonly enablePages?: boolean | undefined;
  readonly logger?: StructuredLogger | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface EnsureRepositoryResult {
  readonly created: boolean;
  readonly exists: boolean;
  readonly dryRun: boolean;
}

export interface EnsurePagesResult {
  readonly enabled: boolean;
  readonly pagesUrl?: string | undefined;
  readonly dryRun: boolean;
}

export interface PublishCommitResult {
  readonly commitSha: string;
  readonly filesCommitted: number;
  readonly dryRun: boolean;
  readonly repoUrl: string;
  readonly pagesUrl?: string | undefined;
  readonly pagesEnabled?: boolean | undefined;
}

export class MigrationResultsRepoPublisher {
  private readonly targetOrg: string;
  private readonly repoName: string;
  private readonly targetClient: GitHubReadAdapter;
  private readonly targetWriteClient?: TargetWriteClient | undefined;
  private readonly dryRun: boolean;
  private readonly branch: string;
  private readonly commitMessage: string;
  private readonly enablePages?: boolean | undefined;
  private readonly logger?: StructuredLogger | undefined;
  private readonly signal: AbortSignal;

  constructor(options: ResultsRepoPublisherOptions) {
    this.targetOrg = options.targetOrg;
    this.repoName = options.repoName ?? 'migration-audit-results';
    this.targetClient = options.targetClient;
    this.targetWriteClient = options.targetWriteClient;
    this.dryRun = options.dryRun ?? false;
    this.branch = options.branch ?? 'main';
    this.commitMessage =
      options.commitMessage ??
      'chore: publish automated migration results and audit logs [skip ci]';
    this.enablePages = options.enablePages;
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

      // 2 & 3. Create Blobs & Tree (use inline tree content batching for > 20 files to avoid GitHub secondary rate limits)
      let treeSha: string | undefined;
      const entries = Object.entries(files);

      if (entries.length > 20) {
        let currentBaseTree: string | undefined;
        const chunkSize = 100;
        for (let i = 0; i < entries.length; i += chunkSize) {
          const chunk = entries.slice(i, i + chunkSize);
          const inlineTreeEntries = chunk.map(([filePath, content]) => ({
            path: filePath,
            mode: '100644' as const,
            type: 'blob' as const,
            content,
          }));
          const treeOp: TargetWriteOperation = {
            id: `create-results-tree-batch-${Math.floor(i / chunkSize) + 1}`,
            method: 'POST',
            path: '/repos/{owner}/{repo}/git/trees',
            pathParams: { owner: this.targetOrg, repo: this.repoName },
            body: currentBaseTree
              ? {
                  base_tree: currentBaseTree,
                  tree: inlineTreeEntries,
                }
              : {
                  tree: inlineTreeEntries,
                },
          };
          const treeRes = await this.targetWriteClient.mutate<{ sha: string }>(
            treeOp,
            this.signal,
          );
          if (!treeRes.data?.sha) {
            throw new Error('Failed to create Git tree for migration results.');
          }
          currentBaseTree = treeRes.data.sha;
          treeSha = treeRes.data.sha;
        }
      } else {
        const treeEntries: {
          path: string;
          mode: '100644';
          type: 'blob';
          sha: string;
        }[] = [];

        for (const [filePath, content] of entries) {
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

        const treeOp: TargetWriteOperation = {
          id: 'create-results-tree',
          method: 'POST',
          path: '/repos/{owner}/{repo}/git/trees',
          pathParams: { owner: this.targetOrg, repo: this.repoName },
          body: {
            tree: treeEntries,
          },
        };

        const treeRes = await this.targetWriteClient.mutate<{ sha: string }>(
          treeOp,
          this.signal,
        );
        treeSha = treeRes.data?.sha;
      }

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

      try {
        await this.targetWriteClient.mutate(updateRefOp, this.signal);
      } catch {
        // Fallback if auto_init created refs/heads/<branch> concurrently or fast-forward required force
        const forceRefOp: TargetWriteOperation = {
          id: 'force-update-results-ref',
          method: 'PATCH',
          path: '/repos/{owner}/{repo}/git/refs/heads/{branch}',
          pathParams: {
            owner: this.targetOrg,
            repo: this.repoName,
            branch: this.branch,
          },
          body: {
            sha: newCommitSha,
            force: true,
          },
        };
        await this.targetWriteClient.mutate(forceRefOp, this.signal);
      }

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
   * Configures and triggers a Private GitHub Pages site (`build_type: "legacy"`, `public: false`)
   * for the target results repository using the existing token (`repo` scope).
   * Non-fatal: if organization policy disallows Pages creation, logs a warning and returns `enabled: false`.
   */
  async ensurePagesSite(): Promise<EnsurePagesResult> {
    if (this.dryRun) {
      this.logger?.info(
        `[dry-run] Planned Private GitHub Pages provisioning for ${this.targetOrg}/${this.repoName}:${this.branch}`,
      );
      return {
        enabled: false,
        pagesUrl: `https://${this.targetOrg}.pages.github.io/${this.repoName}/`,
        dryRun: true,
      };
    }

    if (!this.targetWriteClient) {
      return { enabled: false, dryRun: false };
    }

    const getPagesOp: ReadOperation = {
      id: `get-results-pages-${this.repoName}`,
      transport: 'rest',
      verifiedReadOnly: true,
      path: '/repos/{owner}/{repo}/pages',
      pathParams: {
        owner: this.targetOrg,
        repo: this.repoName,
      },
    };

    try {
      let pagesExists = false;
      let pagesUrl: string | undefined;

      try {
        const existingRes = await this.targetClient.readSingle<{
          html_url?: string;
          public?: boolean;
        }>(getPagesOp, this.signal);
        if (existingRes.status === 200) {
          pagesExists = true;
          pagesUrl = existingRes.data?.html_url;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          !msg.includes('404') &&
          !msg.includes('not_found') &&
          !msg.includes('Not Found')
        ) {
          throw err;
        }
      }

      if (!pagesExists) {
        const createPagesOp: TargetWriteOperation = {
          id: `create-results-pages-${this.repoName}`,
          method: 'POST',
          path: '/repos/{owner}/{repo}/pages',
          pathParams: {
            owner: this.targetOrg,
            repo: this.repoName,
          },
          body: {
            build_type: 'legacy',
            source: {
              branch: this.branch,
              path: '/',
            },
          },
        };

        try {
          const createRes = await this.targetWriteClient.mutate<{
            html_url?: string;
          }>(createPagesOp, this.signal);
          pagesUrl = createRes.data?.html_url ?? pagesUrl;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // 409 Conflict indicates Pages was enabled concurrently
          if (!msg.includes('409') && !msg.includes('Conflict')) {
            throw err;
          }
        }
      }

      // Enforce Private GitHub Pages visibility (public: false) and HTTPS.
      // On GHEC-EMU, visibility is locked to private by enterprise policy (which may return 400/422 on PUT).
      const updatePagesOp: TargetWriteOperation = {
        id: `update-results-pages-private-${this.repoName}`,
        method: 'PUT',
        path: '/repos/{owner}/{repo}/pages',
        pathParams: {
          owner: this.targetOrg,
          repo: this.repoName,
        },
        body: {
          build_type: 'legacy',
          public: false,
          https_enforced: true,
          source: {
            branch: this.branch,
            path: '/',
          },
        },
      };

      try {
        await this.targetWriteClient.mutate(updatePagesOp, this.signal);
      } catch {
        // Ignore 400/422 on GHEC-EMU (where visibility is locked to private) or pending TLS certificate
      }

      // Request an explicit Pages build for the latest commit on the branch
      const triggerBuildOp: TargetWriteOperation = {
        id: `trigger-results-pages-build-${this.repoName}`,
        method: 'POST',
        path: '/repos/{owner}/{repo}/pages/builds',
        pathParams: {
          owner: this.targetOrg,
          repo: this.repoName,
        },
      };

      try {
        await this.targetWriteClient.mutate(triggerBuildOp, this.signal);
      } catch {
        // Non-fatal if a Pages build is already in progress
      }

      if (!pagesUrl) {
        try {
          const refreshed = await this.targetClient.readSingle<{
            html_url?: string;
          }>(getPagesOp, this.signal);
          pagesUrl = refreshed.data?.html_url;
        } catch {
          // Ignore if read follow-up fails
        }
      }

      this.logger?.info(
        'Configured Private GitHub Pages for results repository',
        {
          targetOrg: this.targetOrg,
          repoName: this.repoName,
          branch: this.branch,
          pagesUrl: pagesUrl ?? 'pending',
        },
      );

      return {
        enabled: true,
        pagesUrl,
        dryRun: false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn(
        `Unable to configure Private GitHub Pages for ${this.targetOrg}/${this.repoName}: ${sanitizeDiagnostics(msg)}`,
      );
      return {
        enabled: false,
        dryRun: false,
      };
    }
  }

  /**
   * High-level entry point: ensures target repository exists, publishes files atomically,
   * and provisions Private GitHub Pages when dashboard assets (`index.html`) or `enablePages` are present.
   */
  async publish(files: Record<string, string>): Promise<PublishCommitResult> {
    await this.ensureTargetRepository();
    const commitResult = await this.publishAtomicCommit(files);

    const shouldEnablePages =
      this.enablePages !== undefined
        ? this.enablePages
        : Boolean(files['index.html']);

    if (!shouldEnablePages || Object.keys(files).length === 0) {
      return commitResult;
    }

    const pagesResult = await this.ensurePagesSite();
    return {
      ...commitResult,
      ...(pagesResult.pagesUrl ? { pagesUrl: pagesResult.pagesUrl } : {}),
      pagesEnabled: pagesResult.enabled,
    };
  }
}
