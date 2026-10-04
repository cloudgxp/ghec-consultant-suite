import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntitySchema } from '@ghec/contracts';
import { ORG_REPOSITORIES_QUERY } from '../../cli/src/collectors/repos.js';
import { NAVIGATION_GROUPS } from '../src/navigation.js';

const base = {
  id: 'org:acme:repo:demo:ownership',
  organizationId: 'org:acme',
  collectorExecutionId: 'org:acme:repos',
  provenance: {
    source: 'synthetic' as const,
    operation: 'test',
    observedAt: '2026-01-01T00:00:00Z',
    apiVersion: null,
  },
  kind: 'code-ownership' as const,
  repositoryId: 'org:acme:repo:demo',
  presence: 'unknown' as const,
  location: 'unknown' as const,
  syntaxStatus: 'unknown' as const,
  ruleCount: {
    value: null,
    unit: 'count' as const,
    availability: 'unknown' as const,
    reason: 'not collected',
  },
  ownerCount: {
    value: null,
    unit: 'count' as const,
    availability: 'unknown' as const,
    reason: 'not collected',
  },
  resolvableTeamCount: {
    value: null,
    unit: 'count' as const,
    availability: 'unknown' as const,
    reason: 'not collected',
  },
  resolvableUserCount: {
    value: null,
    unit: 'count' as const,
    availability: 'unknown' as const,
    reason: 'not collected',
  },
  unresolvedOwnerCount: {
    value: null,
    unit: 'count' as const,
    availability: 'unknown' as const,
    reason: 'not collected',
  },
  reviewPolicyIntegrated: null,
  updatedAt: null,
  coverage: 'unsupported' as const,
  coverageReason: 'safe aggregate parser unavailable',
};

test('ownership contract rejects raw CODEOWNERS content and patterns', () => {
  assert.equal(EntitySchema.safeParse(base).success, true);
  assert.equal(
    EntitySchema.safeParse({ ...base, rawContent: '* @admin' }).success,
    false,
  );
  assert.equal(
    EntitySchema.safeParse({ ...base, patterns: ['*'] }).success,
    false,
  );
});

test('repository GraphQL projection contains portfolio aggregates without blobs or bodies', () => {
  assert.match(ORG_REPOSITORIES_QUERY, /projectsV2/);
  assert.match(ORG_REPOSITORIES_QUERY, /repositoryTopics/);
  assert.doesNotMatch(ORG_REPOSITORIES_QUERY, /\b(blob|body|text|content)\b/i);
});

test('portfolio destinations are discoverable', () => {
  const ids = NAVIGATION_GROUPS.flatMap((group) =>
    group.items.map((item) => item.id),
  );
  assert.ok(ids.includes('portfolio'));
  assert.ok(ids.includes('projects'));
  assert.ok(ids.includes('code-ownership'));
});
