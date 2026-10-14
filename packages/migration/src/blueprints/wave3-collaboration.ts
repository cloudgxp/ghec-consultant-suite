import type { ModuleDecompositionBlueprint } from '@ghec/contracts';

export const discussionsBlueprint: ModuleDecompositionBlueprint = {
  moduleId: 'discussions',
  targetResource: 'Repository Discussions',
  dependencies: ['repo-settings'],
  discoverStage: {
    clientMethod: 'queryDiscussions',
    payloadType: 'DiscussionCategoryState[]',
    queryPattern: 'GraphQL query repository.discussionCategories',
  },
  planStage: {
    diffStrategy: 'discussionCategoryDiff',
    actionTypes: ['CREATE_DISCUSSION_CATEGORY', 'CREATE_DISCUSSION'],
    idempotencyKey: 'discussion-{title}',
  },
  applyStage: {
    clientMethod: 'createDiscussion',
    dryRunSupported: true,
    rateLimitBucket: 'graphql',
    mutationEndpoint: 'GraphQL mutation createDiscussion',
  },
  verifyStage: {
    verificationQuery: 'GraphQL query repository.discussions',
    comparisonKeys: ['title', 'category.name'],
    discrepancySeverity: 'MEDIUM',
  },
};

export const projectsV2Blueprint: ModuleDecompositionBlueprint = {
  moduleId: 'projects-v2',
  targetResource: 'Projects v2 (Memex)',
  dependencies: ['org-settings'],
  discoverStage: {
    clientMethod: 'queryProjectsV2',
    payloadType: 'ProjectV2State[]',
    queryPattern: 'GraphQL query organization.projectsV2',
  },
  planStage: {
    diffStrategy: 'projectTitleDiff',
    actionTypes: ['CREATE_PROJECT_V2', 'CREATE_PROJECT_FIELD'],
    idempotencyKey: 'project-v2-{title}',
  },
  applyStage: {
    clientMethod: 'createProjectV2',
    dryRunSupported: true,
    rateLimitBucket: 'graphql',
    mutationEndpoint: 'GraphQL mutation createProjectV2',
  },
  verifyStage: {
    verificationQuery: 'GraphQL query organization.projectsV2',
    comparisonKeys: ['title', 'fields.nodes.name'],
    discrepancySeverity: 'HIGH',
  },
};

export const WAVE3_BLUEPRINTS: readonly ModuleDecompositionBlueprint[] = [
  discussionsBlueprint,
  projectsV2Blueprint,
];
