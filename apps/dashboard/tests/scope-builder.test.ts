import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMigrationScope } from '@ghec/contracts';
import {
  buildMigrationScope,
  type ScopeGeneratorOptions,
} from '../src/lib/scope-generator.js';

describe('Task 038: Dynamic Scope Builder & Preflight Readiness Gate', () => {
  describe('buildMigrationScope', () => {
    it('generates a 100% schema-compliant MigrationScope for selected repositories', () => {
      const options: ScopeGeneratorOptions = {
        name: 'wave-phoenix-repos',
        sourceOrg: 'phoenix-corp',
        targetOrg: 'phoenix-corp-emu',
        repositories: [
          { name: 'web-app', visibility: 'private', hasLfs: true },
          { name: 'api-service', visibility: 'internal', hasReleases: true },
          { name: 'shared-utils', visibility: 'public' },
        ],
        targetRepoVisibility: 'inherit',
        identityStrategy: 'emu-saml',
        identitySuffix: '_gxp',
        lfsStrategy: 'dual-remote-stream',
        releasesStrategy: 'stream',
        selectedModules: [
          'gei-repo',
          'rulesets',
          'branch-protection',
          'repo-variables',
          'repo-secrets',
          'repo-custom-properties',
          'repo-settings',
          'webhooks',
          'environments',
          'deploy-keys',
          'releases',
          'lfs',
          'collaborators',
        ],
      };

      const scope = buildMigrationScope(options);

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.equal(scope.version, '1.0.0');
      assert.equal(scope.name, 'wave-phoenix-repos');
      assert.equal(scope.organizations[0]?.source, 'phoenix-corp');
      assert.equal(scope.organizations[0]?.target, 'phoenix-corp-emu');
      assert.equal(scope.repositories.length, 3);

      assert.equal(scope.repositories[0]?.sourceRepo, 'web-app');
      assert.equal(scope.repositories[0]?.targetRepoVisibility, 'private');
      assert.equal(scope.repositories[0]?.lfsStrategy, 'dual-remote-stream');
      assert.equal(scope.repositories[0]?.skipReleases, false);

      assert.equal(scope.repositories[1]?.sourceRepo, 'api-service');
      assert.equal(scope.repositories[1]?.targetRepoVisibility, 'internal');

      assert.equal(scope.repositories[2]?.sourceRepo, 'shared-utils');
      assert.equal(scope.repositories[2]?.targetRepoVisibility, 'public');

      assert.equal(scope.identityMapping?.strategy, 'emu-saml');
      assert.equal(scope.identityMapping?.suffix, '_gxp');
    });

    it('enforces specific target repository visibility override', () => {
      const scope = buildMigrationScope({
        name: 'wave-internal-only',
        sourceOrg: 'source-org',
        targetOrg: 'target-org',
        repositories: [
          { name: 'repo-1', visibility: 'public' },
          { name: 'repo-2', visibility: 'private' },
        ],
        targetRepoVisibility: 'internal',
      });

      assert.equal(scope.repositories[0]?.targetRepoVisibility, 'internal');
      assert.equal(scope.repositories[1]?.targetRepoVisibility, 'internal');
    });

    it('handles releases skip strategy flag', () => {
      const scope = buildMigrationScope({
        name: 'wave-skip-releases',
        sourceOrg: 'source-org',
        targetOrg: 'target-org',
        repositories: [{ name: 'repo-large-releases' }],
        releasesStrategy: 'skip',
        lfsStrategy: 'skip',
      });

      assert.equal(scope.repositories[0]?.skipReleases, true);
      assert.equal(scope.repositories[0]?.lfsStrategy, 'skip');
    });

    it('throws when target or source organization is empty', () => {
      assert.throws(() => {
        buildMigrationScope({
          name: 'wave-invalid',
          sourceOrg: '',
          targetOrg: 'target',
          repositories: [{ name: 'repo-1' }],
        });
      }, /Generated MigrationScope is invalid/);

      assert.throws(() => {
        buildMigrationScope({
          name: 'wave-invalid',
          sourceOrg: 'source',
          targetOrg: '',
          repositories: [{ name: 'repo-1' }],
        });
      }, /Generated MigrationScope is invalid/);
    });

    it('generates granular per-repository options and repositoryOptions mapping', () => {
      const scope = buildMigrationScope({
        name: 'wave-granular',
        sourceOrg: 'corp-src',
        targetOrg: 'corp-dst',
        repositories: [
          {
            name: 'repo-fast',
            options: {
              skipReleases: true,
              skipLfs: true,
              timeoutSeconds: 300,
            },
          },
          {
            name: 'repo-heavy',
          },
        ],
        repositoryOptions: {
          'repo-heavy': {
            customTimeout: 7200,
            targetRepoVisibility: 'private',
          },
        },
      });

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
      assert.equal(scope.repositories[0]?.sourceRepo, 'repo-fast');
      assert.equal(scope.repositories[0]?.options?.skipReleases, true);
      assert.equal(scope.repositories[0]?.options?.skipLfs, true);
      assert.equal(scope.repositories[0]?.options?.timeoutSeconds, 300);

      assert.equal(scope.repositories[1]?.sourceRepo, 'repo-heavy');
      assert.equal(scope.repositories[1]?.options?.customTimeout, 7200);
      assert.equal(
        scope.repositories[1]?.options?.targetRepoVisibility,
        'private',
      );

      assert.ok(scope.repositoryOptions);
      assert.ok(scope.repositoryOptions['corp-src/repo-fast']);
      assert.equal(
        scope.repositoryOptions['corp-src/repo-fast']?.skipReleases,
        true,
      );
      assert.ok(
        scope.repositoryOptions['repo-heavy'] ||
          scope.repositoryOptions['corp-src/repo-heavy'],
      );
    });
  });
});
