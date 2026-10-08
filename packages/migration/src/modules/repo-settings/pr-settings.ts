import type {
  MergeCommitMessage,
  MergeCommitTitle,
  RawGitHubRepositoryResponse,
  RepositoryCoreMetadata,
  RepositoryFeatureSettings,
  RepositoryPullRequestSettings,
  SquashMergeCommitMessage,
  SquashMergeCommitTitle,
} from './types.js';

export function parsePullRequestSettings(
  raw: RawGitHubRepositoryResponse,
): RepositoryPullRequestSettings {
  return {
    allowSquashMerge: raw.allow_squash_merge,
    allowMergeCommit: raw.allow_merge_commit,
    allowRebaseMerge: raw.allow_rebase_merge,
    allowAutoMerge: raw.allow_auto_merge,
    deleteBranchOnMerge: raw.delete_branch_on_merge,
    allowUpdateBranch: raw.allow_update_branch,
    squashMergeCommitTitle: raw.squash_merge_commit_title as
      SquashMergeCommitTitle | undefined,
    squashMergeCommitMessage: raw.squash_merge_commit_message as
      SquashMergeCommitMessage | undefined,
    mergeCommitTitle: raw.merge_commit_title as MergeCommitTitle | undefined,
    mergeCommitMessage: raw.merge_commit_message as
      MergeCommitMessage | undefined,
  };
}

export function parseFeatureSettings(
  raw: RawGitHubRepositoryResponse,
): RepositoryFeatureSettings {
  return {
    hasIssues: raw.has_issues,
    hasProjects: raw.has_projects,
    hasWiki: raw.has_wiki,
    hasDiscussions: raw.has_discussions,
  };
}

export function parseCoreMetadata(
  raw: RawGitHubRepositoryResponse,
): RepositoryCoreMetadata {
  return {
    description: raw.description ?? undefined,
    homepage: raw.homepage ?? undefined,
    defaultBranch: raw.default_branch ?? undefined,
  };
}

export interface SettingsDiffResult {
  hasChanges: boolean;
  patchPayload: Record<string, unknown>;
  changeDescriptions: string[];
}

export function diffRepositoryFeatures(
  desiredFeatures?: RepositoryFeatureSettings | undefined,
  targetFeatures?: RepositoryFeatureSettings | undefined,
  desiredMetadata?: RepositoryCoreMetadata | undefined,
  targetMetadata?: RepositoryCoreMetadata | undefined,
): SettingsDiffResult {
  const patchPayload: Record<string, unknown> = {};
  const changeDescriptions: string[] = [];

  if (
    desiredFeatures?.hasIssues !== undefined &&
    desiredFeatures.hasIssues !== targetFeatures?.hasIssues
  ) {
    patchPayload.has_issues = desiredFeatures.hasIssues;
    changeDescriptions.push(
      `has_issues: ${targetFeatures?.hasIssues} -> ${desiredFeatures.hasIssues}`,
    );
  }

  if (
    desiredFeatures?.hasProjects !== undefined &&
    desiredFeatures.hasProjects !== targetFeatures?.hasProjects
  ) {
    patchPayload.has_projects = desiredFeatures.hasProjects;
    changeDescriptions.push(
      `has_projects: ${targetFeatures?.hasProjects} -> ${desiredFeatures.hasProjects}`,
    );
  }

  if (
    desiredFeatures?.hasWiki !== undefined &&
    desiredFeatures.hasWiki !== targetFeatures?.hasWiki
  ) {
    patchPayload.has_wiki = desiredFeatures.hasWiki;
    changeDescriptions.push(
      `has_wiki: ${targetFeatures?.hasWiki} -> ${desiredFeatures.hasWiki}`,
    );
  }

  if (
    desiredFeatures?.hasDiscussions !== undefined &&
    desiredFeatures.hasDiscussions !== targetFeatures?.hasDiscussions
  ) {
    patchPayload.has_discussions = desiredFeatures.hasDiscussions;
    changeDescriptions.push(
      `has_discussions: ${targetFeatures?.hasDiscussions} -> ${desiredFeatures.hasDiscussions}`,
    );
  }

  if (
    desiredMetadata?.description !== undefined &&
    desiredMetadata.description !== (targetMetadata?.description ?? '')
  ) {
    patchPayload.description = desiredMetadata.description;
    changeDescriptions.push(
      `description: "${targetMetadata?.description ?? ''}" -> "${desiredMetadata.description}"`,
    );
  }

  if (
    desiredMetadata?.homepage !== undefined &&
    desiredMetadata.homepage !== (targetMetadata?.homepage ?? '')
  ) {
    patchPayload.homepage = desiredMetadata.homepage;
    changeDescriptions.push(
      `homepage: "${targetMetadata?.homepage ?? ''}" -> "${desiredMetadata.homepage}"`,
    );
  }

  if (
    desiredMetadata?.defaultBranch !== undefined &&
    targetMetadata?.defaultBranch !== undefined &&
    desiredMetadata.defaultBranch !== targetMetadata.defaultBranch
  ) {
    patchPayload.default_branch = desiredMetadata.defaultBranch;
    changeDescriptions.push(
      `default_branch: "${targetMetadata.defaultBranch}" -> "${desiredMetadata.defaultBranch}"`,
    );
  }

  return {
    hasChanges: Object.keys(patchPayload).length > 0,
    patchPayload,
    changeDescriptions,
  };
}

