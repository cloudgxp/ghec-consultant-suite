import type { DiscoveryBundle } from '@ghec/contracts';

type Entity = DiscoveryBundle['entities'][number];

export interface WorkflowRecord {
  id: string;
  organizationId: string;
  repositoryId: string;
  name: string;
  state: string;
  reusable: boolean | null;
  lastActivityAt: string | null;
  runCount: number | null;
  compatibility: 'native' | 'v1-summary';
  provenance: Entity['provenance'];
}

export function workflowInventory(bundle: DiscoveryBundle): WorkflowRecord[] {
  const nativeRepositoryIds = new Set(
    bundle.entities
      .filter((entity) => entity.kind === 'action-workflow')
      .map((entity) => entity.repositoryId),
  );
  return bundle.entities.flatMap((entity): WorkflowRecord[] => {
    if (entity.kind === 'action-workflow')
      return [
        {
          id: entity.id,
          organizationId: entity.organizationId,
          repositoryId: entity.repositoryId,
          name: entity.name,
          state: entity.state,
          reusable: entity.reusable,
          lastActivityAt: entity.lastRunAt ?? entity.updatedAt,
          runCount: entity.runCount.value,
          compatibility: 'native',
          provenance: entity.provenance,
        },
      ];
    if (
      entity.kind === 'actions' &&
      !nativeRepositoryIds.has(entity.repositoryId)
    )
      return entity.workflowNames.map((name, index) => ({
        id: `${entity.id}:workflow:${index}`,
        organizationId: entity.organizationId,
        repositoryId: entity.repositoryId,
        name,
        state: entity.enabled === false ? 'disabled' : 'unknown',
        reusable: null,
        lastActivityAt: null,
        runCount: null,
        compatibility: 'v1-summary',
        provenance: entity.provenance,
      }));
    return [];
  });
}

export type RunnerRecord = Extract<
  Entity,
  { kind: 'action-runner' | 'action-runner-group' }
>;
export type OperationsRecord = Extract<
  Entity,
  { kind: 'action-cache' | 'action-artifact' }
>;
export type EnvironmentPolicyRecord = Extract<
  Entity,
  { kind: 'action-environment' | 'action-policy' }
>;

export const runnersInventory = (bundle: DiscoveryBundle) =>
  bundle.entities.filter(
    (entity): entity is RunnerRecord =>
      entity.kind === 'action-runner' || entity.kind === 'action-runner-group',
  );

export const operationsInventory = (bundle: DiscoveryBundle) =>
  bundle.entities.filter(
    (entity): entity is OperationsRecord =>
      entity.kind === 'action-cache' || entity.kind === 'action-artifact',
  );

export const environmentPolicyInventory = (bundle: DiscoveryBundle) =>
  bundle.entities.filter(
    (entity): entity is EnvironmentPolicyRecord =>
      entity.kind === 'action-environment' || entity.kind === 'action-policy',
  );
