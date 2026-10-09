import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { DiscoveryConfig } from '@ghec/discovery';
import type { GitHubAppConfig } from '@ghec/github-client';

// Re-exported so existing CLI imports keep working; the implementations live
// in @ghec/github-client so every transport error is scrubbed at the source.
export { sanitizeDiagnostics } from '@ghec/github-client';
export type { GitHubAppConfig } from '@ghec/github-client';

/**
 * Configuration and credential management.
 * In accordance with SEC-CRED-001, tokens and private keys must never be logged, printed, or exported.
 */

export type CliConfig = DiscoveryConfig;

export interface CliConfigOptions {
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
}

function resolveAmbientGhToken(user?: string): string | undefined {
  try {
    const args = ['auth', 'token'];
    if (user) {
      args.push('--user', user);
    }
    const token = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function loadConfig(options?: CliConfigOptions): CliConfig {
  const token =
    process.env.GHEC_TOKEN?.trim() ||
    process.env.GHEC_DISCOVERY_TOKEN?.trim() ||
    process.env.GHEC_SOURCE_TOKEN?.trim() ||
    resolveAmbientGhToken() ||
    undefined;
  const baseUrl = process.env.GHEC_BASE_URL?.trim() || 'https://api.github.com';
  const apiVersion = process.env.GHEC_API_VERSION?.trim() || '2026-03-10';

  const appId = options?.appId || process.env.GHEC_APP_ID?.trim() || undefined;
  const installationId =
    options?.installationId ||
    process.env.GHEC_APP_INSTALLATION_ID?.trim() ||
    undefined;

  let privateKey: string | undefined;
  const keyPath =
    options?.privateKeyPath || process.env.GHEC_APP_PRIVATE_KEY_PATH?.trim();

  if (keyPath) {
    try {
      privateKey = readFileSync(keyPath, 'utf8').trim();
    } catch (err) {
      throw new Error(
        `Failed to read GitHub App private key from "${keyPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  } else if (process.env.GHEC_APP_PRIVATE_KEY) {
    privateKey = process.env.GHEC_APP_PRIVATE_KEY.trim();
  }

  let app: GitHubAppConfig | undefined;
  if (appId || privateKey || installationId) {
    if (!appId || !privateKey || !installationId) {
      throw new Error(
        'Incomplete GitHub App configuration: App ID, Private Key, and Installation ID are all required.',
      );
    }
    app = {
      appId,
      privateKey,
      installationId,
    };
  }

  return {
    token,
    app,
    baseUrl,
    apiVersion,
  };
}

import {
  createGitHubDualClient,
  type GitHubReadAdapter,
  type TenantClientConfig,
} from '@ghec/github-client';
import { HttpTargetWriteClient, type TargetWriteClient } from '@ghec/migration';

export interface CliDualConfigOptions {
  readonly appId?: string | undefined;
  readonly privateKeyPath?: string | undefined;
  readonly installationId?: string | undefined;
  readonly sourceToken?: string | undefined;
  readonly targetToken?: string | undefined;
  readonly sourceBaseUrl?: string | undefined;
  readonly targetBaseUrl?: string | undefined;
  readonly sourceApiVersion?: string | undefined;
  readonly targetApiVersion?: string | undefined;
}

export interface CliDualConfig {
  readonly source: TenantClientConfig;
  readonly target: TenantClientConfig;
}

export function loadDualConfig(options?: CliDualConfigOptions): CliDualConfig {
  let sourceToken =
    options?.sourceToken ||
    process.env.GHEC_SOURCE_TOKEN?.trim() ||
    process.env.GHEC_TOKEN?.trim() ||
    undefined;

  let targetToken =
    options?.targetToken || process.env.GHEC_TARGET_TOKEN?.trim() || undefined;

  const sourceBaseUrl =
    options?.sourceBaseUrl ||
    process.env.GHEC_SOURCE_BASE_URL?.trim() ||
    process.env.GHEC_BASE_URL?.trim() ||
    'https://api.github.com';

  const targetBaseUrl =
    options?.targetBaseUrl ||
    process.env.GHEC_TARGET_BASE_URL?.trim() ||
    process.env.GHEC_BASE_URL?.trim() ||
    'https://api.github.com';

  const sourceApiVersion =
    options?.sourceApiVersion ||
    process.env.GHEC_SOURCE_API_VERSION?.trim() ||
    process.env.GHEC_API_VERSION?.trim() ||
    '2026-03-10';

  const targetApiVersion =
    options?.targetApiVersion ||
    process.env.GHEC_TARGET_API_VERSION?.trim() ||
    process.env.GHEC_API_VERSION?.trim() ||
    '2026-03-10';

  const baseConfig = loadConfig(options);

  if (!sourceToken && !baseConfig.app) {
    sourceToken = resolveAmbientGhToken();
  }

  if (!targetToken) {
    const emuTargetToken = resolveAmbientGhToken('homer-simpson_gxp');
    if (emuTargetToken && emuTargetToken !== sourceToken) {
      targetToken = emuTargetToken;
    }
  }

  const source: TenantClientConfig = {
    token: sourceToken,
    app: baseConfig.app,
    baseUrl: sourceBaseUrl,
    apiVersion: sourceApiVersion,
  };

  const target: TenantClientConfig = {
    token: targetToken,
    baseUrl: targetBaseUrl,
    apiVersion: targetApiVersion,
  };

  return { source, target };
}

export interface MigrationClients {
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly targetWriteClient?: TargetWriteClient | undefined;
}

export function createMigrationClientsFromConfig(
  dualConfig: CliDualConfig,
): MigrationClients {
  const dual = createGitHubDualClient({
    source: dualConfig.source,
    target: dualConfig.target,
    allowSameCredential: process.env.GHEC_ALLOW_SAME_CREDENTIAL === 'true',
  });

  if (!dual.targetClient) {
    throw new Error(
      'Target client could not be initialized. GHEC_TARGET_TOKEN must be configured.',
    );
  }

  const targetWriteClient = dualConfig.target.token
    ? new HttpTargetWriteClient({
        token: dualConfig.target.token,
        baseUrl: dualConfig.target.baseUrl,
        apiVersion: dualConfig.target.apiVersion,
      })
    : undefined;

  return {
    sourceClient: dual.sourceClient,
    targetClient: dual.targetClient,
    targetWriteClient,
  };
}
