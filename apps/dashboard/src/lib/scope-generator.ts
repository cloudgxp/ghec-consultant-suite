import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationScope,
  type RepositoryOptions,
  validateMigrationScope,
} from '@ghec/contracts';

export interface RepositoryScopeItem {
  id?: string;
  name: string;
  visibility?: 'private' | 'internal' | 'public' | string;
  hasLfs?: boolean;
  hasReleases?: boolean;
  options?: RepositoryOptions;
}

export interface ScopeGeneratorOptions {
  name: string;
  sourceOrg: string;
  targetOrg: string;
  repositories: RepositoryScopeItem[];
  repositoryOptions?: Record<string, RepositoryOptions>;
  targetRepoVisibility?: 'private' | 'internal' | 'public' | 'inherit';
  identityStrategy?: 'emu-saml' | 'manual' | 'pass-through';
  identitySuffix?: string;
  lfsStrategy?: 'dual-remote-stream' | 'skip';
  releasesStrategy?: 'stream' | 'skip';
  useGei?: boolean;
  selectedModules?: string[];
}

export function buildMigrationScope(
  options: ScopeGeneratorOptions,
): MigrationScope {
  const sourceOrg = options.sourceOrg.trim();
  const targetOrg = options.targetOrg.trim();
  const name = options.name.trim() || `wave-${Date.now().toString(36)}`;

  const repoOptionsMap: Record<string, RepositoryOptions> = {
    ...options.repositoryOptions,
  };

  const repositories = options.repositories.map((repo) => {
    const repoOptions =
      repo.options ??
      options.repositoryOptions?.[repo.name] ??
      options.repositoryOptions?.[`${sourceOrg}/${repo.name}`];

    if (repoOptions) {
      repoOptionsMap[`${sourceOrg}/${repo.name}`] = repoOptions;
    }

    let visibility: 'private' | 'internal' | 'public' | undefined;
    if (
      repoOptions?.targetRepoVisibility &&
      repoOptions.targetRepoVisibility !== undefined
    ) {
      visibility = repoOptions.targetRepoVisibility;
    } else if (
      options.targetRepoVisibility &&
      options.targetRepoVisibility !== 'inherit'
    ) {
      visibility = options.targetRepoVisibility;
    } else if (
      repo.visibility === 'private' ||
      repo.visibility === 'internal' ||
      repo.visibility === 'public'
    ) {
      visibility = repo.visibility;
    } else {
      visibility = 'private';
    }

    const item: MigrationScope['repositories'][number] = {
      sourceOrg,
      sourceRepo: repo.name,
      targetOrg,
      targetRepo: repo.name,
      useGei: options.useGei ?? true,
      targetRepoVisibility: visibility,
      skipReleases:
        repoOptions?.skipReleases ?? options.releasesStrategy === 'skip',
      lfsStrategy:
        repoOptions?.lfsStrategy ??
        (repoOptions?.skipLfs
          ? 'skip'
          : (options.lfsStrategy ?? 'dual-remote-stream')),
      ...(repoOptions ? { options: repoOptions } : {}),
    };

    if (options.selectedModules && options.selectedModules.length > 0) {
      item.modules = options.selectedModules;
    }

    return item;
  });

  const scope: MigrationScope = {
    version: MIGRATION_SCHEMA_VERSION,
    name,
    organizations: [
      {
        source: sourceOrg,
        target: targetOrg,
        modules: options.selectedModules,
      },
    ],
    repositories,
    ...(Object.keys(repoOptionsMap).length > 0
      ? { repositoryOptions: repoOptionsMap }
      : {}),
    identityMapping: {
      strategy: options.identityStrategy ?? 'emu-saml',
      suffix: options.identitySuffix ?? '_gxp',
    },
  };

  const validation = validateMigrationScope(scope);
  if (!validation.success) {
    const errorMessages = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Generated MigrationScope is invalid: ${errorMessages}`);
  }

  return validation.data;
}
