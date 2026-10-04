import type {
  OrganizationVisibility,
  RepositoryIdMap,
} from '../org-variables/types.js';
import type { RepoSecretDomain } from '../repo-secrets/types.js';

export interface OrganizationSecret {
  readonly domain: RepoSecretDomain;
  readonly name: string;
  readonly visibility: OrganizationVisibility;
  readonly selectedRepositoryIds: readonly string[];
}

export interface OrgSecretsData {
  readonly organization: string;
  readonly secrets: readonly OrganizationSecret[];
}

export interface OrgSecretsModuleOptions {
  readonly repositoryIdMap?: RepositoryIdMap | undefined;
}

export interface RawOrganizationSecretsResponse {
  readonly secrets?: readonly {
    readonly name?: string | undefined;
    readonly visibility?: OrganizationVisibility | undefined;
  }[];
}

export interface RawOrganizationPublicKeyResponse {
  readonly key_id?: string | undefined;
  readonly key?: string | undefined;
}

export interface RawOrganizationSecretSelectedRepositoriesResponse {
  readonly repositories?:
    readonly { readonly id?: number | undefined }[] | undefined;
}
