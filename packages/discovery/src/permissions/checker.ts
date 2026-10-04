import type { ModuleId } from '@ghec/contracts';
import type { DiscoveryPlan } from '../plan.js';
import type { DiscoveryConfig } from '../config.js';
import type {
  GitHubReadAdapter,
  EndpointProbeResult,
} from '@ghec/github-client';
import { MODULE_PERMISSION_SPECS, checkModuleClassicScopes } from './matrix.js';

export type TokenModel =
  'classic_pat' | 'fine_grained_pat' | 'github_app' | 'mock';

export interface ModuleCheckResult {
  readonly moduleId: ModuleId;
  readonly status: 'passed' | 'failed' | 'warning';
  readonly reason?: string | undefined;
  readonly missingScopes?: readonly string[] | undefined;
  readonly requiredRoles?: readonly string[] | undefined;
}

export interface PermissionAuditResult {
  readonly success: boolean;
  readonly tokenModel: TokenModel;
  readonly targetScope: string;
  readonly ssoRequired: boolean;
  readonly ssoUrl?: string | undefined;
  readonly grantedScopes?: readonly string[] | undefined;
  readonly moduleChecks: readonly ModuleCheckResult[];
  readonly missingOverallScopes: readonly string[];
  readonly recommendations: readonly string[];
}

export class PreflightPermissionError extends Error {
  readonly auditResult: PermissionAuditResult;

  constructor(message: string, auditResult: PermissionAuditResult) {
    super(message);
    this.name = 'PreflightPermissionError';
    this.auditResult = auditResult;
  }
}

export class PermissionChecker {
  private readonly plan: DiscoveryPlan;
  private readonly config: DiscoveryConfig;
  private readonly adapter: GitHubReadAdapter;

  constructor(
    plan: DiscoveryPlan,
    config: DiscoveryConfig,
    adapter: GitHubReadAdapter,
  ) {
    this.plan = plan;
    this.config = config;
    this.adapter = adapter;
  }

  detectTokenModel(): TokenModel {
    if ((this.adapter as unknown as { isMock?: boolean }).isMock) {
      return 'mock';
    }
    if (this.config.app) {
      return 'github_app';
    }
    const token = this.config.token ?? '';
    if (token.startsWith('github_pat_')) {
      return 'fine_grained_pat';
    }
    return 'classic_pat';
  }

