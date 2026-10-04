export type { DiscoveryPlan } from './plan.js';
export type { DiscoveryConfig } from './config.js';

export {
  DiscoveryOrchestrator,
  PREFLIGHT_PROBE_QUERY,
  PROBE_ORG_QUERY,
  PROBE_ENTERPRISE_QUERY,
  ENTERPRISE_ORGANIZATIONS_QUERY,
  type DiscoveryResult,
} from './engine/orchestrator.js';
export {
  CheckpointManager,
  writeAtomicJson,
  type CheckpointManagerOptions,
  type CheckpointManifest,
} from './engine/checkpoint.js';

export { collectors } from './collectors/index.js';
export type {
  Collector,
  CollectorContext,
  CollectorResult,
  DiscoveredPolicyItem,
  DiscoveredState,
} from './collectors/types.js';
export * from './collectors/aggregators/index.js';
export { collector as orgsCollector } from './collectors/orgs.js';
export {
  collector as reposCollector,
  ORG_REPOSITORIES_QUERY,
} from './collectors/repos.js';
export { collector as lfsCollector } from './collectors/lfs.js';
export { collector as teamsCollector } from './collectors/teams.js';
export { collector as actionsCollector } from './collectors/actions.js';
export { collector as actionsSecretsCollector } from './collectors/actions-secrets.js';
export { collector as policiesCollector } from './collectors/policies.js';
export { collector as securityCollector } from './collectors/security.js';
export { collector as integrationsCollector } from './collectors/integrations.js';
export { collector as usersCollector } from './collectors/users.js';
export { collector as packagesCollector } from './collectors/packages.js';

export * from './permissions/index.js';
export * from './output/publisher.js';
export * from './output/sanitizer.js';
