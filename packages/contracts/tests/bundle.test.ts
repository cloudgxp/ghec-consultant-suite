import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBundle, type DiscoveryBundle } from '../src/index.js';
function fixture(name = 'enterprise-v1'): DiscoveryBundle {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/synthetic/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as DiscoveryBundle;
}
test('organization and partial enterprise fixtures validate', () => {
  for (const name of ['enterprise-v1', 'organization-v1'])
    assert.equal(validateBundle(fixture(name)).success, true);
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
