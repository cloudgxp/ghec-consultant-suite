import type {
  RepositoryVisibility,
  RepoSettingsModuleOptions,
} from './types.js';

/**
 * Normalizes raw API response fields into a typed RepositoryVisibility.
 */
export function normalizeVisibility(
  rawVisibility?: string | undefined,
  isPrivate?: boolean | undefined,
): RepositoryVisibility {
  if (
    rawVisibility === 'public' ||
    rawVisibility === 'internal' ||
    rawVisibility === 'private'
  ) {
    return rawVisibility;
  }
  if (isPrivate === false) {
    return 'public';
  }
  return 'private';
}

/**
 * Determines the intended target visibility based on source visibility and module options.
 */
export function determineTargetVisibility(
  sourceVisibility: RepositoryVisibility,
  options?: RepoSettingsModuleOptions | undefined,
): RepositoryVisibility {
  if (options?.visibilityOverride) {
    return options.visibilityOverride;
  }
  return sourceVisibility;
}

/**
 * Resolves safe fallback visibility when enterprise policy disallows public repositories.
 */
export function resolvePolicyFallbackVisibility(
  desiredVisibility: RepositoryVisibility,
  options?: RepoSettingsModuleOptions | undefined,
): RepositoryVisibility {
  if (
    desiredVisibility === 'public' &&
    options?.enforceInternalForPublic !== false
  ) {
    return 'internal';
  }
  return desiredVisibility;
}
