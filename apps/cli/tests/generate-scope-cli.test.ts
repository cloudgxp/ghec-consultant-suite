import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALL_ORGANIZATION_MODULES,
  ALL_REPOSITORY_MODULES,
  GLOBAL_SINGLETON_ORGANIZATION_MODULES,
  REPO_ASSOCIATED_ORGANIZATION_MODULES,
  resolveAutoOrganizationModules,
  resolveAutoRepositoryModules,
} from '@ghec/migration';
import {
  DEFAULT_ORG_MODULES,
  DEFAULT_REPO_MODULES,
  filterDiscoveredRepositories,
  parseGenerateScopeOptions,
  executeGenerateScopeCommand,
  parseValidateScopeOptions,
  executeValidateScopeCommand,
  type SourceRepoMetadata,
} from '../src/commands/generate-scope.js';
import { parsePlanOptions } from '../src/commands/plan.js';
import { parseMigrateOptions } from '../src/commands/migrate.js';
import { parseVerifyOptions } from '../src/commands/verify.js';

const SAMPLE_ORG_REPOS: readonly SourceRepoMetadata[] = [
  {
    name: 'pub-web',
    visibility: 'public',
    isArchived: false,
    isFork: false,
  },
  {
    name: 'pub-fork',
    visibility: 'public',
    isArchived: false,
    isFork: true,
  },
  {
    name: 'priv-api',
    visibility: 'private',
    isArchived: false,
    isFork: false,
  },
  {
    name: 'priv-archived',
    visibility: 'private',
    isArchived: true,
    isFork: false,
  },
  {
    name: 'int-shared-lib',
    visibility: 'internal',
    isArchived: false,
    isFork: false,
  },
];

