import type { ModuleDecompositionBlueprint } from '@ghec/contracts';

export const orgSettingsBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'org-settings',
  targetResource: 'Organization Settings & Member Privileges',
  dependencies: [],
  discoverStage: {
    clientMethod: 'getOrgSettings',
    payloadType: 'OrgSettingsState',
    queryPattern: 'GET /orgs/{org}',
  },
  planStage: {
    diffStrategy: 'shallowKeyDiff',
    actionTypes: ['UPDATE_ORG_SETTING'],
    idempotencyKey: 'org-settings-{key}',
  },
  applyStage: {
    clientMethod: 'updateOrgSettings',
    dryRunSupported: true,
    rateLimitBucket: 'core',
    mutationEndpoint: 'PATCH /orgs/{org}',
  },
  verifyStage: {
    verificationQuery: 'GET /orgs/{org}',
    comparisonKeys: [
      'default_repository_permission',
      'members_can_create_repositories',
      'members_can_fork_private_repositories',
    ],
    discrepancySeverity: 'HIGH',
  },
};

export const actionsPoliciesBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'actions-policies',
  targetResource: 'Actions Policies & Permissions',
  dependencies: ['org-settings'],
  discoverStage: {
    clientMethod: 'getActionsPermissions',
    payloadType: 'ActionsPermissionsState',
    queryPattern: 'GET /orgs/{org}/actions/permissions',
  },
  planStage: {
    diffStrategy: 'permissionDiff',
    actionTypes: ['SET_ACTIONS_ENABLED_REPOS', 'SET_ALLOWED_ACTIONS'],
    idempotencyKey: 'actions-policies-{org}',
  },
  applyStage: {
    clientMethod: 'setActionsPermissions',
    dryRunSupported: true,
    rateLimitBucket: 'core',
    mutationEndpoint: 'PUT /orgs/{org}/actions/permissions',
  },
  verifyStage: {
    verificationQuery: 'GET /orgs/{org}/actions/permissions',
    comparisonKeys: ['enabled_repositories', 'allowed_actions'],
    discrepancySeverity: 'CRITICAL',
  },
};

export const autolinksBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'autolinks',
  targetResource: 'Repository Autolinks',
  dependencies: ['repo-settings'],
  discoverStage: {
    clientMethod: 'listAutolinks',
    payloadType: 'AutolinkState[]',
    queryPattern: 'GET /repos/{owner}/{repo}/autolinks',
  },
  planStage: {
    diffStrategy: 'keyPrefixDiff',
    actionTypes: ['CREATE_AUTOLINK'],
    idempotencyKey: 'autolink-{keyPrefix}',
  },
  applyStage: {
    clientMethod: 'createAutolink',
    dryRunSupported: true,
    rateLimitBucket: 'core',
    mutationEndpoint: 'POST /repos/{owner}/{repo}/autolinks',
  },
  verifyStage: {
    verificationQuery: 'GET /repos/{owner}/{repo}/autolinks',
    comparisonKeys: ['key_prefix', 'url_template'],
    discrepancySeverity: 'MEDIUM',
  },
};

export const WAVE1_BLUEPRINTS: readonly ModuleDecompositionBlueprint[] = [
  orgSettingsBlueprint,
  actionsPoliciesBlueprint,
  autolinksBlueprint,
];
