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

test('migration scope accepts granular repositoryOptions mapping and per-repository options', () => {
  const scopeWithGranularOptions = {
    ...scope,
    repositories: [
      {
        ...scope.repositories[0],
        options: {
          skipReleases: true,
          skipLfs: true,
          customTimeout: 3600,
          timeoutSeconds: 3600,
          targetRepoVisibility: 'private',
          lfsStrategy: 'skip',
        },
      },
    ],
    repositoryOptions: {
      'acme-engineering/api': {
        skipReleases: true,
        customTimeout: 1800,
      },
    },
  };

  const validation = validateMigrationScope(scopeWithGranularOptions);
  assert.equal(validation.success, true);
});

test('migration scope rejects invalid repository options', () => {
  const scopeWithInvalidOption = {
    ...scope,
    repositories: [
      {
        ...scope.repositories[0],
        options: {
          // @ts-expect-error invalid negative timeout
          customTimeout: -10,
        },
      },
    ],
  };

  const validation = validateMigrationScope(scopeWithInvalidOption);
  assert.equal(validation.success, false);
});

test('migration scope accepts gitTransferStrategy options (auto, gei, mirror-push)', () => {
  for (const strategy of ['auto', 'gei', 'mirror-push'] as const) {
    const scopeWithStrategy = {
      ...scope,
      repositories: [
        {
          ...scope.repositories[0],
          gitTransferStrategy: strategy,
          options: {
            gitTransferStrategy: strategy,
          },
        },
      ],
    };
    const validation = validateMigrationScope(scopeWithStrategy);
    assert.equal(validation.success, true);
  }

  const invalidScope = {
    ...scope,
    repositories: [
      {
        ...scope.repositories[0],
        options: {
          // @ts-expect-error invalid strategy
          gitTransferStrategy: 'invalid-strategy',
        },
      },
    ],
  };
  assert.equal(validateMigrationScope(invalidScope).success, false);
});
