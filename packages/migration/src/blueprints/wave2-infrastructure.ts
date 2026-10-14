import type { ModuleDecompositionBlueprint } from '@ghec/contracts';

export const actionsRunnersBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'actions-runners',
  targetResource: 'Actions Self-Hosted Runner Groups',
  dependencies: ['actions-policies'],
  discoverStage: {
    clientMethod: 'listRunnerGroups',
    payloadType: 'RunnerGroupState[]',
    queryPattern: 'GET /orgs/{org}/actions/runner-groups',
  },
  planStage: {
    diffStrategy: 'groupNameDiff',
    actionTypes: ['CREATE_RUNNER_GROUP', 'UPDATE_RUNNER_GROUP_REPOS'],
    idempotencyKey: 'runner-group-{name}',
  },
  applyStage: {
    clientMethod: 'createOrUpdateRunnerGroup',
    dryRunSupported: true,
    rateLimitBucket: 'core',
    mutationEndpoint: 'POST /orgs/{org}/actions/runner-groups',
  },
  verifyStage: {
    verificationQuery: 'GET /orgs/{org}/actions/runner-groups',
    comparisonKeys: ['name', 'visibility', 'allows_public_repositories'],
    discrepancySeverity: 'HIGH',
  },
};

export const ipAllowListsBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'ip-allow-lists',
  targetResource: 'IP Allow Lists / CIDR Restrictions',
  dependencies: ['org-settings'],
  discoverStage: {
    clientMethod: 'queryIpAllowListEntries',
    payloadType: 'IpAllowListEntry[]',
    queryPattern: 'GraphQL query organization.ipAllowListEntries',
  },
  planStage: {
    diffStrategy: 'cidrDiff',
    actionTypes: ['CREATE_IP_ALLOW_LIST_ENTRY'],
    idempotencyKey: 'ip-allow-{cidr}',
  },
  applyStage: {
    clientMethod: 'createIpAllowListEntry',
    dryRunSupported: true,
    rateLimitBucket: 'graphql',
    mutationEndpoint: 'GraphQL mutation createIpAllowListEntry',
  },
  verifyStage: {
    verificationQuery: 'GraphQL query organization.ipAllowListEntries',
    comparisonKeys: ['cidr', 'isActive'],
    discrepancySeverity: 'CRITICAL',
  },
};

export const appsInventoryBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'apps-inventory',
  targetResource: 'GitHub Apps & Integrations Inventory',
  dependencies: ['org-settings'],
  discoverStage: {
    clientMethod: 'listAppInstallations',
    payloadType: 'AppInstallationState[]',
    queryPattern: 'GET /orgs/{org}/installations',
  },
  planStage: {
    diffStrategy: 'appSlugDiff',
    actionTypes: ['EMIT_REINSTALLATION_ADVISORY'],
    idempotencyKey: 'app-advisory-{slug}',
  },
  applyStage: {
    clientMethod: 'generateAdvisoryReport',
    dryRunSupported: true,
    rateLimitBucket: 'core',
    mutationEndpoint: 'No mutation (Operator Advisory)',
  },
  verifyStage: {
    verificationQuery: 'GET /orgs/{org}/installations',
    comparisonKeys: ['app_slug', 'permissions'],
    discrepancySeverity: 'MEDIUM',
  },
};

export const WAVE2_BLUEPRINTS: readonly ModuleDecompositionBlueprint[] = [
  actionsRunnersBlueprint,
  ipAllowListsBlueprint,
  appsInventoryBlueprint,
];