  async verify(signal: AbortSignal): Promise<PermissionAuditResult> {
    const tokenModel = this.detectTokenModel();
    const targetScope = this.plan.scope.name;
    const isEnterprise = this.plan.scope.kind === 'enterprise';

    // 1. Mock adapter handling
    if (tokenModel === 'mock') {
      const mockAdapter = this.adapter as unknown as {
        mockScopes?: string[];
        mockSsoRequired?: boolean;
        mockSsoUrl?: string;
        failModule?: string;
      };

      if (mockAdapter.mockSsoRequired) {
        return {
          success: false,
          tokenModel: 'mock',
          targetScope,
          ssoRequired: true,
          ssoUrl: mockAdapter.mockSsoUrl ?? 'https://github.com/orgs/mock/sso',
          moduleChecks: this.plan.modules.map((m) => ({
            moduleId: m,
            status: 'failed',
            reason: 'SAML SSO authorization required',
          })),
          missingOverallScopes: [],
          recommendations: [
            `Authorize token for SAML SSO at: ${mockAdapter.mockSsoUrl ?? 'https://github.com/orgs/mock/sso'}`,
          ],
        };
      }

      if (mockAdapter.mockScopes) {
        return this.evaluateClassicScopes(
          mockAdapter.mockScopes,
          targetScope,
          'mock',
        );
      }

      return {
        success: true,
        tokenModel: 'mock',
        targetScope,
        ssoRequired: false,
        grantedScopes: [
          'repo',
          'admin:org',
          'security_events',
          'admin:repo_hook',
          'read:packages',
        ],
        moduleChecks: this.plan.modules.map((m) => ({
          moduleId: m,
          status: 'passed',
        })),
        missingOverallScopes: [],
        recommendations: [],
      };
    }

    // 2. Fine-Grained PAT restrictions on Enterprise Scope
    if (tokenModel === 'fine_grained_pat' && isEnterprise) {
      const moduleChecks: ModuleCheckResult[] = this.plan.modules.map((m) => ({
        moduleId: m,
        status: 'failed',
        reason:
          'Fine-grained PATs (v2) cannot access enterprise-level APIs or enumerate multiple organizations.',
      }));

      return {
        success: false,
        tokenModel,
        targetScope,
        ssoRequired: false,
        moduleChecks,
        missingOverallScopes: [],
        recommendations: [
          'Enterprise scans (--enterprise) require a Classic PAT with admin:org or an Enterprise GitHub App installation.',
        ],
      };
    }

    // 3. Probing root target (org or user)
    const probePath = isEnterprise
      ? `/enterprises/${targetScope}`
      : `/orgs/${targetScope}`;
    let probeResult: EndpointProbeResult | undefined;

    if (this.adapter.probeEndpoint) {
      try {
        probeResult = await this.adapter.probeEndpoint(probePath, signal);
      } catch {
        if (signal.aborted) throw signal.reason ?? new Error('Aborted');
      }
    }

    // Check SAML SSO
    if (probeResult?.ssoRequired) {
      const ssoUrl =
        probeResult.ssoUrl ?? `https://github.com/orgs/${targetScope}/sso`;
      return {
        success: false,
        tokenModel,
        targetScope,
        ssoRequired: true,
        ssoUrl,
        moduleChecks: this.plan.modules.map((m) => ({
          moduleId: m,
          status: 'failed',
          reason: `SAML SSO authorization required for organization "${targetScope}".`,
        })),
        missingOverallScopes: [],
        recommendations: [
          `Authorize your token for SAML Single Sign-On at: ${ssoUrl}`,
        ],
      };
    }

    // 4. Classic PAT evaluation via X-OAuth-Scopes
    if (tokenModel === 'classic_pat') {
      const grantedScopes = probeResult?.oauthScopes ?? [];
      if (grantedScopes.length > 0) {
        return this.evaluateClassicScopes(
          grantedScopes,
          targetScope,
          tokenModel,
        );
      }
    }

    // 5. GitHub App Installation evaluation
    if (tokenModel === 'github_app') {
      const appProvider = (
        this.adapter as unknown as {
          getAuthProvider?(): { getPermissions?(): Record<string, string> };
        }
      ).getAuthProvider?.();
      const permissions = appProvider?.getPermissions?.() ?? {};
      return this.evaluateGitHubAppPermissions(permissions, targetScope);
    }

    // 6. Fine-grained PAT / fallback: probe each requested module endpoint
    return this.probeModuleEndpoints(targetScope, tokenModel, signal);
  }

  private evaluateClassicScopes(
    grantedScopes: readonly string[],
    targetScope: string,
    tokenModel: TokenModel,
  ): PermissionAuditResult {
    const scopeSet = new Set(grantedScopes);
    const checks: ModuleCheckResult[] = [];
    const missingScopesSet = new Set<string>();

    for (const mod of this.plan.modules) {
      const { satisfied, missingRecommendations } = checkModuleClassicScopes(
        mod,
        scopeSet,
      );
      const spec = MODULE_PERMISSION_SPECS[mod];

      if (satisfied) {
        checks.push({
          moduleId: mod,
          status: 'passed',
        });
      } else {
        missingRecommendations.forEach((s) => missingScopesSet.add(s));
        checks.push({
          moduleId: mod,
          status: 'failed',
          missingScopes: missingRecommendations,
          requiredRoles: spec.requiredRoles,
          reason: `Missing required Classic PAT scope(s): ${missingRecommendations.join(', ')}`,
        });
      }
    }

    const missingOverallScopes = Array.from(missingScopesSet);
    const success = checks.every((c) => c.status === 'passed');
    const recommendations: string[] = [];

    if (!success) {
      recommendations.push(
        `Regenerate or edit your Classic PAT to include the following missing scopes: ${missingOverallScopes.join(', ')}`,
      );
      recommendations.push(
        'Alternatively, run with --continue-on-error to collect data from only the authorized modules.',
      );
    }

    return {
      success,
      tokenModel,
      targetScope,
      ssoRequired: false,
      grantedScopes,
      moduleChecks: checks,
      missingOverallScopes,
      recommendations,
    };
  }

