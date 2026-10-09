import type { VerificationDiscrepancy } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { MigrationContext } from '../../core/types.js';
import {
  parseMigrationLogErrors,
  parseMigrationLogWarnings,
} from '../../gei/logs.js';

export interface ParitySettings {
  readonly hasIssues?: boolean | undefined;
  readonly hasWiki?: boolean | undefined;
  readonly hasProjects?: boolean | undefined;
  readonly allowSquashMerge?: boolean | undefined;
  readonly allowMergeCommit?: boolean | undefined;
  readonly allowRebaseMerge?: boolean | undefined;
}

export interface ParityEntityCounts {
  readonly total: number;
  readonly open?: number | undefined;
  readonly closed?: number | undefined;
  readonly merged?: number | undefined;
}

export interface RepositoryStats {
  readonly exists: boolean;
  readonly defaultBranch?: string | undefined;
  readonly issues: ParityEntityCounts;
  readonly pullRequests: ParityEntityCounts;
  readonly releases: {
    readonly total: number;
    readonly assetCount: number;
  };
  readonly settings: ParitySettings;
}

export interface RepositoryParityReport {
  readonly source: RepositoryStats;
  readonly target: RepositoryStats;
  readonly migrationLogWarnings: readonly string[];
}

interface RawRepoResponse {
  readonly default_branch?: string;
  readonly has_issues?: boolean;
  readonly has_wiki?: boolean;
  readonly has_projects?: boolean;
  readonly allow_squash_merge?: boolean;
  readonly allow_merge_commit?: boolean;
  readonly allow_rebase_merge?: boolean;
}

interface RawIssueResponse {
  readonly number?: number;
  readonly title?: string;
  readonly body?: string;
  readonly state?: string;
  readonly pull_request?: unknown;
}

interface RawPullResponse {
  readonly state?: string;
  readonly merged_at?: string | null;
}

interface RawReleaseResponse {
  readonly assets?: readonly unknown[];
}

interface RawCommentResponse {
  readonly body?: string;
}

async function collectStats(
  client: GitHubReadAdapter,
  owner: string,
  repo: string,
  signal: AbortSignal,
): Promise<RepositoryStats> {
  let exists = false;
  let defaultBranch: string | undefined;
  let settings: ParitySettings = {};

  try {
    const repoRes = await client.readSingle<RawRepoResponse>(
      {
        id: 'rest.repos.get',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}',
        pathParams: { owner, repo },
      },
      signal,
    );
    if (repoRes.status === 200 && repoRes.data) {
      exists = true;
      defaultBranch = repoRes.data.default_branch;
      settings = {
        hasIssues: repoRes.data.has_issues,
        hasWiki: repoRes.data.has_wiki,
        hasProjects: repoRes.data.has_projects,
        allowSquashMerge: repoRes.data.allow_squash_merge,
        allowMergeCommit: repoRes.data.allow_merge_commit,
        allowRebaseMerge: repoRes.data.allow_rebase_merge,
      };
    }
  } catch {
    return {
      exists: false,
      issues: { total: 0 },
      pullRequests: { total: 0 },
      releases: { total: 0, assetCount: 0 },
      settings: {},
    };
  }

  if (!exists) {
    return {
      exists: false,
      issues: { total: 0 },
      pullRequests: { total: 0 },
      releases: { total: 0, assetCount: 0 },
      settings: {},
    };
  }

  let issuesCount = 0;
  let issuesOpen = 0;
  let issuesClosed = 0;
  try {
    const issuesRes = await client.readPage<RawIssueResponse[]>(
      {
        id: 'rest.issues.listForRepo',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/issues',
        pathParams: { owner, repo },
        queryParams: { state: 'all', per_page: 100 },
      },
      null,
      signal,
    );
    const items = (issuesRes.items ?? []) as readonly RawIssueResponse[];
    const realIssues = items.filter(
      (item) =>
        !item.pull_request &&
        item.title?.trim().toLowerCase() !== 'migration log',
    );
    issuesCount = realIssues.length;
    issuesOpen = realIssues.filter((i) => i.state === 'open').length;
    issuesClosed = realIssues.filter((i) => i.state === 'closed').length;
  } catch {
    // optional query failure
  }

  let prCount = 0;
  let prOpen = 0;
  let prClosed = 0;
  let prMerged = 0;
  try {
    const prRes = await client.readPage<RawPullResponse[]>(
      {
        id: 'rest.pulls.list',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/pulls',
        pathParams: { owner, repo },
        queryParams: { state: 'all', per_page: 100 },
      },
      null,
      signal,
    );
    const prs = (prRes.items ?? []) as readonly RawPullResponse[];
    prCount = prs.length;
    prOpen = prs.filter((p) => p.state === 'open').length;
    prClosed = prs.filter((p) => p.state === 'closed' && !p.merged_at).length;
    prMerged = prs.filter((p) => Boolean(p.merged_at)).length;
  } catch {
    // optional query failure
  }

  let releaseCount = 0;
  let releaseAssetCount = 0;
  try {
    const relRes = await client.readPage<RawReleaseResponse[]>(
      {
        id: 'rest.repos.listReleases',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/releases',
        pathParams: { owner, repo },
        queryParams: { per_page: 100 },
      },
      null,
      signal,
    );
    const releases = (relRes.items ?? []) as readonly RawReleaseResponse[];
    releaseCount = releases.length;
    releaseAssetCount = releases.reduce(
      (acc, r) => acc + (r.assets?.length ?? 0),
      0,
    );
  } catch {
    // optional query failure
  }

  return {
    exists,
    ...(defaultBranch !== undefined ? { defaultBranch } : {}),
    issues: { total: issuesCount, open: issuesOpen, closed: issuesClosed },
    pullRequests: {
      total: prCount,
      open: prOpen,
      closed: prClosed,
      merged: prMerged,
    },
    releases: { total: releaseCount, assetCount: releaseAssetCount },
    settings,
  };
}

