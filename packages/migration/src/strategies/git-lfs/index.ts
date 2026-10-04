export { GitLfsClient, type GitLfsClientOptions } from './lfs-client.js';
export { GitLfsMigrationStrategy } from './strategy.js';
export { repositoryUsesLfs, verifyTargetLfsAvailability } from './verifier.js';
export type {
  GitLfsMigrationRequest,
  GitLfsMigrationResult,
  GitLfsPreflightResult,
  GitLfsQuota,
  GitLfsQuotaChecker,
  GitLfsStrategyOptions,
  GitLfsTransferMetrics,
} from './types.js';
