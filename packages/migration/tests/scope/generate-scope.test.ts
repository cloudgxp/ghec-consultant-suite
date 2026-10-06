import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateMigrationScope } from '@ghec/contracts';
import {
  generateScope,
  parseRepoEntry,
} from '../../../../scripts/generate-scope.mjs';

describe('Scope Generator (scripts/generate-scope.mjs)', () => {
  it('parses various repository URL formats correctly', () => {
    assert.deepEqual(
      parseRepoEntry('https://github.com/example-source-org/my-repo'),
      {
        org: 'example-source-org',
        name: 'my-repo',
      },
    );
    assert.deepEqual(
      parseRepoEntry('https://github.com/example-source-org/my-repo.git'),
      {
        org: 'example-source-org',
        name: 'my-repo',
      },
    );
    assert.deepEqual(
      parseRepoEntry('https://github.com/example-source-org/my-repo/'),
      {
        org: 'example-source-org',
        name: 'my-repo',
      },
    );
    assert.deepEqual(
      parseRepoEntry('git@github.com:example-source-org/my-repo.git'),
      {
        org: 'example-source-org',
        name: 'my-repo',
      },
    );
    assert.deepEqual(
      parseRepoEntry('ssh://git@github.com/example-source-org/my-repo.git'),
      { org: 'example-source-org', name: 'my-repo' },
    );
    assert.deepEqual(
      parseRepoEntry('https://ghe.mycompany.com/example-source-org/my-repo'),
      { org: 'example-source-org', name: 'my-repo' },
    );
    assert.deepEqual(parseRepoEntry('example-source-org/my-repo'), {
      org: 'example-source-org',
      name: 'my-repo',
    });
    assert.deepEqual(parseRepoEntry('my-repo'), { org: null, name: 'my-repo' });
    assert.equal(parseRepoEntry('# comment line'), null);
    assert.equal(parseRepoEntry('   '), null);
  });

  it('generates a valid migration scope from an explicit repository list', async () => {
    const { scope } = await generateScope({
      source: 'example-source-org',
      target: 'example-target-emu',
      repos: 'repo-alpha, repo-beta',
      dryRun: true,
      silent: true,
    });

    assert.equal(scope.version, '1.0.0');
    assert.equal(scope.organizations[0].source, 'example-source-org');
    assert.equal(scope.organizations[0].target, 'example-target-emu');
    assert.equal(scope.repositories.length, 2);
    assert.equal(scope.repositories[0].sourceRepo, 'repo-alpha');
    assert.equal(scope.repositories[0].targetRepo, 'repo-alpha');
    assert.equal(scope.repositories[1].sourceRepo, 'repo-beta');
    assert.equal(scope.repositories[1].useGei, true);
    assert.equal(scope.repositories[1].lfsStrategy, 'dual-remote-stream');
    assert.equal(scope.identityMapping?.strategy, 'emu-saml');
    assert.equal(scope.identityMapping?.suffix, '_gxp');

    const validation = validateMigrationScope(scope);
    assert.equal(validation.success, true);
  });

  it('generates a valid scope from a file containing repository URLs (and infers source org)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ghec-scope-test-'));
    const tempFile = join(tempDir, 'test-repos.txt');
    const urls = [
      '# Wave 1 Repositories',
      'https://github.com/example-source-org/auth-service.git',
      'https://github.com/example-source-org/billing-engine',
      'git@github.com:example-source-org/data-pipeline.git',
      '',
      '# Another service',
      'example-source-org/web-frontend',
    ].join('\n');

    writeFileSync(tempFile, urls, 'utf8');

    try {
      const { scope } = await generateScope({
        file: tempFile,
        target: 'example-target-emu',
        dryRun: true,
        silent: true,
      });

      assert.equal(scope.organizations[0].source, 'example-source-org');
      assert.equal(scope.organizations[0].target, 'example-target-emu');
      assert.equal(scope.repositories.length, 4);
      assert.deepEqual(
        scope.repositories.map((r) => r.sourceRepo),
        ['auth-service', 'billing-engine', 'data-pipeline', 'web-frontend'],
      );

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('supports scaling to several hundred repository URLs in a file', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ghec-scope-test-'));
    const tempFile = join(tempDir, 'test-large-wave.txt');
    const repoLines = [];
    for (let i = 1; i <= 350; i++) {
      repoLines.push(`https://github.com/example-source-org/service-${i}.git`);
    }
    writeFileSync(tempFile, repoLines.join('\n'), 'utf8');

    try {
      const { scope } = await generateScope({
        file: tempFile,
        target: 'example-target-emu',
        dryRun: true,
        silent: true,
      });

      assert.equal(scope.repositories.length, 350);
      assert.equal(scope.repositories[0].sourceRepo, 'service-1');
      assert.equal(scope.repositories[349].sourceRepo, 'service-350');

      const validation = validateMigrationScope(scope);
      assert.equal(validation.success, true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects repository URLs that do not match expected source organization', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ghec-scope-test-'));
    const tempFile = join(tempDir, 'test-mismatch.txt');
    writeFileSync(tempFile, 'https://github.com/other-org/some-repo\n', 'utf8');

    try {
      await assert.rejects(
        async () => {
          await generateScope({
            source: 'example-source-org',
            target: 'example-target-emu',
            file: tempFile,
            dryRun: true,
            silent: true,
          });
        },
        {
          message:
            /belongs to organization "other-org", but source organization is "example-source-org"/,
        },
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
      source: 'example-source-org',
      target: 'example-target-emu',
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
          target: '',
          repos: 'repo-1',
          dryRun: true,
          silent: true,
        });
      },
      {
        message: /Both --source and --target organization slugs are required/,
      },
    );
  });

  it('throws an error if no repositories are provided and orgOnly is false', async () => {
    await assert.rejects(
      async () => {
        await generateScope({
          source: 'source-org',
          target: 'target-org',
          dryRun: true,
          silent: true,
        });
      },
      { message: /No repositories specified/ },
    );
  });
});
