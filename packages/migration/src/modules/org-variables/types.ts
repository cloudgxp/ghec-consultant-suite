export type OrganizationVisibility = 'all' | 'private' | 'selected';
export const ORG_VARIABLE_DOMAINS = ['actions', 'agents'] as const;
export type OrgVariableDomain = (typeof ORG_VARIABLE_DOMAINS)[number];

export interface OrganizationVariable {
  readonly domain?: OrgVariableDomain | undefined;
  readonly name: string;
  readonly value: string;
  readonly visibility: OrganizationVisibility;
  readonly selectedRepositoryIds: readonly string[];
  readonly updatedAt?: string | undefined;
}

export interface OrgVariablesData {
  readonly organization: string;
  readonly variables: readonly OrganizationVariable[];
}

/** Maps source repository IDs to their target-tenant numeric repository IDs. */
export type RepositoryIdMap = Readonly<Record<string, number>>;

export interface OrgVariablesModuleOptions {
  readonly repositoryIdMap?: RepositoryIdMap | undefined;
}

export interface RawOrganizationVariablesResponse {
  readonly variables?: readonly {
    readonly name?: string | undefined;
    readonly value?: string | undefined;
    readonly visibility?: OrganizationVisibility | undefined;
    readonly updated_at?: string | undefined;
  }[];
}

export interface RawSelectedRepositoriesResponse {
  readonly repositories?:
    readonly { readonly id?: number | undefined }[] | undefined;
}
