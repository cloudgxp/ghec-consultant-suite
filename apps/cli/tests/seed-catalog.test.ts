import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SEED_CATALOG_ITEMS,
  resolveSeederItems,
} from '../src/commands/seeder/catalog.js';

describe('Seed Catalog & Preset Resolution', () => {
  it('contains exactly 33 distinct migration items in catalog', () => {
    assert.equal(SEED_CATALOG_ITEMS.length, 33);

    const orgItems = SEED_CATALOG_ITEMS.filter(
      (i) => i.scopeLevel === 'organization',
    );
    const repoItems = SEED_CATALOG_ITEMS.filter(
      (i) => i.scopeLevel === 'repository',
    );

    assert.equal(orgItems.length, 14, 'Expected 14 organization-level items');
    assert.equal(repoItems.length, 19, 'Expected 19 repository-level items');
  });

  it('resolves preset "all" with scope "both" to all 33 items in dependency order', () => {
    const resolved = resolveSeederItems('both', 'all');
    assert.equal(resolved.length, 33);

    // Verify dependencies are sequenced properly: gei-repo before rulesets
    const geiIdx = resolved.findIndex((i) => i.id === 'gei-repo');
    const rulesetsIdx = resolved.findIndex((i) => i.id === 'rulesets');
    assert.ok(geiIdx < rulesetsIdx, 'gei-repo must precede rulesets');

    // teams before collaborators
    const teamsIdx = resolved.findIndex((i) => i.id === 'teams');
    const collabIdx = resolved.findIndex((i) => i.id === 'collaborators');
    assert.ok(teamsIdx < collabIdx, 'teams must precede collaborators');
  });

  it('filters by scopeLevel: organization', () => {
    const resolved = resolveSeederItems('organization', 'all');
    assert.equal(resolved.length, 14);
    assert.ok(resolved.every((i) => i.scopeLevel === 'organization'));
  });

  it('filters by scopeLevel: repository', () => {
    const resolved = resolveSeederItems('repository', 'all');
    assert.equal(resolved.length, 19);
    assert.ok(resolved.every((i) => i.scopeLevel === 'repository'));
  });

  it('resolves presets correctly with prerequisite dependencies', () => {
    const governance = resolveSeederItems('both', 'core-governance');
    assert.equal(governance.length, 8);

    // actions-and-security includes 11 preset items + gei-repo dependency = 12
    const actionsSecurity = resolveSeederItems('both', 'actions-and-security');
    assert.equal(actionsSecurity.length, 12);
    assert.ok(actionsSecurity.some((i) => i.id === 'gei-repo'));
    assert.ok(actionsSecurity.some((i) => i.id === 'org-rulesets'));

    // collaboration includes 7 preset items + gei-repo & teams dependencies = 9
    const collaboration = resolveSeederItems('both', 'collaboration');
    assert.equal(collaboration.length, 9);
    assert.ok(collaboration.some((i) => i.id === 'gei-repo'));
    assert.ok(collaboration.some((i) => i.id === 'teams'));

    // artifacts-and-code includes 7 items + gei-repo dependency = 8
    const artifacts = resolveSeederItems('both', 'artifacts-and-code');
    assert.equal(artifacts.length, 8);
    assert.ok(artifacts.some((i) => i.id === 'gei-repo'));
  });

  it('resolves custom comma-separated list of module IDs with dependency auto-expansion', () => {
    // requesting 'rulesets' should auto-pull 'gei-repo'
    const resolved = resolveSeederItems('both', 'rulesets');
    const ids = resolved.map((i) => i.id);
    assert.ok(ids.includes('gei-repo'));
    assert.ok(ids.includes('rulesets'));
    assert.ok(ids.indexOf('gei-repo') < ids.indexOf('rulesets'));
  });

  it('handles aliases (e.g. webhooks, repo-settings)', () => {
    const resolved = resolveSeederItems('both', 'webhooks');
    const ids = resolved.map((i) => i.id);
    assert.ok(ids.includes('org-webhooks'));
    assert.ok(ids.includes('repo-webhooks'));
  });
});
