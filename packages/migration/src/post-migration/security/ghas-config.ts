import type { GitHubReadAdapter } from '@ghec/github-client';
import type { MigrationContext } from '../../core/types.js';
import type {
  RawRepositorySecurityResponse,
  RepositorySecuritySettings,
  SecurityFeatureStatus,
} from './types.js';

function parseStatus(rawStatus?: string): SecurityFeatureStatus {
  if (rawStatus === 'enabled') return 'enabled';
  if (rawStatus === 'disabled') return 'disabled';
  return 'not_set';
}

export async function fetchRepositorySecuritySettings(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  client?: GitHubReadAdapter,
): Promise<RepositorySecuritySettings> {
  const readClient =
    client ??
    (owner === ctx.scope.sourceOrg ? ctx.sourceClient : ctx.targetClient);

  try {
    const response = await readClient.readSingle<RawRepositorySecurityResponse>(
      {
        id: 'rest.repos.getSecuritySettings',
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}',
        pathParams: { owner, repo },
      },
      ctx.signal,
    );

    const sec = response.data?.security_and_analysis;
    return {
      advanced_security: sec?.advanced_security?.status
        ? { status: parseStatus(sec.advanced_security.status) }
        : undefined,
      secret_scanning: sec?.secret_scanning?.status
        ? { status: parseStatus(sec.secret_scanning.status) }
        : undefined,
      secret_scanning_push_protection: sec?.secret_scanning_push_protection
        ?.status
        ? { status: parseStatus(sec.secret_scanning_push_protection.status) }
        : undefined,
      dependabot_security_updates: sec?.dependabot_security_updates?.status
        ? { status: parseStatus(sec.dependabot_security_updates.status) }
        : undefined,
      secret_scanning_validity_checks: sec?.secret_scanning_validity_checks
        ?.status
        ? { status: parseStatus(sec.secret_scanning_validity_checks.status) }
        : undefined,
    };
  } catch (err) {
    ctx.logger.warn(
      `Could not fetch security settings for ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

export interface SecuritySettingsDiff {
  readonly hasChanges: boolean;
  readonly payload: Record<string, { status: 'enabled' | 'disabled' }>;
  readonly changesDescription: readonly string[];
  readonly warnings: readonly string[];
}

export function diffSecuritySettings(
  source: RepositorySecuritySettings,
  target: RepositorySecuritySettings,
  options: { targetHasGhasLicense?: boolean | undefined } = {},
): SecuritySettingsDiff {
  const payload: Record<string, { status: 'enabled' | 'disabled' }> = {};
  const changesDescription: string[] = [];
  const warnings: string[] = [];

  const targetHasGhasLicense = options.targetHasGhasLicense ?? true;

  // 1. Advanced Security
  if (
    source.advanced_security?.status === 'enabled' &&
    target.advanced_security?.status !== 'enabled'
  ) {
    if (!targetHasGhasLicense) {
      warnings.push(
        'Source repository has GitHub Advanced Security enabled, but target organization has no available GHAS licenses. Skipping GHAS activation.',
      );
    } else {
      payload.advanced_security = { status: 'enabled' };
      changesDescription.push('enable advanced_security');
    }
  }

  // 2. Secret Scanning
  if (
    source.secret_scanning?.status === 'enabled' &&
    target.secret_scanning?.status !== 'enabled'
  ) {
    // Secret scanning requires advanced_security to be enabled or enabling
    if (
      payload.advanced_security ||
      target.advanced_security?.status === 'enabled'
    ) {
      payload.secret_scanning = { status: 'enabled' };
      changesDescription.push('enable secret_scanning');
    } else {
      warnings.push(
        'Secret scanning requires advanced_security to be active. Skipping secret scanning enable.',
      );
    }
  }

  // 3. Secret Scanning Push Protection
  if (
    source.secret_scanning_push_protection?.status === 'enabled' &&
    target.secret_scanning_push_protection?.status !== 'enabled'
  ) {
    if (
      payload.secret_scanning ||
      target.secret_scanning?.status === 'enabled'
    ) {
      payload.secret_scanning_push_protection = { status: 'enabled' };
      changesDescription.push('enable secret_scanning_push_protection');
    }
  }

  // 4. Dependabot Security Updates
  if (
    source.dependabot_security_updates?.status === 'enabled' &&
    target.dependabot_security_updates?.status !== 'enabled'
  ) {
    payload.dependabot_security_updates = { status: 'enabled' };
    changesDescription.push('enable dependabot_security_updates');
  }

  return {
    hasChanges: Object.keys(payload).length > 0,
    payload,
    changesDescription,
    warnings,
  };
}