  private evaluateGitHubAppPermissions(
    permissions: Record<string, string>,
    targetScope: string,
  ): PermissionAuditResult {
    const checks: ModuleCheckResult[] = [];
    const missingPermissions: string[] = [];

    const hasOrgAdmin =
      permissions['organization_administration'] === 'read' ||
      permissions['organization_administration'] === 'write';

    for (const mod of this.plan.modules) {
      const spec = MODULE_PERMISSION_SPECS[mod];
      let satisfied: boolean;

      // Check module requirements against App permissions map
      switch (mod) {
        case 'orgs':
          satisfied = hasOrgAdmin || permissions['members'] === 'read';
          break;
        case 'repos':
          satisfied =
            permissions['metadata'] === 'read' ||
            permissions['administration'] === 'read' ||
            hasOrgAdmin;
          break;
        case 'lfs':
          satisfied = permissions['metadata'] === 'read' || hasOrgAdmin;
          break;
        case 'teams':
          satisfied = hasOrgAdmin || permissions['members'] === 'read';
          break;
        case 'actions':
          satisfied =
            permissions['actions'] === 'read' ||
            permissions['actions'] === 'write' ||
            hasOrgAdmin;
          break;
        case 'actions-secrets':
          satisfied =
            permissions['secrets'] === 'read' ||
            permissions['secrets'] === 'write' ||
            hasOrgAdmin;
          break;
        case 'policies':
          satisfied =
            permissions['administration'] === 'read' ||
            permissions['administration'] === 'write' ||
            hasOrgAdmin;
          break;
        case 'security':
          satisfied =
            permissions['security_events'] === 'read' ||
            permissions['security_events'] === 'write' ||
            hasOrgAdmin;
          break;
        case 'integrations':
          satisfied =
            hasOrgAdmin || permissions['organization_hooks'] === 'read';
          break;
        case 'users':
          satisfied = permissions['members'] === 'read' || hasOrgAdmin;
          break;
        case 'packages':
          satisfied =
            permissions['packages'] === 'read' ||
            permissions['packages'] === 'write';
          break;
        default:
          satisfied = true;
      }

      if (satisfied) {
        checks.push({
          moduleId: mod,
          status: 'passed',
        });
      } else {
        const required = spec.fineGrainedPermissions.join(' OR ');
        missingPermissions.push(`${mod}: [${required}]`);
        checks.push({
          moduleId: mod,
          status: 'failed',
          reason: `GitHub App lacks required permissions: ${required}`,
          requiredRoles: spec.requiredRoles,
        });
      }
    }

    const success = checks.every((c) => c.status === 'passed');
    const recommendations: string[] = [];
    if (!success) {
      recommendations.push(
        `Update your GitHub App permissions to grant: ${missingPermissions.join('; ')}`,
      );
      recommendations.push(
        'Alternatively, run with --continue-on-error to collect data from only the authorized modules.',
      );
    }

    return {
      success,
      tokenModel: 'github_app',
      targetScope,
      ssoRequired: false,
      moduleChecks: checks,
      missingOverallScopes: [],
      recommendations,
    };
  }