describe('CLI Scope Generation & Validation Subcommands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ghec-scope-cli-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates a full migration scope with auto modules and resolves strategy-aware modules downstream', async () => {
    const outputPath = join(tempDir, 'scopes', 'wave-1.json');
    const options = parseGenerateScopeOptions([
      '--name',
      'wave-1',
      '--source',
      'acme-src',
      '--target',
      'acme-emu',
      '--repos',
      'repo-alpha,repo-beta',
      '--emu-shortcode',
      'acme',
      '--output',
      outputPath,
    ]);

    const result = await executeGenerateScopeCommand({
      ...options,
      silent: true,
    });

    assert.equal(result.filePath, outputPath);
    assert.equal(existsSync(outputPath), true);
    assert.equal(result.scope.name, 'wave-1');
    assert.equal(result.scope.organizations[0]?.source, 'acme-src');
    assert.equal(result.scope.organizations[0]?.target, 'acme-emu');
    assert.deepEqual(result.scope.organizations[0]?.modules, [
      ...DEFAULT_ORG_MODULES,
    ]);
    assert.deepEqual(result.scope.organizations[0]?.modules, ['auto']);
    assert.equal(result.scope.repositories.length, 2);
    assert.equal(result.scope.repositories[0]?.sourceRepo, 'repo-alpha');
    assert.equal(result.scope.repositories[1]?.sourceRepo, 'repo-beta');
    assert.deepEqual(result.scope.repositories[0]?.modules, [
      ...DEFAULT_REPO_MODULES,
    ]);
    assert.deepEqual(result.scope.repositories[0]?.modules, ['auto']);
    assert.equal(result.scope.identityMapping.strategy, 'emu-saml');
    assert.equal(result.scope.identityMapping.suffix, '_acme');

    const resolvedOrg = resolveAutoOrganizationModules(
      result.scope.organizations[0],
    );
    assert.deepEqual(resolvedOrg.applyModules, [...ALL_ORGANIZATION_MODULES]);

    const resolvedRepo = resolveAutoRepositoryModules(
      result.scope.repositories[0]!,
    );
    assert.ok(resolvedRepo.applyModules.includes('gei-repo'));
    assert.ok(resolvedRepo.applyModules.includes('rulesets'));
    assert.equal(resolvedRepo.applyModules.includes('issues'), false);
  });

  it('filters discovered repositories by source visibility (all, public, private, internal) and forks without requiring a discovery bundle', async () => {
    const mockFetcher = async () => SAMPLE_ORG_REPOS;

    const allResult = await executeGenerateScopeCommand({
      ...parseGenerateScopeOptions([
        '--source',
        'acme-src',
        '--target',
        'acme-emu',
        '--all',
      ]),
      dryRun: true,
      silent: true,
      repoFetcher: mockFetcher,
    });
    assert.deepEqual(
      allResult.scope.repositories.map((r) => r.sourceRepo),
      ['pub-web', 'pub-fork', 'priv-api', 'int-shared-lib'],
    );

    const publicNoForksResult = await executeGenerateScopeCommand({
      ...parseGenerateScopeOptions([
        '--source',
        'acme-src',
        '--target',
        'acme-emu',
        '--source-visibility',
        'public',
        '--exclude-forks',
      ]),
      dryRun: true,
      silent: true,
      repoFetcher: mockFetcher,
    });
    assert.equal(publicNoForksResult.scope.name, 'acme-src-to-acme-emu-public');
    assert.deepEqual(
      publicNoForksResult.scope.repositories.map((r) => r.sourceRepo),
      ['pub-web'],
    );

    const privateResult = await executeGenerateScopeCommand({
      ...parseGenerateScopeOptions([
        '--source',
        'acme-src',
        '--target',
        'acme-emu',
        '--source-visibility',
        'private',
      ]),
      dryRun: true,
      silent: true,
      repoFetcher: mockFetcher,
    });
    assert.equal(privateResult.scope.name, 'acme-src-to-acme-emu-private');
    assert.deepEqual(
      privateResult.scope.repositories.map((r) => r.sourceRepo),
      ['priv-api'],
    );

    const internalResult = await executeGenerateScopeCommand({
      ...parseGenerateScopeOptions([
        '--source',
        'acme-src',
        '--target',
        'acme-emu',
        '--source-visibility',
        'internal',
      ]),
      dryRun: true,
      silent: true,
      repoFetcher: mockFetcher,
    });
    assert.equal(internalResult.scope.name, 'acme-src-to-acme-emu-internal');
    assert.deepEqual(
      internalResult.scope.repositories.map((r) => r.sourceRepo),
      ['int-shared-lib'],
    );

    const combinedVisArchived = filterDiscoveredRepositories(SAMPLE_ORG_REPOS, {
      sourceVisibility: 'private,internal',
      includeArchived: true,
    });
    assert.deepEqual(combinedVisArchived, [
      'priv-api',
      'priv-archived',
      'int-shared-lib',
    ]);

    assert.throws(
      () =>
        parseGenerateScopeOptions([
          '--source',
          'acme-src',
          '--target',
          'acme-emu',
          '--source-visibility',
          'invalid-vis',
        ]),
      /Invalid --source-visibility value/,
    );
  });

  it('consolidates public repositories from multiple source organizations into one target org with associated-only org items', async () => {
    const orgReposMap: Record<string, readonly SourceRepoMetadata[]> = {
      'acme-alpha': [
        ...SAMPLE_ORG_REPOS,
        {
          name: 'alpha-sdk',
          visibility: 'public',
          isArchived: false,
          isFork: false,
        },
      ],
      'acme-beta': [
        ...SAMPLE_ORG_REPOS,
        {
          name: 'beta-cli',
          visibility: 'public',
          isArchived: false,
          isFork: false,
        },
      ],
    };

    const options = parseGenerateScopeOptions([
      '--source',
      'acme-alpha,acme-beta',
      '--target',
      'acme-open-source',
      '--target-type',
      'ghec',
      '--source-visibility',
      'public',
      '--exclude-forks',
      '--target-visibility',
      'public',
    ]);

    const result = await executeGenerateScopeCommand({
      ...options,
      dryRun: true,
      silent: true,
      repoFetcher: async (org) => orgReposMap[org] ?? [],
    });

    assert.equal(result.scope.name, 'multi-org-to-acme-open-source-public');
    assert.equal(result.scope.orgItemsMode, 'associated-only');
    assert.equal(result.scope.organizations.length, 2);
    assert.equal(result.scope.organizations[0]?.source, 'acme-alpha');
    assert.equal(result.scope.organizations[0]?.target, 'acme-open-source');
    assert.equal(
      result.scope.organizations[0]?.orgItemsMode,
      'associated-only',
    );
    assert.equal(result.scope.organizations[1]?.source, 'acme-beta');
    assert.equal(result.scope.organizations[1]?.target, 'acme-open-source');
    assert.equal(
      result.scope.organizations[1]?.orgItemsMode,
      'associated-only',
    );

    // Colliding repo name 'pub-web' in both orgs is automatically disambiguated with source org prefix,
    // while unique names ('alpha-sdk', 'beta-cli') remain unprefixed!
    assert.deepEqual(
      result.scope.repositories.map((r) => ({
        source: `${r.sourceOrg}/${r.sourceRepo}`,
        target: `${r.targetOrg}/${r.targetRepo}`,
      })),
      [
        {
          source: 'acme-alpha/pub-web',
          target: 'acme-open-source/acme-alpha-pub-web',
        },
        {
          source: 'acme-alpha/alpha-sdk',
          target: 'acme-open-source/alpha-sdk',
        },
        {
          source: 'acme-beta/pub-web',
          target: 'acme-open-source/acme-beta-pub-web',
        },
        {
          source: 'acme-beta/beta-cli',
          target: 'acme-open-source/beta-cli',
        },
      ],
    );

    // Verify resolveAutoOrganizationModules excludes global singletons when orgItemsMode is associated-only
    const resolvedOrg = resolveAutoOrganizationModules(
      result.scope.organizations[0],
    );
    assert.deepEqual(resolvedOrg.applyModules, [
      ...REPO_ASSOCIATED_ORGANIZATION_MODULES,
    ]);
    for (const singleton of GLOBAL_SINGLETON_ORGANIZATION_MODULES) {
      assert.equal(resolvedOrg.applyModules.includes(singleton), false);
    }
  });

  it('supports selective repositories, disabling org resources, and custom module subsets', async () => {
    const outputPath = join(tempDir, 'scopes', 'selective-wave.json');
    const options = parseGenerateScopeOptions([
      '--name',
      'selective-wave',
      '--source',
      'acme-src',
      '--target',
      'acme-emu',
      '--repos',
      'service-a,service-b',
      '--include-org-resources',
      'false',
      '--repo-modules',
      'repo-gei,branch-rulesets,environments',
      '--output',
      outputPath,
    ]);

    const result = await executeGenerateScopeCommand({
      ...options,
      silent: true,
    });

    assert.deepEqual(result.scope.organizations[0]?.modules, []);
    assert.equal(result.scope.orgItemsMode, 'none');
    assert.equal(result.scope.repositories.length, 2);
    assert.deepEqual(result.scope.repositories[0]?.modules, [
      'repo-gei',
      'branch-rulesets',
      'environments',
    ]);
  });

  it('validates a scope file and applies runtime overrides via validate-scope', async () => {
    const scopePath = join(tempDir, 'wave-1.json');
    await executeGenerateScopeCommand({
      source: 'acme-src',
      target: 'acme-emu',
      name: 'wave-1',
      repos: 'repo-1,repo-2',
      output: scopePath,
      silent: true,
    });

    const options = parseValidateScopeOptions([
      '--scope',
      scopePath,
      '--target-type',
      'emu',
      '--emu-shortcode',
      'corp',
      '--mirror-push-mode',
      'fast-snapshot',
      '--org-items',
      'associated-only',
    ]);

    const validated = executeValidateScopeCommand(options);
    assert.equal(validated.scope.targetType, 'emu');
    assert.equal(validated.scope.mirrorPushMode, 'fast-snapshot');
    assert.equal(validated.scope.orgItemsMode, 'associated-only');
    assert.equal(
      validated.scope.organizations[0]?.orgItemsMode,
      'associated-only',
    );
    assert.equal(validated.scope.identityMapping.strategy, 'emu-saml');
    assert.equal(validated.scope.identityMapping.suffix, '_corp');

    const persisted = JSON.parse(readFileSync(scopePath, 'utf8')) as {
      targetType: string;
      mirrorPushMode: string;
      orgItemsMode: string;
    };
    assert.equal(persisted.targetType, 'emu');
    assert.equal(persisted.mirrorPushMode, 'fast-snapshot');
    assert.equal(persisted.orgItemsMode, 'associated-only');
  });

  it('expands --org-modules all and --repo-modules all to all 15 organization and 19 repository modules', async () => {
    const options = parseGenerateScopeOptions([
      '--source',
      'acme-src',
      '--target',
      'acme-ghec',
      '--target-type',
      'ghec',
      '--repos',
      'repo-1',
      '--org-modules',
      'all',
      '--repo-modules',
      'all',
    ]);

    const result = await executeGenerateScopeCommand({
      ...options,
      dryRun: true,
      silent: true,
    });

    assert.deepEqual(result.scope.organizations[0]?.modules, [
      ...ALL_ORGANIZATION_MODULES,
    ]);
    assert.equal(result.scope.organizations[0]?.modules?.length, 15);
    assert.deepEqual(result.scope.repositories[0]?.modules, [
      ...ALL_REPOSITORY_MODULES,
    ]);
    assert.equal(result.scope.repositories[0]?.modules?.length, 19);
  });

  it('throws a descriptive error when validating a missing scope file', () => {
    const missingOptions = parseValidateScopeOptions([
      '--scope',
      join(tempDir, 'does-not-exist.json'),
    ]);
    assert.throws(
      () => executeValidateScopeCommand(missingOptions),
      /does not exist/,
    );
  });

  it('embeds sandboxRehearsal when --sandbox-rehearsal is passed to generate-scope and parses --sandbox-rehearsal across CLI commands', async () => {
    const scopePath = join(tempDir, 'sandbox-rehearsal-scope.json');
    const options = parseGenerateScopeOptions([
      '--source',
      'acme-src',
      '--target',
      'acme-sandbox',
      '--target-type',
      'emu',
      '--repos',
      'repo-1',
      '--sandbox-rehearsal',
      '--out',
      scopePath,
    ]);
    assert.equal(options.sandboxRehearsal, true);

    const result = await executeGenerateScopeCommand({
      ...options,
      silent: true,
    });

    assert.equal(result.scope.sandboxRehearsal, true);
    assert.equal(result.scope.organizations[0]?.sandboxRehearsal, true);
    assert.equal(result.scope.repositories[0]?.sandboxRehearsal, true);

    const validated = executeValidateScopeCommand({
      ...parseValidateScopeOptions([
        '--scope',
        scopePath,
        '--sandbox-rehearsal',
      ]),
      silent: true,
    });
    assert.equal(validated.scope.sandboxRehearsal, true);

    const planOpts = parsePlanOptions([
      '--scope',
      scopePath,
      '--sandbox-rehearsal',
    ]);
    assert.equal(planOpts.sandboxRehearsal, true);

    const migrateOpts = parseMigrateOptions([
      '--scope',
      scopePath,
      '--sandbox-rehearsal',
    ]);
    assert.equal(migrateOpts.sandboxRehearsal, true);

    const verifyOpts = parseVerifyOptions([
      '--scope',
      scopePath,
      '--sandbox-rehearsal',
    ]);
    assert.equal(verifyOpts.sandboxRehearsal, true);
  });
});
