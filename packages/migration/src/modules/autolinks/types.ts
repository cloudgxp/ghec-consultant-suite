/**
 * Domain types for Repository Autolinks migration module.
 */

export interface AutolinkDefinition {
  readonly id?: number | undefined;
  readonly key_prefix: string;
  readonly url_template: string;
  readonly is_alphanumeric: boolean;
}

export interface AutolinksMigrationData {
  readonly owner: string;
  readonly repo: string;
  readonly autolinks: readonly AutolinkDefinition[];
}

export interface RawAutolinkResponse {
  readonly id?: number | null;
  readonly key_prefix?: string | null;
  readonly url_template?: string | null;
  readonly is_alphanumeric?: boolean | null;
}
