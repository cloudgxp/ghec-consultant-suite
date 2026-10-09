export type RepositoryVisibility = 'public' | 'internal' | 'private';

export type SquashMergeCommitTitle = 'PR_TITLE' | 'COMMIT_OR_PR_TITLE';
export type SquashMergeCommitMessage = 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK';
export type MergeCommitTitle = 'PR_TITLE' | 'MERGE_MESSAGE';
export type MergeCommitMessage = 'PR_TITLE' | 'PR_BODY' | 'BLANK';

export interface RepositoryPullRequestSettings {
  allowSquashMerge?: boolean | undefined;
  allowMergeCommit?: boolean | undefined;
  allowRebaseMerge?: boolean | undefined;
  allowAutoMerge?: boolean | undefined;
  deleteBranchOnMerge?: boolean | undefined;
  allowUpdateBranch?: boolean | undefined;
  squashMergeCommitTitle?: SquashMergeCommitTitle | undefined;
  squashMergeCommitMessage?: SquashMergeCommitMessage | undefined;
  mergeCommitTitle?: MergeCommitTitle | undefined;
  mergeCommitMessage?: MergeCommitMessage | undefined;
}

export interface RepositoryFeatureSettings {
  hasIssues?: boolean | undefined;
  hasProjects?: boolean | undefined;
  hasWiki?: boolean | undefined;
  hasDiscussions?: boolean | undefined;
}

export interface RepositoryCoreMetadata {
  description?: string | undefined;
  homepage?: string | undefined;
  defaultBranch?: string | undefined;
}

export interface RepoSettingsData {
  owner: string;
  repo: string;
  visibility: RepositoryVisibility;
  prSettings: RepositoryPullRequestSettings;
  features?: RepositoryFeatureSettings | undefined;
  metadata?: RepositoryCoreMetadata | undefined;
}

export interface RepoSettingsModuleOptions {
  /**
   * Optional override for target visibility.
   * If provided, all repositories in this scope will be targeted for this visibility.
   */
  visibilityOverride?: RepositoryVisibility | undefined;

  /**
   * If true, downgrades 'public' source repositories to 'internal' on target if the target
   * enterprise or organization disallows public repositories, rather than failing.
   * Default: true.
   */
  enforceInternalForPublic?: boolean | undefined;
}

export interface RawGitHubRepositoryResponse {
  visibility?: string | undefined;
  private?: boolean | undefined;
  allow_squash_merge?: boolean | undefined;
  allow_merge_commit?: boolean | undefined;
  allow_rebase_merge?: boolean | undefined;
  allow_auto_merge?: boolean | undefined;
  delete_branch_on_merge?: boolean | undefined;
  allow_update_branch?: boolean | undefined;
  squash_merge_commit_title?: string | undefined;
  squash_merge_commit_message?: string | undefined;
  merge_commit_title?: string | undefined;
  merge_commit_message?: string | undefined;
  has_issues?: boolean | undefined;
  has_projects?: boolean | undefined;
  has_wiki?: boolean | undefined;
  has_discussions?: boolean | undefined;
  description?: string | null | undefined;
  homepage?: string | null | undefined;
  default_branch?: string | undefined;
}
