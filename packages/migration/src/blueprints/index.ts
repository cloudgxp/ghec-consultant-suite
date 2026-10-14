import type { ModuleDecompositionBlueprint } from '@ghec/contracts';
import { WAVE1_BLUEPRINTS } from './wave1-governance.js';
import { WAVE2_BLUEPRINTS } from './wave2-infrastructure.js';
import { WAVE3_BLUEPRINTS } from './wave3-collaboration.js';

export * from './wave1-governance.js';
export * from './wave2-infrastructure.js';
export * from './wave3-collaboration.js';

export const ALL_BLUEPRINTS: readonly ModuleDecompositionBlueprint[] = [
  ...WAVE1_BLUEPRINTS,
  ...WAVE2_BLUEPRINTS,
  ...WAVE3_BLUEPRINTS,
];

export function getBlueprint(
  moduleId: string,
): ModuleDecompositionBlueprint | undefined {
  return ALL_BLUEPRINTS.find((b) => b.moduleId === moduleId);
}
