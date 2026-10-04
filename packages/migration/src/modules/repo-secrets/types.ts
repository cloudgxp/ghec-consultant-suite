export const REPO_SECRET_DOMAINS = [
  'actions',
  'dependabot',
  'codespaces',
] as const;

export type RepoSecretDomain = (typeof REPO_SECRET_DOMAINS)[number];

/** Metadata returned by GitHub; secret values are intentionally unavailable. */
export interface RepoSecretMetadata {
  readonly domain: RepoSecretDomain;
  readonly name: string;
  readonly updatedAt?: string | undefined;
}

export interface RepoSecretsData {
  readonly repo: string;
  readonly secrets: readonly RepoSecretMetadata[];
}

export interface RawGitHubSecretsResponse {
  readonly total_count?: number | undefined;
  readonly secrets?:
    | readonly {
        readonly name?: string | undefined;
        readonly updated_at?: string | undefined;
      }[]
    | undefined;
}

export interface RawGitHubPublicKeyResponse {
  readonly key_id?: string | undefined;
  readonly key?: string | undefined;
}

/**
 * Allows a client-owned secret vault to provide values without exposing them to
 * discovery, planning, logs, or persisted migration plans.
 */
export interface SecretValueProvider {
  getSecretValue(input: {
    readonly domain: RepoSecretDomain;
    readonly name: string;
    readonly sourceOrg: string;
    readonly sourceRepo: string;
    readonly targetOrg: string;
    readonly targetRepo: string;
    readonly signal: AbortSignal;
  }): Promise<string | undefined>;
}
