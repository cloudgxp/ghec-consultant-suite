import type { GitHubAppConfig } from '@ghec/github-client';

/** Connection settings the discovery engine needs; resolved by the host app. */
export interface DiscoveryConfig {
  readonly token?: string | undefined;
  readonly app?: GitHubAppConfig | undefined;
  readonly baseUrl: string;
  readonly apiVersion: string;
}
