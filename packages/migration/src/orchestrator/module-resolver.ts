import type { MigrationScope } from '@ghec/contracts';
import type { ClassifiedRepositoryStrategy } from './slicer.js';

export const ALL_ORGANIZATION_MODULES = [
  'org-variables',
  'org-secrets',
  'org-custom-properties',
  'teams',
  'post-migration-mannequins',
  'packages',
  'custom-roles',
  'org-settings',
  'org-rulesets',
  'org-webhooks',
  'actions-policies',
  'actions-runners',
  'ip-allow-lists',
  'apps-inventory',
  'projects-v2',
] as const;

export const ALL_REPOSITORY_MODULES = [
  'gei-repo',
  'repo-variables',
  'repo-secrets',
  'environments',
  'webhooks',
  'repo-settings',
  'repo-custom-properties',
  'rulesets',
  'branch-protection',
  'post-migration-codeowners',
  'security',
  'releases',
  'deploy-keys',
  'collaborators',
  'lfs',
  'issues',
  'pull-requests',
  'autolinks',
  'discussions',
] as const;

export interface AutoModuleResolutionResult {
  readonly applyModules: readonly string[];
  readonly verifyModules: readonly string[];
}

export interface AutoRepositoryModuleResolutionOptions {
  readonly repositoryOptions?: MigrationScope['repositoryOptions'] | undefined;
  readonly strategy?: Partial<ClassifiedRepositoryStrategy> | undefined;
  readonly baseModules?: readonly string[] | undefined;
  readonly excludeModules?: readonly string[] | undefined;
}

export interface ParsedModuleSelection {
  readonly modules?: readonly string[] | undefined;
  readonly excludeModules: readonly string[];
  readonly isAuto: boolean;
}

/**
 * Parses `--modules` and `--exclude-modules` inputs, supporting:
 * - `--modules auto`
 * - Inline negations such as `--modules auto,-teams,-post-migration-mannequins` or `!teams`
 * - Explicit `--exclude-modules teams,post-migration-mannequins`
 */
export function parseModuleSelectionFlags(
  modulesInput?: string | readonly string[] | undefined,
  excludeInput?: string | readonly string[] | undefined,
): ParsedModuleSelection {
  const rawTokens: string[] = [];
  if (typeof modulesInput === 'string') {
    rawTokens.push(
      ...modulesInput
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    );
  } else if (Array.isArray(modulesInput)) {
    for (const item of modulesInput) {
      rawTokens.push(
        ...String(item)
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
      );
    }
  }

  const excludeSet = new Set<string>();
  if (typeof excludeInput === 'string') {
    for (const token of excludeInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)) {
      const cleaned = token.replace(/^[-!]+/, '').trim();
      if (cleaned) {
        excludeSet.add(cleaned);
      }
    }
  } else if (Array.isArray(excludeInput)) {
    for (const item of excludeInput) {
      for (const token of String(item)
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)) {
        const cleaned = token.replace(/^[-!]+/, '').trim();
        if (cleaned) {
          excludeSet.add(cleaned);
        }
      }
    }
  }

  const positiveTokens: string[] = [];
  let isAuto = false;
  let isAll = false;

  for (const token of rawTokens) {
    if (token.startsWith('-') || token.startsWith('!')) {
      const cleaned = token.replace(/^[-!]+/, '').trim();
      if (cleaned) {
        excludeSet.add(cleaned);
      }
      continue;
    }
    const lower = token.toLowerCase();
    if (lower === 'auto') {
      isAuto = true;
      positiveTokens.push('auto');
    } else if (lower === 'all') {
      isAll = true;
    } else {
      positiveTokens.push(token);
    }
  }

  const excludeModules = Array.from(excludeSet);
  const filteredPositive = positiveTokens.filter((t) => !excludeSet.has(t));

  return {
    modules: isAll
      ? undefined
      : filteredPositive.length > 0
        ? filteredPositive
        : undefined,
    excludeModules,
    isAuto,
  };
}

/**
 * Determines whether a module list requests automatic strategy-aware resolution.
 */