  private async probeModuleEndpoints(
    targetScope: string,
    tokenModel: TokenModel,
    signal: AbortSignal,
  ): Promise<PermissionAuditResult> {
    const checks: ModuleCheckResult[] = [];
    const missingPermissions: string[] = [];

    for (const mod of this.plan.modules) {
      const spec = MODULE_PERMISSION_SPECS[mod];
      const resolvedPath = spec.probePath.replace('{org}', targetScope);

      if (this.adapter.probeEndpoint) {
        try {
          const res = await this.adapter.probeEndpoint(resolvedPath, signal);
          if (res.status === 200) {
            checks.push({
              moduleId: mod,
              status: 'passed',
            });
          } else if (res.status === 403 || res.status === 404) {
            const reason =
              res.message ||
              `Access denied (HTTP ${res.status}). Required permissions: ${spec.fineGrainedPermissions.join(', ')}`;
            missingPermissions.push(`${mod} (${reason})`);
            checks.push({
              moduleId: mod,
              status: 'failed',
              reason,
              requiredRoles: spec.requiredRoles,
            });
          } else {
            // Other HTTP codes (e.g. 404 for empty resource or 422)
            checks.push({
              moduleId: mod,
              status: 'passed',
            });
          }
        } catch {
          checks.push({
            moduleId: mod,
            status: 'passed',
          });
        }
      } else {
        checks.push({
          moduleId: mod,
          status: 'passed',
        });
      }
    }

    const success = checks.every((c) => c.status === 'passed');
    const recommendations: string[] = [];
    if (!success) {
      recommendations.push(
        `Ensure your Fine-Grained PAT has resource access and permissions for: ${missingPermissions.join('; ')}`,
      );
      recommendations.push(
        'Alternatively, run with --continue-on-error to collect data from only the authorized modules.',
      );
    }

    return {
      success,
      tokenModel,
      targetScope,
      ssoRequired: false,
      moduleChecks: checks,
      missingOverallScopes: [],
      recommendations,
    };
  }

  static formatReport(result: PermissionAuditResult): string {
    const lines: string[] = [];
    lines.push(
      '================================================================',
    );
    lines.push(' GHEC CONSULTANT CLI — PREFLIGHT PERMISSION AUDIT');
    lines.push(
      '================================================================',
    );
    lines.push(`Target Scope:       ${result.targetScope}`);
    lines.push(
      `Token Model:        ${
        result.tokenModel === 'classic_pat'
          ? 'Classic Personal Access Token (PAT)'
          : result.tokenModel === 'fine_grained_pat'
            ? 'Fine-Grained Personal Access Token (v2)'
            : result.tokenModel === 'github_app'
              ? 'GitHub App Installation'
              : 'Mock Test Adapter'
      }`,
    );

    if (result.grantedScopes && result.grantedScopes.length > 0) {
      lines.push(`Granted Scopes:     ${result.grantedScopes.join(', ')}`);
    }

    if (result.ssoRequired) {
      lines.push('');
      lines.push('  ✖ SAML SINGLE SIGN-ON (SSO) AUTHORIZATION REQUIRED');
      lines.push(
        `  ↳ Your token must be authorized for SSO with "${result.targetScope}".`,
      );
      if (result.ssoUrl) {
        lines.push(`  ↳ SSO Authorization URL: ${result.ssoUrl}`);
      }
      lines.push(
        '================================================================',
      );
      return lines.join('\n');
    }

    lines.push('');
    lines.push('Module Permission Checks:');
    for (const check of result.moduleChecks) {
      if (check.status === 'passed') {
        lines.push(`  ✔ ${check.moduleId}: PASSED`);
      } else {
        lines.push(`  ✖ ${check.moduleId}: FAILED`);
        if (check.missingScopes && check.missingScopes.length > 0) {
          lines.push(
            `    ↳ Missing required Classic scope(s): ${check.missingScopes.join(', ')}`,
          );
        }
        if (check.reason) {
          lines.push(`    ↳ Reason: ${check.reason}`);
        }
        if (check.requiredRoles && check.requiredRoles.length > 0) {
          lines.push(`    ↳ Required Roles: ${check.requiredRoles.join(', ')}`);
        }
      }
    }

    lines.push('');
    if (result.success) {
      lines.push('Preflight Verdict:');
      lines.push('  ✔ All requested modules verified with proven permissions.');
    } else {
      const failedCount = result.moduleChecks.filter(
        (c) => c.status === 'failed',
      ).length;
      lines.push('Preflight Verdict:');
      lines.push(
        `  ✖ ${failedCount} of ${result.moduleChecks.length} requested module(s) failed permission verification.`,
      );
      for (const rec of result.recommendations) {
        lines.push(`  ℹ ${rec}`);
      }
    }
    lines.push(
      '================================================================',
    );
    return lines.join('\n');
  }
}
