import type { DiscoveryBundle } from '@ghec/contracts';

type Entity = DiscoveryBundle['entities'][number];
export interface ConfigurationRecord {
  id: string;
  organizationId: string;
  domain: 'actions' | 'dependabot' | 'codespaces' | 'environment' | 'copilot';
  configurationKind: 'secret' | 'variable';
  name: string;
  level: 'organization' | 'repository' | 'environment';
  repositoryId: string | null;
  environmentName: string | null;
  parentId: string | null;
  accessMode: string;
  selectedRepositoryIds: readonly string[];
  selectedRepositoryCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  provenance: Entity['provenance'];
  compatibility: 'native' | 'v1-actions';
}

export function configurationInventory(
  bundle: DiscoveryBundle,
): ConfigurationRecord[] {
  return bundle.entities.flatMap((entity): ConfigurationRecord[] => {
    if (entity.kind === 'configuration-metadata')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          domain: entity.domain,
          configurationKind: entity.configurationKind,
          name: entity.name,
          level: entity.level,
          repositoryId: entity.repositoryId,
          environmentName: entity.environmentName,
          parentId: entity.parentId,
          accessMode: entity.accessMode,
          selectedRepositoryIds: entity.selectedRepositoryIds,
          selectedRepositoryCount: entity.selectedRepositoryCount.value,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          provenance: entity.provenance,
          compatibility: 'native',
        },
      ];
    if (entity.kind === 'actions-secret')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          domain: 'actions',
          configurationKind: entity.configurationKind,
          name: entity.name,
          level: entity.level,
          repositoryId: entity.repositoryId,
          environmentName: null,
          parentId: entity.repositoryId,
          accessMode: 'unknown',
          selectedRepositoryIds: [],
          selectedRepositoryCount: null,
          createdAt: null,
          updatedAt: entity.updatedAt,
          provenance: entity.provenance,
          compatibility: 'v1-actions',
        },
      ];
    return [];
  });
}

export type ConfigurationCoverage = Extract<
  Entity,
  { kind: 'configuration-coverage' }
>;
export const configurationCoverage = (bundle: DiscoveryBundle) =>
  bundle.entities.filter(
    (entity): entity is ConfigurationCoverage =>
      entity.kind === 'configuration-coverage',
  );

export function freshness(
  record: ConfigurationRecord,
  now: Date,
): 'current' | 'stale' | 'unknown' {
  if (!record.updatedAt) return 'unknown';
  const age = now.getTime() - Date.parse(record.updatedAt);
  return age > 365 * 24 * 60 * 60 * 1000 ? 'stale' : 'current';
}
