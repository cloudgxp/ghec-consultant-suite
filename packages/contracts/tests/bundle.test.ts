import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateBundle,
  type DiscoveryBundle,
  type Entity,
} from '../src/index.js';
function fixture(name = 'enterprise-v1'): DiscoveryBundle {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/synthetic/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as DiscoveryBundle;
}
test('all synthetic fixtures validate', () => {
  for (const name of [
    'enterprise-v1',
    'organization-v1',
    'specialized-v1',
    'partial-denied-v1',
  ])
    assert.equal(validateBundle(fixture(name)).success, true);
});

test('specialized fixture covers newly emitted entity kinds', () => {
  const b = fixture('specialized-v1');
  const kinds = new Set(b.entities.map((e) => e.kind));
  for (const expectedKind of [
    'repository',
    'repository-portfolio',
    'code-ownership',
    'project',
    'dependency-node',
    'dependency-edge',
    'lfs',
    'team',
    'actions',
    'action-workflow',
    'action-run-summary',
    'action-runner',
    'action-runner-group',
    'action-cache',
    'action-artifact',
    'action-environment',
    'action-policy',
    'configuration-metadata',
    'configuration-coverage',
    'policy',
    'security',
    'integration',
    'identity',
    'package',
    'package-version',
    'release',
    'release-asset',
    'large-asset',
  ]) {
    assert.ok(
      kinds.has(expectedKind as Entity['kind']),
      `Missing expected specialized kind: ${expectedKind}`,
    );
  }
});

test('partial-denied fixture models HTTP 403 permission failures and honest unknown metrics', () => {
  const b = fixture('partial-denied-v1');
  assert.equal(b.scan.status, 'partial');
  assert.ok(b.errors.some((e) => e.code === 'permission_denied'));

  const actionsCollector = b.collectors.find((c) => c.module === 'actions');
  assert.ok(actionsCollector);
  assert.equal(actionsCollector.status, 'partial');
  assert.ok(
    actionsCollector.errors.some((e) => e.code === 'permission_denied'),
  );
  assert.equal(actionsCollector.coverage.state, 'partial');

  const deniedConfig = b.entities.find(
    (e) => e.kind === 'configuration-coverage',
  );
  assert.ok(deniedConfig && deniedConfig.kind === 'configuration-coverage');
  assert.equal(deniedConfig.state, 'denied');
  assert.match(deniedConfig.reason, /403/);

  const actionsEntity = b.entities.find((e) => e.kind === 'actions');
  assert.ok(actionsEntity && actionsEntity.kind === 'actions');
  assert.equal(actionsEntity.runnerCount.availability, 'unknown');
  assert.match(actionsEntity.runnerCount.reason ?? '', /403/);
});
test('unsupported versions are rejected explicitly without reflecting input', () => {
  const result = validateBundle({
    ...fixture(),
    schemaVersion: '2.0.0-sensitive-input',
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.code, 'incompatible_version');
    assert.doesNotMatch(result.message, /sensitive-input/);
  }
});
test('required fields and forbidden secret payloads are rejected', () => {
  assert.equal(validateBundle({ schemaVersion: '1.0.0' }).success, false);
  const b = fixture();
  const e = b.entities.find((e) => e.kind === 'actions-secret');
  assert.ok(e);
  Object.assign(e, { value: 'DO_NOT_PERSIST' });
  assert.equal(validateBundle(b).success, false);
});
test('unknown metrics cannot silently become zero', () => {
  const b = fixture();
  const e = b.entities.find((e) => e.kind === 'lfs');
  assert.ok(e && e.kind === 'lfs');
  e.storage.value = 0;
  assert.equal(validateBundle(b).success, false);
});
test('organization boundaries, references, and summary cannot drift', () => {
  for (const change of [
    (b: DiscoveryBundle) => {
      b.entities[0]!.organizationId = 'missing';
    },
    (b: DiscoveryBundle) => {
      b.summary.repositoryCount++;
    },
    (b: DiscoveryBundle) => {
      b.findings[0]!.evidenceExecutionIds = ['missing'];
    },
    (b: DiscoveryBundle) => {
      b.collectors.pop();
    },
    (b: DiscoveryBundle) => {
      b.entities.push(b.entities[0]!);
    },
    (b: DiscoveryBundle) => {
      b.scan.status = 'complete';
    },
    (b: DiscoveryBundle) => {
      b.collectors[0]!.completedAt = '2020-01-01T00:00:00Z';
    },
  ]) {
    const b = fixture();
    change(b);
    assert.equal(validateBundle(b).success, false);
  }
});
test('cross-organization repository access is rejected', () => {
  const b = fixture();
  const team = b.entities.find((e) => e.kind === 'team');
  assert.ok(team && team.kind === 'team');
  team.repositoryAccess[0]!.repositoryId = 'org:fictional-south:repo:demo';
  assert.equal(validateBundle(b).success, false);
});
