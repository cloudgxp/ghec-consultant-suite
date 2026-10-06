export type PackageType = 'container' | 'npm' | 'maven' | 'rubygems' | 'nuget';

export interface RawApiPackage {
  readonly id: number;
  readonly name: string;
  readonly package_type?: string | undefined;
  readonly visibility?: string | undefined;
  readonly version_count?: number | undefined;
  readonly repository?:
    { readonly id?: number; readonly name?: string } | null | undefined;
}

export interface RawApiPackageVersion {
  readonly id: number;
  readonly name: string;
  readonly metadata?:
    | {
        readonly package_type?: string | undefined;
        readonly container?:
          { readonly tags?: string[] | undefined } | undefined;
        readonly docker?: { readonly tags?: string[] | undefined } | undefined;
      }
    | undefined;
}

export interface MigrationPackageVersion {
  readonly id: number;
  readonly name: string;
  readonly digest?: string | undefined;
  readonly tags: readonly string[];
}

export interface MigrationPackage {
  readonly id: number;
  readonly name: string;
  readonly packageType: PackageType;
  readonly visibility: 'public' | 'private' | 'internal' | 'unknown';
  readonly repositoryName?: string | undefined;
  readonly versions: readonly MigrationPackageVersion[];
}

export interface PackagesMigrationData {
  readonly org: string;
  readonly packages: readonly MigrationPackage[];
}

export interface ReplicateVersionPayload {
  readonly packageName: string;
  readonly packageType: PackageType;
  readonly versionName: string;
  readonly digest?: string | undefined;
  readonly tags: readonly string[];
  readonly repositoryName?: string | undefined;
}

export interface RegistryClientInterface {
  replicateContainerVersion(
    sourceOrg: string,
    targetOrg: string,
    imageName: string,
    version: MigrationPackageVersion,
    signal?: AbortSignal,
  ): Promise<{
    status: number;
    layersReplicated: number;
    manifestDigest: string;
  }>;

  replicateLanguagePackage(
    sourceOrg: string,
    targetOrg: string,
    packageName: string,
    packageType: PackageType,
    version: MigrationPackageVersion,
    signal?: AbortSignal,
  ): Promise<{ status: number }>;
}

export interface PackagesModuleOptions {
  readonly packages?: readonly MigrationPackage[] | undefined;
  readonly registryClient?: RegistryClientInterface | undefined;
}
