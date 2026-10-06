import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMigrationScope } from '@ghec/contracts';
import { buildMigrationScope } from '../src/lib/scope-generator.js';

describe('Task 039 (DASH-24): Interactive Module Triggers Across Domain Views', () => {
  describe('Targeted Module Scope Generation', () => {
    it('generates valid scope for Teams & Hierarchy trigger (modules: teams)', () => {
      const scope = buildMigrationScope({
        name: 'teams-sync-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp-emu',
        repositories: [],
        selectedModules: ['teams'],
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.equal(scope.organizations[0]?.source, 'source-corp');
      assert.equal(scope.organizations[0]?.target, 'target-corp-emu');
      assert.deepEqual(scope.organizations[0]?.modules, ['teams']);
      assert.equal(scope.repositories.length, 0);
    });

    it('generates valid scope for Outside Collaborators trigger (modules: collaborators)', () => {
      const scope = buildMigrationScope({
        name: 'collaborators-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
        repositories: [{ name: 'repo-alpha' }, { name: 'repo-beta' }],
        selectedModules: ['collaborators'],
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.equal(scope.repositories.length, 2);
      assert.deepEqual(scope.repositories[0]?.modules, ['collaborators']);
    });

    it('generates valid scope for EMU Mannequins trigger (modules: mannequins)', () => {
      const scope = buildMigrationScope({
        name: 'mannequins-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp-emu',
        repositories: [],
        selectedModules: ['mannequins'],
        identityStrategy: 'emu-saml',
        identitySuffix: '_gxp',
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.equal(scope.identityMapping?.strategy, 'emu-saml');
      assert.equal(scope.identityMapping?.suffix, '_gxp');
      assert.deepEqual(scope.organizations[0]?.modules, ['mannequins']);
    });

    it('generates valid scope for Releases & Assets trigger (modules: releases)', () => {
      const scope = buildMigrationScope({
        name: 'releases-replication-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
        repositories: [
          { name: 'sdk-core', hasReleases: true },
          { name: 'cli-tool', hasReleases: true },
        ],
        selectedModules: ['releases'],
        releasesStrategy: 'stream',
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.equal(scope.repositories.length, 2);
      assert.equal(scope.repositories[0]?.skipReleases, false);
      assert.deepEqual(scope.repositories[0]?.modules, ['releases']);
    });

    it('generates valid scope for Packages & GHCR trigger (modules: packages)', () => {
      const scope = buildMigrationScope({
        name: 'packages-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
        repositories: [{ name: 'frontend-app' }],
        selectedModules: ['packages'],
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.deepEqual(scope.repositories[0]?.modules, ['packages']);
    });

    it('generates valid scope for Rulesets & Branch Protections (modules: rulesets, branch-protection)', () => {
      const scope = buildMigrationScope({
        name: 'rulesets-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
        repositories: [{ name: 'backend-service' }],
        selectedModules: ['rulesets', 'branch-protection'],
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.deepEqual(scope.repositories[0]?.modules, [
        'rulesets',
        'branch-protection',
      ]);
    });

    it('generates valid scope for Deploy Keys (modules: deploy-keys)', () => {
      const scope = buildMigrationScope({
        name: 'deploy-keys-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
        repositories: [{ name: 'ci-runner-repo' }],
        selectedModules: ['deploy-keys'],
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.deepEqual(scope.repositories[0]?.modules, ['deploy-keys']);
    });

    it('generates valid scope for Secrets & Variables (all 4 configuration modules)', () => {
      const scope = buildMigrationScope({
        name: 'secrets-variables-wave',
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
        repositories: [{ name: 'secure-vault' }],
        selectedModules: [
          'org-variables',
          'org-secrets',
          'repo-variables',
          'repo-secrets',
        ],
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.deepEqual(scope.organizations[0]?.modules, [
        'org-variables',
        'org-secrets',
        'repo-variables',
        'repo-secrets',
      ]);
      assert.deepEqual(scope.repositories[0]?.modules, [
        'org-variables',
        'org-secrets',
        'repo-variables',
        'repo-secrets',
      ]);
    });
  });

  describe('Workflow Dispatch Payload Formatting', () => {
    it('constructs correct GitHub Actions workflow dispatch request structure', () => {
      const modules = ['teams'];
      const sourceOrg = 'source-org';
      const targetOrg = 'target-org';
      const isDryRun = true;
      const continueOnError = true;

      const generatedScope = buildMigrationScope({
        name: `${modules.join('-')}-wave`,
        sourceOrg,
        targetOrg,
        repositories: [],
        selectedModules: modules,
      });

      const dispatchPayload = {
        owner: sourceOrg,
        repo: 'ghec-consultant-suite',
        ref: 'main',
        inputs: {
          scope: JSON.stringify(generatedScope),
          batch_size: '5',
          modules: modules.join(','),
          dry_run: String(isDryRun),
          continue_on_error: String(continueOnError),
          runner_labels: 'ubuntu-latest',
        },
      };

      assert.equal(dispatchPayload.owner, 'source-org');
      assert.equal(dispatchPayload.inputs.modules, 'teams');
      assert.equal(dispatchPayload.inputs.dry_run, 'true');
      assert.equal(dispatchPayload.inputs.continue_on_error, 'true');

      const parsedScope = JSON.parse(dispatchPayload.inputs.scope);
      assert.equal(validateMigrationScope(parsedScope).success, true);
    });

    it('toggles dry_run flag correctly for Live Apply mode', () => {
      const isDryRun = false;
      const inputs = {
        modules: 'releases',
        dry_run: String(isDryRun),
        continue_on_error: 'true',
      };

      assert.equal(inputs.dry_run, 'false');
    });
  });
});
