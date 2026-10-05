import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMigrationScope } from '@ghec/contracts';
import { generateScope } from '../../../../scripts/generate-scope.mjs';

describe('Scope Generator (scripts/generate-scope.mjs)', () => {
  it('generates a valid migration scope from an explicit repository list', async () => {
    const { scope } = await generateScope({
      source: 'demogxp',
      target: 'antigravity-migration-test',
      repos: 'repo-alpha, repo-beta',
      dryRun: true,
      silent: true,
    });

    assert.equal(scope.version, '1.0.0');
    assert.equal(scope.organizations[0].source, 'demogxp');
    assert.equal(scope.organizations[0].target, 'antigravity-migration-test');
    assert.equal(scope.repositories.length, 2);
    assert.equal(scope.repositories[0].sourceRepo, 'repo-alpha');
    assert.equal(scope.repositories[0].targetRepo, 'repo-alpha');
    assert.equal(scope.repositories[1].sourceRepo, 'repo-beta');
    assert.equal(scope.repositories[1].useGei, true);
    assert.equal(scope.repositories[1].lfsStrategy, 'dual-remote-stream');
    assert.equal(scope.identityMapping?.strategy, 'emu-saml');
    assert.equal(scope.identityMapping?.suffix, '_antigravity');

    const validation = validateMigrationScope(scope);
    assert.equal(validation.success, true);
  });

  it('supports target repository prefix and suffix', async () => {
    const { scope } = await generateScope({
      source: 'source-org',
      target: 'target-org',
      repos: 'my-service',
      targetRepoPrefix: 'migrated-',
      targetRepoSuffix: '-v2',
      dryRun: true,
      silent: true,
    });

    assert.equal(scope.repositories[0].sourceRepo, 'my-service');
    assert.equal(scope.repositories[0].targetRepo, 'migrated-my-service-v2');

    const validation = validateMigrationScope(scope);
    assert.equal(validation.success, true);
  });

  it('generates org-only scope when orgOnly is true', async () => {
    const { scope } = await generateScope({
      source: 'demogxp',
      target: 'antigravity-migration-test',
      orgOnly: true,
      dryRun: true,
      silent: true,
    });

    assert.equal(scope.repositories.length, 0);
    assert.equal(scope.organizations.length, 1);
    const validation = validateMigrationScope(scope);
    assert.equal(validation.success, true);
  });

  it('throws an error if source or target is missing', async () => {
    await assert.rejects(
      async () => {
        await generateScope({
          source: '',
          target: 'target-org',
          repos: 'repo-1',
          dryRun: true,
        });
      },
      { message: /Both --source and --target organization slugs are required/ },
    );
  });

  it('throws an error if no repositories are provided and orgOnly is false', async () => {
    await assert.rejects(
      async () => {
        await generateScope({
          source: 'source-org',
          target: 'target-org',
          dryRun: true,
        });
      },
      { message: /No repositories specified/ },
    );
  });
});
