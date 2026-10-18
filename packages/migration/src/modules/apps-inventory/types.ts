/**
 * Domain types for GitHub Apps & Integrations Inventory migration module.
 */

export type GitHubAppClassification =
  'third_party' | 'custom_private' | 'custom_public';

export type RecommendedAppStrategy =
  'install_existing' | 'recreate_app' | 'either';

export interface GitHubAppManifestHookAttributes {
  readonly url: string;
  readonly active: boolean;
}

/**
 * GitHub App Manifest payload conforming to:
 * references/github-docs/content/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.md
 */
export interface GitHubAppManifestPayload {
  readonly name: string;
  readonly url: string;
  readonly description?: string | undefined;
  readonly hook_attributes?: GitHubAppManifestHookAttributes | undefined;
  readonly redirect_url?: string | undefined;
  readonly callback_urls?: readonly string[] | undefined;
  readonly setup_url?: string | undefined;
  readonly public: boolean;
  readonly default_permissions: Readonly<Record<string, string>>;
  readonly default_events: readonly string[];
  readonly request_oauth_on_install?: boolean | undefined;
  readonly setup_on_update?: boolean | undefined;
}

export interface AppInstallationState {
  readonly id: number;
  readonly app_id: number;
  readonly app_slug: string;
  readonly repository_selection: 'all' | 'selected';
  readonly permissions: Readonly<Record<string, string>>;
  readonly events: readonly string[];
  readonly html_url?: string | undefined;
  readonly app_name?: string | undefined;
  readonly description?: string | undefined;
  readonly external_url?: string | undefined;
  readonly owner_login?: string | undefined;
  readonly classification?: GitHubAppClassification | undefined;
  readonly recommended_strategy?: RecommendedAppStrategy | undefined;
  readonly selected_repositories?: readonly string[] | undefined;
}

export interface AppsInventoryData {
  readonly organization: string;
  readonly installations: readonly AppInstallationState[];
}

export interface RawAppInstallationResponse {
  readonly id: number;
  readonly app_id: number;
  readonly app_slug?: string | null | undefined;
  readonly repository_selection?: string | null | undefined;
  readonly permissions?: Readonly<Record<string, string>> | null | undefined;
  readonly events?: readonly string[] | null | undefined;
  readonly html_url?: string | null | undefined;
}

export interface RawAppInstallationsListResponse {
  readonly total_count: number;
  readonly installations: readonly RawAppInstallationResponse[];
}

export interface RawInstallationRepositoryItem {
  readonly id?: number | null | undefined;
  readonly name?: string | null | undefined;
  readonly full_name?: string | null | undefined;
}

export interface RawInstallationRepositoriesResponse {
  readonly total_count?: number | null | undefined;
  readonly repositories?:
    readonly RawInstallationRepositoryItem[] | null | undefined;
}

export interface RawGitHubAppDetailsResponse {
  readonly id?: number | null | undefined;
  readonly slug?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly external_url?: string | null | undefined;
  readonly html_url?: string | null | undefined;
  readonly owner?:
    | {
        readonly login?: string | null | undefined;
        readonly type?: string | null | undefined;
      }
    | null
    | undefined;
}
