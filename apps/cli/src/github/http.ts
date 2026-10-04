/**
 * Compatibility shim: HTTP transport and rate limiting now live in
 * `@ghec/github-client`. New code should import from the package directly.
 */
export type { HttpAdapterOptions, RateLimitStatus } from '@ghec/github-client';
export {
  AdaptiveRateLimiter,
  HttpGitHubReadAdapter,
  sleep,
} from '@ghec/github-client';
