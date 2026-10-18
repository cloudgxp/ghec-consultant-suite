export const REPO_VARIABLE_DOMAINS = ['actions', 'agents'] as const;
export type RepoVariableDomain = (typeof REPO_VARIABLE_DOMAINS)[number];

/**
 * Concrete variable entity from GitHub Actions or Copilot Coding Agent.
 */
export interface RepoVariable {
  readonly domain?: RepoVariableDomain | undefined;
  readonly name: string;
  readonly value: string;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
}

/**
 * Discovered data shape for the repo-variables module.
 */
export interface RepoVariablesData {
  readonly repo: string;
  readonly variables: readonly RepoVariable[];
}

/**
 * Raw response from GET /repos/{owner}/{repo}/actions/variables.
 */
export interface RawGitHubVariablesResponse {
  readonly total_count?: number | undefined;
  readonly variables?:
    | readonly {
        readonly name?: string | undefined;
        readonly value?: string | undefined;
        readonly created_at?: string | undefined;
        readonly updated_at?: string | undefined;
      }[]
    | undefined;
}
