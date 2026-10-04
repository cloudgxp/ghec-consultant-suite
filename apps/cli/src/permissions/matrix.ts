import type { ModuleId } from '@ghec/contracts';

export interface ModulePermissionSpec {
  readonly moduleId: ModuleId;
  /**
   * Disjunctive Normal Form of required classic scopes:
   * e.g. [['repo'], ['admin:org', 'read:org']] means
   * requires 'repo' AND ('admin:org' OR 'read:org').
   */
  readonly requiredClassicScopeGroups: readonly (readonly string[])[];
  /** Recommended minimum classic PAT scopes to show in error suggestions */
  readonly recommendedClassicScopes: readonly string[];
  /** Fine-grained PAT / GitHub App permission name and level */
  readonly fineGrainedPermissions: readonly string[];
  /** Documented required organizational roles */
  readonly requiredRoles: readonly string[];
  /** Lightweight REST probe endpoint (path template using {org}) */
  readonly probePath: string;
}

export const MODULE_PERMISSION_SPECS: Record<ModuleId, ModulePermissionSpec> = {
  orgs: {
    moduleId: 'orgs',
    requiredClassicScopeGroups: [['admin:org', 'read:org']],
    recommendedClassicScopes: ['admin:org'],
    fineGrainedPermissions: [
      'organization_administration:read',
      'members:read',
    ],
    requiredRoles: ['Organization Owner', 'Organization Member'],
    probePath: '/orgs/{org}',
  },
  repos: {
    moduleId: 'repos',
    requiredClassicScopeGroups: [['repo', 'public_repo']],
    recommendedClassicScopes: ['repo'],
    fineGrainedPermissions: ['administration:read', 'metadata:read'],
    requiredRoles: ['Repository Admin', 'Organization Member (with repo read)'],
    probePath: '/orgs/{org}/repos?per_page=1',
  },
  lfs: {
    moduleId: 'lfs',
    requiredClassicScopeGroups: [
      ['repo', 'public_repo'],
      ['read:org', 'admin:org'],
    ],
    recommendedClassicScopes: ['repo', 'admin:org'],
    fineGrainedPermissions: ['metadata:read'],
    requiredRoles: ['Organization Owner', 'Billing Manager'],
    probePath: '/orgs/{org}/repos?per_page=1',
  },
  teams: {
    moduleId: 'teams',
    requiredClassicScopeGroups: [['read:org', 'admin:org']],
    recommendedClassicScopes: ['admin:org'],
    fineGrainedPermissions: [
      'organization_administration:read',
      'members:read',
    ],
    requiredRoles: ['Organization Owner', 'Team Maintainer'],
    probePath: '/orgs/{org}/teams?per_page=1',
  },
  actions: {
    moduleId: 'actions',
    requiredClassicScopeGroups: [
      ['repo'],
      ['admin:org', 'manage_runners:enterprise'],
    ],
    recommendedClassicScopes: ['repo', 'admin:org'],
    fineGrainedPermissions: [
      'actions:read',
      'organization_administration:read',
    ],
    requiredRoles: ['Organization Owner', 'Enterprise Runner Admin'],
    probePath: '/orgs/{org}/actions/permissions',
  },
  'actions-secrets': {
    moduleId: 'actions-secrets',
    requiredClassicScopeGroups: [['repo'], ['admin:org']],
    recommendedClassicScopes: ['repo', 'admin:org'],
    fineGrainedPermissions: [
      'secrets:read',
      'organization_administration:read',
    ],
    requiredRoles: ['Repository Admin', 'Organization Owner'],
    probePath: '/orgs/{org}/actions/secrets?per_page=1',
  },
  policies: {
    moduleId: 'policies',
    requiredClassicScopeGroups: [['repo'], ['admin:org']],
    recommendedClassicScopes: ['repo', 'admin:org'],
    fineGrainedPermissions: [
      'administration:read',
      'organization_administration:read',
    ],
    requiredRoles: ['Repository Admin', 'Organization Owner'],
    probePath: '/orgs/{org}/rulesets?per_page=1',
  },
  security: {
    moduleId: 'security',
    requiredClassicScopeGroups: [
      ['security_events'],
      ['admin:org', 'read:org', 'repo'],
    ],
    recommendedClassicScopes: ['security_events', 'admin:org'],
    fineGrainedPermissions: [
      'security_events:read',
      'organization_administration:read',
    ],
    requiredRoles: ['Security Manager', 'Organization Owner'],
    probePath: '/orgs/{org}/dependabot/alerts?per_page=1',
  },
  integrations: {
    moduleId: 'integrations',
    requiredClassicScopeGroups: [['admin:org'], ['admin:repo_hook']],
    recommendedClassicScopes: ['admin:org', 'admin:repo_hook'],
    fineGrainedPermissions: ['organization_administration:read'],
    requiredRoles: ['Organization Owner', 'GitHub App Manager'],
    probePath: '/orgs/{org}/installations?per_page=1',
  },
  users: {
    moduleId: 'users',
    requiredClassicScopeGroups: [['read:org', 'admin:org']],
    recommendedClassicScopes: ['read:org'],
    fineGrainedPermissions: [
      'members:read',
      'organization_administration:read',
    ],
    requiredRoles: ['Organization Owner', 'Organization Member'],
    probePath: '/orgs/{org}/members?per_page=1',
  },
  packages: {
    moduleId: 'packages',
    requiredClassicScopeGroups: [['read:packages'], ['repo', 'public_repo']],
    recommendedClassicScopes: ['read:packages', 'repo'],
    fineGrainedPermissions: ['packages:read'],
    requiredRoles: ['Package Reader', 'Repository Collaborator'],
    probePath: '/orgs/{org}/packages?package_type=npm&per_page=1',
  },
};

