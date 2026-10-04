import type { GitHubReadAdapter } from '@ghec/github-client';
import type { MigrationContext } from '../../core/types.js';
import type { AlertRemediationMatch, SecretScanningAlert } from './types.js';

export const SECRET_SCANNING_LIMITATION_NOTICE =
  'Secret scanning alerts remediated on the target repository reflect the PAT owner as the resolving actor and the migration execution timestamp as the resolution time.';

export async function fetchSecretScanningAlerts(
  ctx: MigrationContext,
  owner: string,
  repo: string,
  state: 'open' | 'resolved',
  client?: GitHubReadAdapter,
): Promise<SecretScanningAlert[]> {
  const readClient =
    client ??
    (owner === ctx.scope.sourceOrg ? ctx.sourceClient : ctx.targetClient);

  try {
    const response = await readClient.readSingle<
      SecretScanningAlert[] | { alerts?: SecretScanningAlert[] }
    >(
      {
        id: `rest.secretScanning.listAlertsForRepo.${state}`,
        transport: 'rest',
        verifiedReadOnly: true,
        path: '/repos/{owner}/{repo}/secret-scanning/alerts',
        pathParams: { owner, repo },
        queryParams: { state, per_page: '100' },
      },
      ctx.signal,
    );

    if (Array.isArray(response.data)) {
      return response.data;
    }
    if (response.data && Array.isArray(response.data.alerts)) {
      return response.data.alerts;
    }
    return [];
  } catch (err) {
    ctx.logger.warn(
      `Could not list ${state} secret scanning alerts for ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

export function matchAlertRemediations(
  sourceResolved: readonly SecretScanningAlert[],
  targetOpen: readonly SecretScanningAlert[],
  options: { defaultResolutionCommentPrefix?: string | undefined } = {},
): AlertRemediationMatch[] {
  const matches: AlertRemediationMatch[] = [];
  const prefix =
    options.defaultResolutionCommentPrefix ?? 'Migrated from source repository';

  // Group target open alerts by secret_type
  const targetAlertsByType = new Map<string, SecretScanningAlert[]>();
  for (const alert of targetOpen) {
    const list = targetAlertsByType.get(alert.secret_type) ?? [];
    list.push(alert);
    targetAlertsByType.set(alert.secret_type, list);
  }

  for (const srcAlert of sourceResolved) {
    const candidates = targetAlertsByType.get(srcAlert.secret_type);
    if (!candidates || candidates.length === 0) {
      continue;
    }

    // Match candidate alert
    const targetAlert = candidates.shift()!;
    const resolution = srcAlert.resolution ?? 'wont_fix';
    const originalComment = srcAlert.resolution_comment ?? '';
    const resolutionComment = originalComment
      ? `${prefix}: ${originalComment}`
      : prefix;

    matches.push({
      targetAlertNumber: targetAlert.number,
      secretType: srcAlert.secret_type,
      sourceResolution: resolution,
      resolutionComment,
    });
  }

  return matches;
}
