export interface MigrationDeployKey {
  readonly id: number;
  readonly key: string;
  readonly title: string;
  readonly readOnly: boolean;
  readonly verified?: boolean | undefined;
  readonly createdAt?: string | undefined;
  readonly fingerprint?: string | undefined;
}

export interface DeployKeysMigrationData {
  readonly repo: string;
  readonly keys: readonly MigrationDeployKey[];
}

export interface DeployKeysModuleOptions {
  readonly timeoutMs?: number | undefined;
}

export interface RawApiDeployKey {
  readonly id: number;
  readonly key: string;
  readonly title: string;
  readonly read_only?: boolean | undefined;
  readonly verified?: boolean | undefined;
  readonly created_at?: string | undefined;
}

export interface CreateDeployKeyPayload {
  readonly title: string;
  readonly key: string;
  readonly read_only: boolean;
}