export function diffRepoSettings(
  desiredVisibility: string,
  targetVisibility: string,
  desiredPr: RepositoryPullRequestSettings,
  targetPr: RepositoryPullRequestSettings,
  desiredFeatures?: RepositoryFeatureSettings | undefined,
  targetFeatures?: RepositoryFeatureSettings | undefined,
  desiredMetadata?: RepositoryCoreMetadata | undefined,
  targetMetadata?: RepositoryCoreMetadata | undefined,
): SettingsDiffResult {
  const patchPayload: Record<string, unknown> = {};
  const changeDescriptions: string[] = [];

  // Visibility diff
  if (desiredVisibility !== targetVisibility) {
    patchPayload.visibility = desiredVisibility;
    changeDescriptions.push(
      `visibility: "${targetVisibility}" -> "${desiredVisibility}"`,
    );
  }

  // PR settings diffs
  if (
    desiredPr.allowSquashMerge !== undefined &&
    desiredPr.allowSquashMerge !== targetPr.allowSquashMerge
  ) {
    patchPayload.allow_squash_merge = desiredPr.allowSquashMerge;
    changeDescriptions.push(
      `allow_squash_merge: ${targetPr.allowSquashMerge} -> ${desiredPr.allowSquashMerge}`,
    );
  }

  if (
    desiredPr.allowMergeCommit !== undefined &&
    desiredPr.allowMergeCommit !== targetPr.allowMergeCommit
  ) {
    patchPayload.allow_merge_commit = desiredPr.allowMergeCommit;
    changeDescriptions.push(
      `allow_merge_commit: ${targetPr.allowMergeCommit} -> ${desiredPr.allowMergeCommit}`,
    );
  }

  if (
    desiredPr.allowRebaseMerge !== undefined &&
    desiredPr.allowRebaseMerge !== targetPr.allowRebaseMerge
  ) {
    patchPayload.allow_rebase_merge = desiredPr.allowRebaseMerge;
    changeDescriptions.push(
      `allow_rebase_merge: ${targetPr.allowRebaseMerge} -> ${desiredPr.allowRebaseMerge}`,
    );
  }

  if (
    desiredPr.allowAutoMerge !== undefined &&
    desiredPr.allowAutoMerge !== targetPr.allowAutoMerge
  ) {
    patchPayload.allow_auto_merge = desiredPr.allowAutoMerge;
    changeDescriptions.push(
      `allow_auto_merge: ${targetPr.allowAutoMerge} -> ${desiredPr.allowAutoMerge}`,
    );
  }

  if (
    desiredPr.deleteBranchOnMerge !== undefined &&
    desiredPr.deleteBranchOnMerge !== targetPr.deleteBranchOnMerge
  ) {
    patchPayload.delete_branch_on_merge = desiredPr.deleteBranchOnMerge;
    changeDescriptions.push(
      `delete_branch_on_merge: ${targetPr.deleteBranchOnMerge} -> ${desiredPr.deleteBranchOnMerge}`,
    );
  }

  if (
    desiredPr.allowUpdateBranch !== undefined &&
    desiredPr.allowUpdateBranch !== targetPr.allowUpdateBranch
  ) {
    patchPayload.allow_update_branch = desiredPr.allowUpdateBranch;
    changeDescriptions.push(
      `allow_update_branch: ${targetPr.allowUpdateBranch} -> ${desiredPr.allowUpdateBranch}`,
    );
  }

  if (
    desiredPr.squashMergeCommitTitle !== undefined &&
    desiredPr.squashMergeCommitTitle !== targetPr.squashMergeCommitTitle
  ) {
    patchPayload.squash_merge_commit_title = desiredPr.squashMergeCommitTitle;
    changeDescriptions.push(
      `squash_merge_commit_title: "${targetPr.squashMergeCommitTitle ?? 'default'}" -> "${desiredPr.squashMergeCommitTitle}"`,
    );
  }

  if (
    desiredPr.squashMergeCommitMessage !== undefined &&
    desiredPr.squashMergeCommitMessage !== targetPr.squashMergeCommitMessage
  ) {
    patchPayload.squash_merge_commit_message =
      desiredPr.squashMergeCommitMessage;
    changeDescriptions.push(
      `squash_merge_commit_message: "${targetPr.squashMergeCommitMessage ?? 'default'}" -> "${desiredPr.squashMergeCommitMessage}"`,
    );
  }

  if (
    desiredPr.mergeCommitTitle !== undefined &&
    desiredPr.mergeCommitTitle !== targetPr.mergeCommitTitle
  ) {
    patchPayload.merge_commit_title = desiredPr.mergeCommitTitle;
    changeDescriptions.push(
      `merge_commit_title: "${targetPr.mergeCommitTitle ?? 'default'}" -> "${desiredPr.mergeCommitTitle}"`,
    );
  }

  if (
    desiredPr.mergeCommitMessage !== undefined &&
    desiredPr.mergeCommitMessage !== targetPr.mergeCommitMessage
  ) {
    patchPayload.merge_commit_message = desiredPr.mergeCommitMessage;
    changeDescriptions.push(
      `merge_commit_message: "${targetPr.mergeCommitMessage ?? 'default'}" -> "${desiredPr.mergeCommitMessage}"`,
    );
  }

  const featuresDiff = diffRepositoryFeatures(
    desiredFeatures,
    targetFeatures,
    desiredMetadata,
    targetMetadata,
  );

  Object.assign(patchPayload, featuresDiff.patchPayload);
  changeDescriptions.push(...featuresDiff.changeDescriptions);

  return {
    hasChanges: Object.keys(patchPayload).length > 0,
    patchPayload,
    changeDescriptions,
  };
}
