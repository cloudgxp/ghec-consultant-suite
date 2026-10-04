import type { DiscoveryBundle } from '@ghec/contracts';

export interface PackageInventoryRecord {
  id: string;
  organizationId: string;
  name: string;
  ecosystem: string;
  visibility: string;
  owner: string | null;
  repositoryId: string | null;
  versionCount: number | null;
  sizeBytes: number | null;
  sizeAvailability: 'observed' | 'unknown' | 'unavailable';
  createdAt: string | null;
  updatedAt: string | null;
  disposition: string;
  provenance: DiscoveryBundle['entities'][number]['provenance'];
  compatibility: 'native' | 'v1-asset';
}

export interface ReleaseAssetInventoryRecord {
  id: string;
  organizationId: string;
  repositoryId: string | null;
  parentId: string | null;
  kind: 'release' | 'release-asset' | 'large-asset' | 'lfs';
  name: string;
  sizeBytes: number | null;
  sizeAvailability: 'observed' | 'unknown' | 'unavailable';
  lifecycleAt: string | null;
  detail: string;
  provenance: DiscoveryBundle['entities'][number]['provenance'];
  compatibility: 'native' | 'v1-asset';
}

/** Explicit compatibility projection for legacy generic v1 asset entities. */
export function packageInventory(
  bundle: DiscoveryBundle,
): PackageInventoryRecord[] {
  return bundle.entities.flatMap((entity): PackageInventoryRecord[] => {
    if (entity.kind === 'package') {
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          name: entity.name,
          ecosystem: entity.ecosystem,
          visibility: entity.visibility,
          owner: entity.owner,
          repositoryId: entity.repositoryId,
          versionCount: entity.versionCount.value,
          sizeBytes: entity.size.value,
          sizeAvailability: entity.size.availability,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          disposition: entity.disposition,
          provenance: entity.provenance,
          compatibility: 'native',
        },
      ];
    }
    if (entity.kind === 'asset' && entity.assetKind === 'package') {
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          name: entity.name,
          ecosystem: 'unknown',
          visibility: 'unknown',
          owner: null,
          repositoryId: entity.repositoryId,
          versionCount: null,
          sizeBytes: entity.size.value,
          sizeAvailability: entity.size.availability,
          createdAt: null,
          updatedAt: null,
          disposition: 'unknown',
          provenance: entity.provenance,
          compatibility: 'v1-asset',
        },
      ];
    }
    return [];
  });
}

export function releaseAssetInventory(
  bundle: DiscoveryBundle,
): ReleaseAssetInventoryRecord[] {
  return bundle.entities.flatMap((entity): ReleaseAssetInventoryRecord[] => {
    if (entity.kind === 'release')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          repositoryId: entity.repositoryId,
          parentId: null,
          kind: 'release',
          name: entity.name,
          sizeBytes: entity.size.value,
          sizeAvailability: entity.size.availability,
          lifecycleAt: entity.publishedAt ?? entity.createdAt,
          detail: entity.tagName ?? 'Tag unavailable',
          provenance: entity.provenance,
          compatibility: 'native',
        },
      ];
    if (entity.kind === 'release-asset')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          repositoryId: entity.repositoryId,
          parentId: entity.releaseId,
          kind: 'release-asset',
          name: entity.name,
          sizeBytes: entity.size.value,
          sizeAvailability: entity.size.availability,
          lifecycleAt: entity.updatedAt ?? entity.createdAt,
          detail: entity.contentType ?? 'Content type unavailable',
          provenance: entity.provenance,
          compatibility: 'native',
        },
      ];
    if (entity.kind === 'large-asset')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          repositoryId: entity.repositoryId,
          parentId: null,
          kind: 'large-asset',
          name: entity.name,
          sizeBytes: entity.size.value,
          sizeAvailability: entity.size.availability,
          lifecycleAt: null,
          detail: entity.path ?? entity.source,
          provenance: entity.provenance,
          compatibility: 'native',
        },
      ];
    if (entity.kind === 'lfs')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          repositoryId: entity.repositoryId,
          parentId: null,
          kind: 'lfs',
          name: 'Git LFS',
          sizeBytes: entity.storage.value,
          sizeAvailability: entity.storage.availability,
          lifecycleAt: null,
          detail: `${entity.indicator}; ${entity.objectCount.value ?? 'unknown'} objects`,
          provenance: entity.provenance,
          compatibility: 'native',
        },
      ];
    if (entity.kind === 'asset' && entity.assetKind !== 'package')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          repositoryId: entity.repositoryId,
          parentId: null,
          kind: entity.assetKind === 'release' ? 'release' : 'large-asset',
          name: entity.name,
          sizeBytes: entity.size.value,
          sizeAvailability: entity.size.availability,
          lifecycleAt: null,
          detail: 'Legacy v1 asset; detailed metadata was not collected',
          provenance: entity.provenance,
          compatibility: 'v1-asset',
        },
      ];
    return [];
  });
}
