import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOUNDARY_PROFILES,
  getBoundaryProfile,
  isGeiNativeSupported,
  requiresApiRehydration,
} from '../src/index.js';

test('boundary reconciliation matrix covers all 42 platform resource profiles', () => {
  assert.equal(BOUNDARY_PROFILES.length, 42);
  const mechanisms = new Set(BOUNDARY_PROFILES.map((p) => p.mechanism));
  assert.deepEqual(Array.from(mechanisms).sort(), [
    'gei_native',
    'graphql_mutation',
    'manual_advisory',
    'rest_rehydration',
  ]);
});

test('boundary matrix identifies native GEI support accurately', () => {
  assert.equal(isGeiNativeSupported('git-repository-source'), true);
  assert.equal(isGeiNativeSupported('pull-requests'), true);
  assert.equal(isGeiNativeSupported('issues-and-milestones'), true);
  assert.equal(isGeiNativeSupported('repository-wikis'), true);
  assert.equal(isGeiNativeSupported('releases-standard'), true);

  // Dropped resources are not full native support
  assert.equal(isGeiNativeSupported('repository-rulesets'), false);
  assert.equal(isGeiNativeSupported('repository-variables'), false);
  assert.equal(isGeiNativeSupported('git-lfs-objects'), false);
});

test('boundary matrix identifies API rehydration requirement accurately', () => {
  assert.equal(requiresApiRehydration('repository-rulesets'), true);
  assert.equal(requiresApiRehydration('git-repository-source'), false);
  assert.equal(requiresApiRehydration('classic-branch-protections'), true);
});

test('classic branch protection captures all 7 omitted settings per DEC-009', () => {
  const profile = getBoundaryProfile('classic-branch-protections');
  assert.ok(profile);
  assert.equal(profile.mechanism, 'rest_rehydration');
  assert.equal(profile.geiNativeSupport, 'partial');
  assert.ok(profile.droppedAttributes);
  assert.equal(profile.droppedAttributes.length, 7);

  const dropped = profile.droppedAttributes;
  assert.ok(dropped.includes('bypass_pull_request_allowances'));
  assert.ok(dropped.includes('require_last_push_approval'));
  assert.ok(dropped.includes('required_deployments_enforcement_level'));
  assert.ok(dropped.includes('lock_branch'));
  assert.ok(dropped.includes('block_creations'));
  assert.ok(dropped.some((d) => d.includes('force push user restrictions')));
  assert.ok(dropped.some((d) => d.includes('review dismissal exemptions')));
});

test('webhooks boundary profile specifies disabled state and vault secret rehydration per DEC-014', () => {
  const profile = getBoundaryProfile('repository-webhooks');
  assert.ok(profile);
  assert.equal(profile.mechanism, 'rest_rehydration');
  assert.equal(profile.geiNativeSupport, 'partial');
  assert.ok(
    profile.droppedAttributes?.includes('Active state (migrated disabled)'),
  );
  assert.ok(profile.rehydrationStrategy?.includes('PATCH active: true'));
});

test('releases boundary distinguishes standard vs oversized >10 GiB per DEC-010', () => {
  const standard = getBoundaryProfile('releases-standard');
  const oversized = getBoundaryProfile('releases-oversized');

  assert.ok(standard);
  assert.ok(oversized);
  assert.equal(standard.mechanism, 'gei_native');
  assert.equal(oversized.mechanism, 'rest_rehydration');
  assert.ok(oversized.rehydrationStrategy?.includes('Chunked binary stream'));
});

test('git LFS boundary confirms stream mirror-push strategy per DEC-011', () => {
  const lfs = getBoundaryProfile('git-lfs-objects');
  assert.ok(lfs);
  assert.equal(lfs.mechanism, 'rest_rehydration');
  assert.equal(lfs.geiNativeSupport, 'none');
  assert.ok(lfs.rehydrationStrategy?.includes('Dual-remote mirror-and-push'));
});