export function isAutoModuleSelection(
  modules?: readonly string[] | undefined,
): boolean {
  if (!modules || modules.length === 0) {
    return false;
  }
  return modules.some((m) => m.trim().toLowerCase() === 'auto');
}

/**
 * Resolves organization-level apply and verify module sets under `--modules auto`,
 * honoring any excluded modules.
 */
export function resolveAutoOrganizationModules(
  org?: MigrationScope['organizations'][number] | undefined,
  baseModules?: readonly string[] | undefined,
  excludeModules?: readonly string[] | undefined,
): AutoModuleResolutionResult {
  const parsed = parseModuleSelectionFlags(
    baseModules ?? org?.modules,
    excludeModules,
  );
  const excludeSet = new Set(parsed.excludeModules);

  const raw = parsed.modules ?? org?.modules ?? ALL_ORGANIZATION_MODULES;
  const filtered = raw.filter((m) => {
    const trimmed = m.trim();
    const lower = trimmed.toLowerCase();
    return (
      lower !== 'auto' &&
      lower !== 'all' &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('!') &&
      !excludeSet.has(trimmed)
    );
  });
  const resolved = (
    filtered.length > 0 ? filtered : [...ALL_ORGANIZATION_MODULES]
  ).filter((id) => !excludeSet.has(id));

  return {
    applyModules: resolved,
    verifyModules: resolved,
  };
}

/**
 * Resolves repository-level apply and verify module sets based on the repository's
 * transfer strategy (GEI standard vs. GEI --skip-releases vs. Git LFS vs. mirror-push),
 * honoring any excluded modules.
 */
export function resolveAutoRepositoryModules(
  repo: MigrationScope['repositories'][number],
  options?: AutoRepositoryModuleResolutionOptions | undefined,
): AutoModuleResolutionResult {
  const repoKey = `${repo.sourceOrg}/${repo.sourceRepo}`;
  const repoOptions =
    repo.options ??
    options?.repositoryOptions?.[repoKey] ??
    options?.repositoryOptions?.[repo.sourceRepo];
  const strategy = options?.strategy;

  const parsed = parseModuleSelectionFlags(
    options?.baseModules ?? repo.modules,
    options?.excludeModules,
  );
  const excludeSet = new Set(parsed.excludeModules);

  const useMirrorPush =
    strategy?.useMirrorPush ??
    (repo.useGei === false ||
      repo.gitTransferStrategy === 'mirror-push' ||
      repoOptions?.gitTransferStrategy === 'mirror-push');

  const skipReleases =
    strategy?.skipReleases ??
    repo.skipReleases ??
    repoOptions?.skipReleases ??
    useMirrorPush;

  const useReleaseFallback = strategy?.useReleaseFallback ?? skipReleases;

  const hasExplicitLfsStrategy =
    (repo.lfsStrategy ?? repoOptions?.lfsStrategy) === 'dual-remote-stream' &&
    repoOptions?.skipLfs !== true;

  const useLfsStreamer =
    Boolean(strategy?.useLfsStreamer) || hasExplicitLfsStrategy;

  const raw = options?.baseModules ?? repo.modules ?? ALL_REPOSITORY_MODULES;
  const filtered = raw.filter((m) => {
    const trimmed = m.trim();
    const lower = trimmed.toLowerCase();
    return (
      lower !== 'auto' &&
      lower !== 'all' &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('!') &&
      !excludeSet.has(trimmed)
    );
  });
  const candidateModules = (
    filtered.length > 0 ? filtered : [...ALL_REPOSITORY_MODULES]
  ).filter((id) => !excludeSet.has(id));

  const applyModules = candidateModules.filter((id) => {
    if (id === 'issues' || id === 'pull-requests') {
      return useMirrorPush;
    }
    if (id === 'releases') {
      return useMirrorPush || skipReleases || useReleaseFallback;
    }
    if (id === 'lfs') {
      return useLfsStreamer;
    }
    return true;
  });

  return {
    applyModules,
    verifyModules: applyModules,
  };
}
