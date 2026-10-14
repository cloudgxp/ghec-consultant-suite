import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_BLUEPRINTS,
  getBlueprint,
  WAVE1_BLUEPRINTS,
  WAVE2_BLUEPRINTS,
  WAVE3_BLUEPRINTS,
} from '../../src/blueprints/index.js';
import { validateModuleBlueprint } from '@ghec/contracts';
import { createDefaultModuleRegistry } from '../../src/core/registry.js';

test('all proposed module blueprints conform to ModuleDecompositionBlueprint contract', () => {
  assert.equal(ALL_BLUEPRINTS.length, 8);
  assert.equal(WAVE1_BLUEPRINTS.length, 3);
  assert.equal(WAVE2_BLUEPRINTS.length, 3);
  assert.equal(WAVE3_BLUEPRINTS.length, 2);
});

test('every blueprint validates successfully against Zod contract', () => {
  for (const blueprint of ALL_BLUEPRINTS) {
    const validation = validateModuleBlueprint(blueprint);
    assert.equal(
      validation.success,
      true,
      `Blueprint for module "${blueprint.moduleId}" must pass validation.`,
    );
  }
});

test('Wave 1 governance blueprints have valid foundation dependencies', () => {
  const orgSettings = getBlueprint('org-settings');
  assert.ok(orgSettings);
  assert.deepEqual(orgSettings.dependencies, []);

  const actionsPolicies = getBlueprint('actions-policies');
  assert.ok(actionsPolicies);
  assert.deepEqual(actionsPolicies.dependencies, ['org-settings']);

  const autolinks = getBlueprint('autolinks');
  assert.ok(autolinks);
  assert.deepEqual(autolinks.dependencies, ['repo-settings']);
});

test('Wave 2 infrastructure blueprints cleanly depend on Wave 1 and base settings', () => {
  const runners = getBlueprint('actions-runners');
  assert.ok(runners);
  assert.deepEqual(runners.dependencies, ['actions-policies']);

  const ipAllow = getBlueprint('ip-allow-lists');
  assert.ok(ipAllow);
  assert.deepEqual(ipAllow.dependencies, ['org-settings']);

  const apps = getBlueprint('apps-inventory');
  assert.ok(apps);
  assert.deepEqual(apps.dependencies, ['org-settings']);
});

test('Wave 3 collaboration blueprints depend only on established org/repo foundation', () => {
  const discussions = getBlueprint('discussions');
  assert.ok(discussions);
  assert.deepEqual(discussions.dependencies, ['repo-settings']);

  const projectsV2 = getBlueprint('projects-v2');
  assert.ok(projectsV2);
  assert.deepEqual(projectsV2.dependencies, ['org-settings']);
});

test('no blueprint contains circular self-dependencies', () => {
  for (const bp of ALL_BLUEPRINTS) {
    assert.equal(
      bp.dependencies.includes(bp.moduleId),
      false,
      `Module "${bp.moduleId}" must not depend on itself.`,
    );
  }
});

test('ModuleRegistry resolves execution plan for Wave 1 modules in topological order', () => {
  const registry = createDefaultModuleRegistry();
  const plan = registry.resolveExecutionPlan(['actions-policies', 'autolinks']);
  const planIds = plan.map((m) => m.id);

  assert.ok(
    planIds.indexOf('org-settings') < planIds.indexOf('actions-policies'),
    'org-settings must precede actions-policies',
  );
  assert.ok(
    planIds.indexOf('gei-repo') < planIds.indexOf('repo-settings'),
    'gei-repo must precede repo-settings',
  );
  assert.ok(
    planIds.indexOf('repo-settings') < planIds.indexOf('autolinks'),
    'repo-settings must precede autolinks',
  );
});

test('ModuleRegistry resolves execution plan for Wave 2 modules in topological order', () => {
  const registry = createDefaultModuleRegistry();
  const plan = registry.resolveExecutionPlan([
    'actions-runners',
    'ip-allow-lists',
    'apps-inventory',
  ]);
  const planIds = plan.map((m) => m.id);

  assert.ok(
    planIds.indexOf('org-settings') < planIds.indexOf('actions-policies'),
    'org-settings must precede actions-policies',
  );
  assert.ok(
    planIds.indexOf('actions-policies') < planIds.indexOf('actions-runners'),
    'actions-policies must precede actions-runners',
  );
  assert.ok(
    planIds.indexOf('org-settings') < planIds.indexOf('ip-allow-lists'),
    'org-settings must precede ip-allow-lists',
  );
  assert.ok(
    planIds.indexOf('org-settings') < planIds.indexOf('apps-inventory'),
    'org-settings must precede apps-inventory',
  );
});

test('ModuleRegistry resolves execution plan for Wave 3 modules in topological order', () => {
  const registry = createDefaultModuleRegistry();
  const plan = registry.resolveExecutionPlan(['discussions', 'projects-v2']);
  const planIds = plan.map((m) => m.id);

  assert.ok(
    planIds.indexOf('org-settings') < planIds.indexOf('projects-v2'),
    'org-settings must precede projects-v2',
  );
  assert.ok(
    planIds.indexOf('gei-repo') < planIds.indexOf('repo-settings'),
    'gei-repo must precede repo-settings',
  );
  assert.ok(
    planIds.indexOf('repo-settings') < planIds.indexOf('discussions'),
    'repo-settings must precede discussions',
  );
});
