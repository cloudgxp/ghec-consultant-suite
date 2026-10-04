import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMigrationScope } from '../src/index.js';

const scope = {
  version: '1.0.0',
  name: 'acme-to-contoso',
  enterprise: { sourceSlug: 'acme', targetSlug: 'contoso' },
  organizations: [
    {
      source: 'acme-engineering',
      target: 'contoso-engineering',
      modules: ['teams'],
    },
  ],
  repositories: [
    {
      sourceOrg: 'acme-engineering',
      sourceRepo: 'api',
      targetOrg: 'contoso-engineering',
      targetRepo: 'api',
      useGei: true,
      targetRepoVisibility: 'internal',
      skipReleases: true,
      lfsStrategy: 'dual-remote-stream',
      modules: ['repo-variables'],
    },
  ],
  identityMapping: {
    strategy: 'emu-saml',
    suffix: '_contoso',
    mappings: { monalisa: 'monalisa_contoso' },
  },
};

test('migration scope accepts a version-locked, tenant-consistent scope', () => {
  assert.equal(validateMigrationScope(scope).success, true);
});

test('migration scope rejects unknown fields, incorrect versions, and cross-tenant repositories', () => {
  assert.equal(
    validateMigrationScope({ ...scope, version: '1.0.1' }).success,
    false,
  );
  assert.equal(
    validateMigrationScope({ ...scope, unexpected: true }).success,
    false,
  );
  assert.equal(
    validateMigrationScope({
      ...scope,
      repositories: [{ ...scope.repositories[0], targetOrg: 'another-tenant' }],
    }).success,
    false,
  );
});
