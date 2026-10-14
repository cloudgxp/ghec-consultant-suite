import type { SeederGitHubClient } from './client.js';

export interface PreflightCheckResult {
  readonly valid: boolean;
  readonly scopes: readonly string[];
  readonly missingScopes: readonly string[];
  readonly isEnterprise: boolean;
  readonly warning?: string | undefined;
  readonly error?: string | undefined;
}

const REQUIRED_SCOPES = [
  'admin:org',
  'repo',
  'delete_repo',
  'workflow',
] as const;

export async function validateTokenPermissions(
  client: SeederGitHubClient,
  organization: string,
): Promise<PreflightCheckResult> {
  const orgRes = await client.request<{ plan?: { name?: string } }>(
    `/orgs/${organization}`,
  );

  if (!orgRes.ok) {
    if (orgRes.status === 401) {
      return {
        valid: false,
        scopes: [],
        missingScopes: [...REQUIRED_SCOPES],
        isEnterprise: false,
        error:
          'Authentication failed (HTTP 401). Verify Personal Access Token is valid and non-expired.',
      };
    }
    if (orgRes.status === 404) {
      return {
        valid: false,
        scopes: [],
        missingScopes: [],
        isEnterprise: false,
        error: `Organization "${organization}" was not found or the token does not have access to view it.`,
      };
    }
    return {
      valid: false,
      scopes: [],
      missingScopes: [],
      isEnterprise: false,
      error: `Pre-flight organization check returned HTTP ${orgRes.status}.`,
    };
  }

  const rawScopes = orgRes.headers.get('x-oauth-scopes');
  let scopes: string[] = [];
  let missingScopes: string[] = [];
  let warning: string | undefined;

  if (rawScopes !== null) {
    scopes = rawScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    missingScopes = REQUIRED_SCOPES.filter((req) => !scopes.includes(req));
    if (missingScopes.length > 0) {
      warning = `Token is missing recommended administrative scopes: ${missingScopes.join(', ')}. Some items (e.g. runner groups, teams, secrets) may fail if permissions are insufficient.`;
    }
  }

  const planName = orgRes.data?.plan?.name?.toLowerCase() ?? '';
  const isEnterprise = planName.includes('enterprise');

  if (!isEnterprise && !warning) {
    warning = `Organization plan is "${planName || 'standard'}". Enterprise-only items (IP allow lists, runner groups, custom roles) will be gracefully skipped.`;
  }

  return {
    valid: orgRes.ok,
    scopes,
    missingScopes,
    isEnterprise,
    warning,
  };
}
