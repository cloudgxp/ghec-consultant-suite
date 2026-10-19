import type { MigrationScope, OrgItemsMode } from '@ghec/contracts';
import type {
  MigrationContext,
  MigrationScopeTarget,
  ScopedRepositoryMapping,
} from './types.js';

/**
 * Builds an organization-level MigrationScopeTarget from a MigrationScope and an organization mapping,
 * attaching scoped repository mappings, orgItemsMode, and multi-org consolidation metadata.
 */
export function buildOrganizationScopeTarget(
  scope: MigrationScope | undefined,
  orgMapping: {
    readonly source: string;
    readonly target: string;
    readonly targetType?: 'ghec' | 'emu' | undefined;
    readonly orgItemsMode?: OrgItemsMode | undefined;
    readonly sandboxRehearsal?: boolean | undefined;
  },
): MigrationScopeTarget {
  const effectiveTargetType =
    orgMapping.targetType ??
    scope?.targetType ??
    (scope?.identityMapping?.strategy === 'pass-through' ? 'ghec' : 'emu');

  const effectiveOrgItemsMode: OrgItemsMode | undefined =
    orgMapping.orgItemsMode ?? scope?.orgItemsMode;

  const effectiveSandboxRehearsal: boolean | undefined =
    orgMapping.sandboxRehearsal ?? scope?.sandboxRehearsal;

  const sourceLower = orgMapping.source.toLowerCase();
  const targetLower = orgMapping.target.toLowerCase();

  const scopedRepositories: ScopedRepositoryMapping[] | undefined =
    scope?.repositories
      ? scope.repositories
          .filter((r) => r.sourceOrg.toLowerCase() === sourceLower)
          .map((r) => {
            const repoKey = `${r.sourceOrg}/${r.sourceRepo}`;
            const repoOptions =
              r.options ??
              scope.repositoryOptions?.[repoKey] ??
              scope.repositoryOptions?.[r.sourceRepo];
            const vis =
              r.targetRepoVisibility ?? repoOptions?.targetRepoVisibility;
            return {
              sourceOrg: r.sourceOrg,
              sourceRepo: r.sourceRepo,
              targetOrg: r.targetOrg,
              targetRepo: r.targetRepo,
              ...(vis ? { targetRepoVisibility: vis } : {}),
            };
          })
      : undefined;

  const targetOrgCount =
    scope?.organizations.filter((o) => o.target.toLowerCase() === targetLower)
      .length ?? 0;

  return {
    level: 'organization',
    sourceOrg: orgMapping.source,
    targetOrg: orgMapping.target,
    targetType: effectiveTargetType,
    ...(effectiveOrgItemsMode ? { orgItemsMode: effectiveOrgItemsMode } : {}),
    ...(effectiveSandboxRehearsal !== undefined
      ? { sandboxRehearsal: effectiveSandboxRehearsal }
      : {}),
    ...(scopedRepositories ? { scopedRepositories } : {}),
    ...(targetOrgCount > 1 ? { isMultiOrgConsolidation: true } : {}),
    identityMapping: scope?.identityMapping,
  };
}

/**
 * Returns true when an organization-level module is running in `associated-only` mode
 * and should filter organization resources to only those associated with in-scope repositories.
 */
export function isAssociatedOnlyOrgMode(ctx: MigrationContext): boolean {
  return (
    ctx.scope.level === 'organization' &&
    ctx.scope.orgItemsMode === 'associated-only'
  );
}

/**
 * Returns a lowercase Set of in-scope source repository names for the current source organization.
 */
export function getScopedSourceRepoNames(
  ctx: MigrationContext,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const r of ctx.scope.scopedRepositories ?? []) {
    if (r.sourceRepo) {
      names.add(r.sourceRepo.toLowerCase());
    }
  }
  return names;
}

/**
 * Returns the list of in-scope target repository names for the current source organization.
 */
export function getScopedTargetRepoNames(
  ctx: MigrationContext,
): readonly string[] {
  return (ctx.scope.scopedRepositories ?? []).map((r) => r.targetRepo);
}

/**
 * Resolves the target repository name for a given source repository name using the scope's
 * repository mappings (supporting `--target-repo-prefix`, `--target-repo-suffix`, or custom renames).
 */
export function getScopedTargetRepoName(
  ctx: MigrationContext,
  sourceRepoName: string,
): string {
  const lower = sourceRepoName.toLowerCase();
  const match = (ctx.scope.scopedRepositories ?? []).find(
    (r) => r.sourceRepo.toLowerCase() === lower,
  );
  return match?.targetRepo ?? sourceRepoName;
}

/**
 * Returns true when all in-scope repositories for this organization are configured
 * to migrate with `public` visibility (or when targetType is `ghec` and explicit public visibility is set).
 */
export function isPublicOnlyTargetScope(ctx: MigrationContext): boolean {
  const repos = ctx.scope.scopedRepositories ?? [];
  if (repos.length === 0) {
    return false;
  }
  return repos.every((r) => r.targetRepoVisibility === 'public');
}

/**
 * Converts a GitHub ruleset repository name pattern (fnmatch / glob or `~ALL`) into a RegExp.
 */
function globPatternToRegExp(pattern: string): RegExp {
  const trimmed = pattern.trim();
  if (trimmed === '~ALL' || trimmed === '*') {
    return /^.*$/i;
  }
  const escaped = trimmed
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Evaluates whether a repository name matches a GitHub organization ruleset's
 * `repository_name` include and exclude patterns.
 */
export function matchesRulesetRepoNameCondition(
  repoName: string,
  includePatterns: readonly string[],
  excludePatterns: readonly string[] = [],
): boolean {
  if (includePatterns.length === 0) {
    return false;
  }
  const included = includePatterns.some((p) =>
    globPatternToRegExp(p).test(repoName),
  );
  if (!included) {
    return false;
  }
  const excluded = excludePatterns.some((p) =>
    globPatternToRegExp(p).test(repoName),
  );
  return !excluded;
}
