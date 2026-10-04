export { RepoSettingsMigrationModule } from './module.js';
export {
  normalizeVisibility,
  determineTargetVisibility,
  resolvePolicyFallbackVisibility,
} from './visibility.js';
export { parsePullRequestSettings, diffRepoSettings } from './pr-settings.js';
export type {
  RepositoryVisibility,
  SquashMergeCommitTitle,
  SquashMergeCommitMessage,
  MergeCommitTitle,
  MergeCommitMessage,
  RepositoryPullRequestSettings,
  RepositoryFeatureSettings,
  RepoSettingsData,
  RepoSettingsModuleOptions,
  RawGitHubRepositoryResponse,
} from './types.js';