/**
 * Checks if a specific requested scope is satisfied by the set of granted scopes,
 * accounting for GitHub OAuth scope inheritance.
 */
export function hasClassicScope(
  grantedScopes: ReadonlySet<string>,
  requiredScope: string,
): boolean {
  if (grantedScopes.has(requiredScope)) return true;

  // Inheritance rules
  switch (requiredScope) {
    case 'read:org':
      return grantedScopes.has('admin:org');
    case 'public_repo':
      return grantedScopes.has('repo');
    case 'read:repo_hook':
      return (
        grantedScopes.has('admin:repo_hook') ||
        grantedScopes.has('write:repo_hook')
      );
    case 'write:repo_hook':
      return grantedScopes.has('admin:repo_hook');
    case 'read:org_hook':
      return (
        grantedScopes.has('admin:org_hook') ||
        grantedScopes.has('write:org_hook')
      );
    case 'write:org_hook':
      return grantedScopes.has('admin:org_hook');
    case 'read:enterprise':
      return grantedScopes.has('admin:enterprise');
    case 'manage_runners:enterprise':
      return grantedScopes.has('admin:enterprise');
    default:
      return false;
  }
}

/**
 * Evaluates whether granted scopes satisfy a module's required scope groups.
 * Returns { satisfied: boolean, missingRecommendations: string[] }
 */
export function checkModuleClassicScopes(
  moduleId: ModuleId,
  grantedScopes: ReadonlySet<string>,
): {
  satisfied: boolean;
  missingRecommendations: string[];
} {
  const spec = MODULE_PERMISSION_SPECS[moduleId];
  if (!spec) return { satisfied: true, missingRecommendations: [] };

  const unsatisfiedGroups: (readonly string[])[] = [];

  for (const group of spec.requiredClassicScopeGroups) {
    const groupSatisfied = group.some((scope) =>
      hasClassicScope(grantedScopes, scope),
    );
    if (!groupSatisfied) {
      unsatisfiedGroups.push(group);
    }
  }

  if (unsatisfiedGroups.length === 0) {
    return { satisfied: true, missingRecommendations: [] };
  }

  // Pick the recommended scope from each unsatisfied group
  const missingRecommendations = Array.from(
    new Set(
      unsatisfiedGroups.map((group) => {
        const rec = spec.recommendedClassicScopes.find((r) =>
          group.includes(r),
        );
        return rec ?? group[0]!;
      }),
    ),
  );

  return {
    satisfied: false,
    missingRecommendations,
  };
}
