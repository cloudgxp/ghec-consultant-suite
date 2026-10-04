import { GitHubAppAuthProvider } from './auth/github-app.js';
import type { GitHubAppConfig, TokenProvider } from './auth/types.js';
import type { GitHubReadAdapter } from './adapters/read-adapter.js';
import { HttpGitHubReadAdapter } from './adapters/http-read-adapter.js';
import { AdaptiveRateLimiter } from './rate-limiting/adaptive-rate-limiter.js';

export type TenantRole = 'source' | 'target';

/**
 * Connection settings for exactly one GitHub tenant. Credentials are supplied
 * per tenant and are never shared with, or inherited from, the other tenant.
 */
export interface TenantClientConfig {
  /** Personal access token. Mutually exclusive with `app` / `authProvider`. */
  readonly token?: string | undefined;
  /** GitHub App credentials; wrapped in a `GitHubAppAuthProvider`. */
  readonly app?: GitHubAppConfig | undefined;
  /** Pre-built token provider (primarily for tests and custom auth flows). */
  readonly authProvider?: TokenProvider | undefined;
  readonly baseUrl?: string | undefined;
  readonly apiVersion?: string | undefined;
  readonly maxAttempts?: number | undefined;
  readonly maxRetrySeconds?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly fetchImpl?: typeof globalThis.fetch | undefined;
}

export interface GitHubDualClientConfig {
  readonly source: TenantClientConfig;
  readonly target?: TenantClientConfig | undefined;
}

/**
 * Target-tenant client seam.
 *
 * For now the target tenant is reachable through the same read-only contract,
 * which is sufficient for destination preflight and plan diffing. Mutation
 * methods (`create` / `update` / `upsert` / `delete` with audit logging, per
 * `agents/agent-specs/github-client-boundaries.md` §2.2) will widen this type
 * in a later task; they are intentionally not implemented here.
 */
export type GitHubTargetClient = GitHubReadAdapter;

/**
 * A pair of fully isolated tenant clients. Each side owns its own credentials,
 * Octokit instance, and `AdaptiveRateLimiter`, so quota exhaustion on one
 * tenant can never starve the other.
 */
export interface GitHubDualClient {
  readonly sourceClient: GitHubReadAdapter;
  readonly sourceRateLimiter: AdaptiveRateLimiter;
  readonly targetClient?: GitHubTargetClient | undefined;
  readonly targetRateLimiter?: AdaptiveRateLimiter | undefined;
}

function credentialCount(config: TenantClientConfig): number {
  return [config.token, config.app, config.authProvider].filter(
    (c) => c !== undefined,
  ).length;
}

/** Stable identity of a tenant credential, used only to detect sharing. */
function credentialIdentity(config: TenantClientConfig): unknown {
  if (config.authProvider) return config.authProvider;
  if (config.app) return `app:${config.app.appId}:${config.app.installationId}`;
  if (config.token) return `token:${config.token}`;
  return undefined;
}

function buildTenantClient(
  role: TenantRole,
  config: TenantClientConfig,
): { client: HttpGitHubReadAdapter; rateLimiter: AdaptiveRateLimiter } {
  if (credentialCount(config) > 1) {
    throw new Error(
      `Ambiguous ${role} credentials: provide only one of token, app, or authProvider.`,
    );
  }

  const authProvider =
    config.authProvider ??
    (config.app
      ? new GitHubAppAuthProvider(config.app, {
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
        })
      : undefined);

  const rateLimiter = new AdaptiveRateLimiter({ label: role });
  const client = new HttpGitHubReadAdapter({
    token: config.token,
    authProvider,
    rateLimiter,
    baseUrl: config.baseUrl,
    apiVersion: config.apiVersion,
    maxAttempts: config.maxAttempts,
    maxRetrySeconds: config.maxRetrySeconds,
    timeoutMs: config.timeoutMs,
    fetchImpl: config.fetchImpl,
  });
  return { client, rateLimiter };
}

/**
 * Builds the source (and optional target) tenant clients.
 *
 * Throws if source and target are configured with the same credential, since
 * the tenants must remain credential-isolated.
 */
export function createGitHubDualClient(
  config: GitHubDualClientConfig,
): GitHubDualClient {
  if (config.target) {
    const sourceIdentity = credentialIdentity(config.source);
    const targetIdentity = credentialIdentity(config.target);
    if (sourceIdentity !== undefined && sourceIdentity === targetIdentity) {
      throw new Error(
        'Source and target tenants must not share the same credential.',
      );
    }
  }

  const source = buildTenantClient('source', config.source);
  const target = config.target
    ? buildTenantClient('target', config.target)
    : undefined;

  return {
    sourceClient: source.client,
    sourceRateLimiter: source.rateLimiter,
    targetClient: target?.client,
    targetRateLimiter: target?.rateLimiter,
  };
}
