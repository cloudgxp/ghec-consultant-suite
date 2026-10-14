/**
 * Domain types for GitHub Apps & Integrations Inventory migration module.
 */

export interface AppInstallationState {
  readonly id: number;
  readonly app_id: number;
  readonly app_slug: string;
  readonly repository_selection: 'all' | 'selected';
  readonly permissions: Readonly<Record<string, string>>;
  readonly events: readonly string[];
  readonly html_url?: string | undefined;
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