async function collectMigrationLogWarnings(
  client: GitHubReadAdapter,
  owner: string,
  repo: string,
  signal: AbortSignal,
): Promise<readonly string[]> {
  const warnings: string[] = [];
  try {
    const issuesRes = await client.readPage<RawIssueResponse[]>(
      {
        id: 'rest.issues.listForRepo',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/issues',
        pathParams: { owner, repo },
        queryParams: { state: 'all', per_page: 50 },
      },
      null,
      signal,
    );
    const items = (issuesRes.items ?? []) as readonly RawIssueResponse[];
    const logIssue = items.find(
      (i) => i.title?.trim().toLowerCase() === 'migration log',
    );
    if (logIssue?.body) {
      warnings.push(...parseMigrationLogWarnings(logIssue.body));
      warnings.push(...parseMigrationLogErrors(logIssue.body));
    }
    if (logIssue?.number) {
      try {
        const commentsRes = await client.readSingle<RawCommentResponse[]>(
          {
            id: 'rest.issues.listComments',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/repos/{owner}/{repo}/issues/{issue_number}/comments',
            pathParams: { owner, repo, issue_number: String(logIssue.number) },
          },
          signal,
        );
        const comments = (commentsRes.data ??
          []) as readonly RawCommentResponse[];
        for (const comment of comments) {
          if (comment.body) {
            warnings.push(...parseMigrationLogWarnings(comment.body));
            warnings.push(...parseMigrationLogErrors(comment.body));
          }
        }
      } catch {
        // Comments fetch is optional
      }
    }
  } catch {
    // Migration Log query is optional
  }
  return warnings;
}

export class RepositoryParityInspector {
  static async inspect(ctx: MigrationContext): Promise<RepositoryParityReport> {
    const sourceOrg = ctx.scope.sourceOrg ?? '';
    const sourceRepo = ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg ?? '';
    const targetRepo = ctx.scope.targetRepo ?? '';

    const targetPromise = collectStats(
      ctx.targetClient,
      targetOrg,
      targetRepo,
      ctx.signal,
    );
    const warningsPromise = collectMigrationLogWarnings(
      ctx.targetClient,
      targetOrg,
      targetRepo,
      ctx.signal,
    );
    const sourcePromise = ctx.sourceClient
      ? collectStats(ctx.sourceClient, sourceOrg, sourceRepo, ctx.signal)
      : Promise.resolve<RepositoryStats>({
          exists: true,
          issues: { total: 0 },
          pullRequests: { total: 0 },
          releases: { total: 0, assetCount: 0 },
          settings: {},
        });

    const [source, target, migrationLogWarnings] = await Promise.all([
      sourcePromise,
      targetPromise,
      warningsPromise,
    ]);

    return {
      source,
      target,
      migrationLogWarnings,
    };
  }

