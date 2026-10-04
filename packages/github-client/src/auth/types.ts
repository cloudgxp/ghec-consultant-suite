export interface GitHubAppConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly installationId: string;
}

export interface TokenProvider {
  getToken(signal?: AbortSignal): Promise<string>;
  getInstallationInfo?(): { appId: string; installationId: string };
  getPermissions?(): Record<string, string> | undefined;
}
