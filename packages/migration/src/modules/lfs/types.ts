export interface LfsObject {
  readonly oid: string;
  readonly size: number;
}

export interface LfsBatchAction {
  readonly href: string;
  readonly header?: Record<string, string> | undefined;
  readonly expires_at?: string | undefined;
}

export interface LfsBatchObjectResponse {
  readonly oid: string;
  readonly size: number;
  readonly authenticated?: boolean | undefined;
  readonly actions?:
    | {
        readonly upload?: LfsBatchAction | undefined;
        readonly download?: LfsBatchAction | undefined;
        readonly verify?: LfsBatchAction | undefined;
      }
    | undefined;
  readonly error?:
    | {
        readonly code: number;
        readonly message: string;
      }
    | undefined;
}

export interface LfsBatchResponse {
  readonly transfer?: string | undefined;
  readonly objects: readonly LfsBatchObjectResponse[];
}

export interface LfsMigrationData {
  readonly repo: string;
  readonly hasLfs: boolean;
  readonly objects: readonly LfsObject[];
}

export interface LfsUploadPayload {
  readonly oid: string;
  readonly size: number;
  readonly uploadAction?: LfsBatchAction | undefined;
  readonly verifyAction?: LfsBatchAction | undefined;
  readonly sourceDownloadUrl?: string | undefined;
  readonly sourceDownloadHeader?: Record<string, string> | undefined;
}

export interface LfsModuleOptions {
  readonly concurrency?: number | undefined;
  readonly objects?: readonly LfsObject[] | undefined;
  readonly sourceLfsUrl?: string | undefined;
  readonly targetLfsUrl?: string | undefined;
  readonly streamer?: LfsStreamerInterface | undefined;
}

export interface LfsStreamerInterface {
  requestBatch(
    repoEndpoint: string,
    operation: 'upload' | 'download',
    objects: readonly LfsObject[],
    signal?: AbortSignal,
    token?: string,
  ): Promise<LfsBatchResponse>;

  transferObject(
    sourceUrl: string,
    targetUrl: string,
    expectedOid: string,
    expectedSize: number,
    uploadHeaders?: Record<string, string>,
    downloadHeaders?: Record<string, string>,
    verifyAction?: LfsBatchAction,
    signal?: AbortSignal,
  ): Promise<void>;
}
