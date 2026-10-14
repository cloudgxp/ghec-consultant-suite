import { ALL_ORG_PROVISIONERS } from './org/index.js';
import { ALL_REPO_PROVISIONERS } from './repo/index.js';
import { SeedingOrchestrator } from './orchestrator.js';
import type { ItemProvisioner } from './types.js';

export const ALL_32_PROVISIONERS: ItemProvisioner[] = [
  ...ALL_ORG_PROVISIONERS,
  ...ALL_REPO_PROVISIONERS,
];

export function createDefaultOrchestrator(): SeedingOrchestrator {
  return new SeedingOrchestrator(ALL_32_PROVISIONERS);
}

export * from './client.js';
export * from './catalog.js';
export * from './types.js';
export * from './orchestrator.js';
