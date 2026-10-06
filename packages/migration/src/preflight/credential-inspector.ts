import type {
  GitHubReadAdapter,
  EndpointProbeResult,
} from '@ghec/github-client';

export type TokenModel = 'classic_pat' | 'fine_grained_pat' | 'unknown';

export interface SourceCredentialAssessment {
  readonly valid: boolean;
  readonly tokenModel: TokenModel;
  readonly scopes: readonly string[];
  readonly ssoRequired: boolean;
  readonly ssoUrl?: string | undefined;
  readonly orgRole?: string | undefined;
  readonly username?: string | undefined;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface SourceCredentialInspectorOptions {
  readonly adapter: GitHubReadAdapter;
  readonly sourceOrg: string;
  readonly signal?: AbortSignal | undefined;
}

interface GitHubOrgMembershipResponse {
  readonly state?: string | undefined;
  readonly role?: string | undefined;
  readonly user?:
    | {
        readonly login?: string | undefined;
      }
    | undefined;
}

/**
 * Validates that the migration credentials for a source organization possess
 * the required classic OAuth scopes, SAML SSO authorizations, and organization roles
 * to perform GEI repository migrations and archive generation.
 */
export class SourceCredentialInspector {
  private readonly adapter: GitHubReadAdapter;
  private readonly sourceOrg: string;
  private readonly signal: AbortSignal | undefined;

  constructor(options: SourceCredentialInspectorOptions) {
    this.adapter = options.adapter;
    this.sourceOrg = options.sourceOrg;
    this.signal = options.signal;
  }

  /**
   * Executes online probes against the source organization and authenticated user endpoints
   * to evaluate token capabilities against GitHub Enterprise Importer prerequisites.
   */
  async inspect(): Promise<SourceCredentialAssessment> {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const signal = this.signal ?? new AbortController().signal;

    let probeResult: EndpointProbeResult | undefined;
    let tokenModel: TokenModel = 'unknown';

    // 1. Probe source organization endpoint to inspect headers (scopes, SSO)
    if (typeof this.adapter.probeEndpoint === 'function') {
      try {
        probeResult = await this.adapter.probeEndpoint(
          `/orgs/${this.sourceOrg}`,
          signal,
        );
      } catch {
        // Fall back to REST read if probe fails
      }
    }

    if (probeResult) {
      // Evaluate SAML SSO requirement
      if (probeResult.ssoRequired) {
        blockers.push(
          `Source organization "${this.sourceOrg}" requires SAML Single Sign-On (SSO) authorization. Authorize your token at: ${probeResult.ssoUrl || `https://github.com/orgs/${this.sourceOrg}`}`,
        );
      }

      // Evaluate OAuth Scopes
      if (probeResult.oauthScopes !== undefined) {
        tokenModel = 'classic_pat';
        const scopes = probeResult.oauthScopes;
        const hasRepo = scopes.includes('repo');
        const hasAdminOrg = scopes.includes('admin:org');
        const hasReadOrg = scopes.includes('read:org');

        if (!hasRepo) {
          blockers.push(
            `Source token is missing required OAuth scope "repo" (found: ${scopes.length > 0 ? scopes.join(', ') : 'none'}).`,
          );
        }

        if (!hasAdminOrg && !hasReadOrg) {
          blockers.push(
            `Source token is missing required organization scope "admin:org" or "read:org" (found: ${scopes.length > 0 ? scopes.join(', ') : 'none'}).`,
          );
        }
      } else if (probeResult.status === 200 || probeResult.status === 403) {
        // Status received without x-oauth-scopes header indicates fine-grained PAT or GitHub App
        tokenModel = 'fine_grained_pat';
        blockers.push(
          `Source token appears to be a Fine-Grained Personal Access Token (PAT) or lacks OAuth scope headers. GitHub Enterprise Importer (GEI) source archive export strictly requires a Classic Personal Access Token (starts with "ghp_") with "repo" and "admin:org" scopes.`,
        );
      }
    }

    // 2. Query authenticated user membership in the source organization
    let username: string | undefined;
    let orgRole: string | undefined;

    try {
      const membershipRes =
        await this.adapter.readSingle<GitHubOrgMembershipResponse>(
          {
            id: 'rest.orgs.getMembershipForAuthenticatedUser',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/user/memberships/orgs/{org}',
            pathParams: { org: this.sourceOrg },
          },
          signal,
        );

      if (membershipRes.status === 200 && membershipRes.data) {
        username = membershipRes.data.user?.login;
        orgRole = membershipRes.data.role;
        const state = membershipRes.data.state;

        if (state && state !== 'active') {
          blockers.push(
            `User membership in source organization "${this.sourceOrg}" is inactive or pending (state: "${state}").`,
          );
        }

        if (orgRole && orgRole !== 'admin') {
          // If not admin/owner, warn operator that GEI migrator role must be granted
          warnings.push(
            `Authenticated user "${username ?? 'unknown'}" has role "${orgRole}" (not Owner) in source organization "${this.sourceOrg}". Ensure the user has been granted the GEI Migrator role via: gh gei grant-migrator-role --github-org ${this.sourceOrg} --actor ${username ?? '<username>'} --actor-type USER.`,
          );
        }
      } else if (membershipRes.status === 404 || membershipRes.status === 403) {
        if (!probeResult?.ssoRequired) {
          blockers.push(
            `Authenticated user cannot access membership in source organization "${this.sourceOrg}" (HTTP ${membershipRes.status}). Verify user is an active member or owner of the organization.`,
          );
        }
      }
    } catch (err) {
      if (!probeResult?.ssoRequired) {
        warnings.push(
          `Could not verify membership in source organization "${this.sourceOrg}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      valid: blockers.length === 0,
      tokenModel,
      scopes: probeResult?.oauthScopes ?? [],
      ssoRequired: probeResult?.ssoRequired ?? false,
      ssoUrl: probeResult?.ssoUrl,
      orgRole,
      username,
      blockers,
      warnings,
    };
  }
}
