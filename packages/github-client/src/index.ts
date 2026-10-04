export { sanitizeDiagnostics } from './diagnostics.js';

export type { GitHubAppConfig, TokenProvider } from './auth/types.js';
export {
  GitHubAppAuthProvider,
  createGitHubAppJwt,
} from './auth/github-app.js';

export {
  AdaptiveRateLimiter,
  sleep,
  type AdaptiveRateLimiterOptions,
  type RateLimitStatus,
} from './rate-limiting/adaptive-rate-limiter.js';

export type {
  EndpointProbeResult,
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from './adapters/read-adapter.js';
export {
  HttpGitHubReadAdapter,
  assertReadOnlyGraphQL,
  type HttpAdapterOptions,
} from './adapters/http-read-adapter.js';

export {
  createGitHubDualClient,
  type GitHubDualClient,
  type GitHubDualClientConfig,
  type GitHubTargetClient,
  type TenantClientConfig,
  type TenantRole,
} from './client.js';
