import type { ImplementationRoadmapWave } from './types.js';

export const DEFAULT_ROADMAP_WAVES: readonly ImplementationRoadmapWave[] = [
  {
    wave: 1,
    name: 'Wave 1: Governance Baseline & Policy Controls',
    priority: 'P1',
    moduleIds: ['org-settings', 'actions-policies', 'autolinks'],
    rationale:
      'Establishes enterprise organization settings, Actions execution security boundaries, and external tracker autolinks before migrating application repositories.',
  },
  {
    wave: 2,
    name: 'Wave 2: Compute Infrastructure & Access Boundaries',
    priority: 'P2',
    moduleIds: ['actions-runners', 'ip-allow-lists', 'apps-inventory'],
    rationale:
      'Configures self-hosted runner infrastructure, IP allow-list network boundaries, and completes third-party app migration advisories before CI cutover.',
  },
  {
    wave: 3,
    name: 'Wave 3: Collaboration & Workspace Metadata',
    priority: 'P3',
    moduleIds: [
      'discussions',
      'projects-v2',
      'repo-topics',
      'repo-templates',
      'interaction-limits',
    ],
    rationale:
      'Reconstructs complex GraphQL collaboration structures (Discussions, Projects v2) and secondary metadata during post-cutover workspace consolidation.',
  },
];

/**
 * Validates that roadmap waves are ordered sequentially without circular or reverse dependencies.
 */
export function validateRoadmapWaveOrdering(
  waves: readonly ImplementationRoadmapWave[],
): boolean {
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (!wave || wave.wave !== i + 1) {
      return false;
    }
  }
  return true;
}