  static synthesizeDiscrepancies(
    report: RepositoryParityReport,
    targetRepo: string,
  ): readonly VerificationDiscrepancy[] {
    const discrepancies: VerificationDiscrepancy[] = [];

    if (!report.target.exists) {
      discrepancies.push({
        resourceName: targetRepo,
        expected: 'present',
        actual: 'absent',
        message: `Target repository ${targetRepo} does not exist at destination.`,
      });
      return discrepancies;
    }

    // Default branch parity
    if (
      report.source.defaultBranch &&
      report.target.defaultBranch &&
      report.source.defaultBranch !== report.target.defaultBranch
    ) {
      discrepancies.push({
        resourceName: 'default-branch',
        expected: report.source.defaultBranch,
        actual: report.target.defaultBranch,
        message: `Default branch mismatch: expected ${report.source.defaultBranch}, got ${report.target.defaultBranch}.`,
      });
    }

    // Issue count parity
    if (report.source.issues.total > 0 && report.target.issues.total === 0) {
      discrepancies.push({
        resourceName: 'issues',
        expected: report.source.issues.total,
        actual: 0,
        message:
          'Target repository has no issues; GEI metadata migration omitted issues.',
      });
    }

    // Pull request count parity
    if (
      report.source.pullRequests.total > 0 &&
      report.target.pullRequests.total === 0
    ) {
      discrepancies.push({
        resourceName: 'pull-requests',
        expected: report.source.pullRequests.total,
        actual: 0,
        message:
          'Target repository has no pull requests; GEI metadata migration omitted pull requests.',
      });
    }

    // Release parity
    if (
      report.source.releases.total > report.target.releases.total ||
      report.source.releases.assetCount > report.target.releases.assetCount
    ) {
      discrepancies.push({
        resourceName: 'releases',
        expected: `${report.source.releases.total} releases (${report.source.releases.assetCount} assets)`,
        actual: `${report.target.releases.total} releases (${report.target.releases.assetCount} assets)`,
        message: 'Release assets missing on target.',
      });
    }

    // Settings drift
    const sourceSettings = report.source.settings;
    const targetSettings = report.target.settings;
    const driftedSettings: string[] = [];

    if (
      sourceSettings.hasIssues !== undefined &&
      targetSettings.hasIssues !== undefined &&
      sourceSettings.hasIssues !== targetSettings.hasIssues
    ) {
      driftedSettings.push(
        `hasIssues (${sourceSettings.hasIssues} -> ${targetSettings.hasIssues})`,
      );
    }
    if (
      sourceSettings.hasWiki !== undefined &&
      targetSettings.hasWiki !== undefined &&
      sourceSettings.hasWiki !== targetSettings.hasWiki
    ) {
      driftedSettings.push(
        `hasWiki (${sourceSettings.hasWiki} -> ${targetSettings.hasWiki})`,
      );
    }
    if (
      sourceSettings.hasProjects !== undefined &&
      targetSettings.hasProjects !== undefined &&
      sourceSettings.hasProjects !== targetSettings.hasProjects
    ) {
      driftedSettings.push(
        `hasProjects (${sourceSettings.hasProjects} -> ${targetSettings.hasProjects})`,
      );
    }
    if (
      sourceSettings.allowSquashMerge !== undefined &&
      targetSettings.allowSquashMerge !== undefined &&
      sourceSettings.allowSquashMerge !== targetSettings.allowSquashMerge
    ) {
      driftedSettings.push(
        `allowSquashMerge (${sourceSettings.allowSquashMerge} -> ${targetSettings.allowSquashMerge})`,
      );
    }
    if (
      sourceSettings.allowMergeCommit !== undefined &&
      targetSettings.allowMergeCommit !== undefined &&
      sourceSettings.allowMergeCommit !== targetSettings.allowMergeCommit
    ) {
      driftedSettings.push(
        `allowMergeCommit (${sourceSettings.allowMergeCommit} -> ${targetSettings.allowMergeCommit})`,
      );
    }
    if (
      sourceSettings.allowRebaseMerge !== undefined &&
      targetSettings.allowRebaseMerge !== undefined &&
      sourceSettings.allowRebaseMerge !== targetSettings.allowRebaseMerge
    ) {
      driftedSettings.push(
        `allowRebaseMerge (${sourceSettings.allowRebaseMerge} -> ${targetSettings.allowRebaseMerge})`,
      );
    }

    if (driftedSettings.length > 0) {
      discrepancies.push({
        resourceName: 'repo-settings',
        expected: sourceSettings,
        actual: targetSettings,
        message: `Repository settings drift detected post-migration: ${driftedSettings.join(', ')}.`,
      });
    }

    // Migration Log errors
    if (report.migrationLogWarnings.length > 0) {
      discrepancies.push({
        resourceName: 'migration-log',
        expected: 'zero errors in migration log',
        actual: `${report.migrationLogWarnings.length} warnings/errors reported`,
        message: `GEI recorded errors in target Migration Log: ${report.migrationLogWarnings.slice(0, 3).join('; ')}`,
      });
    }

    return discrepancies;
  }
}
