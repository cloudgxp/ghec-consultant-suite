import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import type {
  MigrationExecutionReport,
  MigrationResultsManifest,
  ModuleExecutionResult,
  ModulePlan,
  RepositoryMigrationRecord,
  VerificationReport,
} from '@ghec/contracts';
import {
  ALL_ORGANIZATION_MODULES,
  enrichModuleExecutionResult,
} from '../../src/orchestrator/index.js';
import {
  formatFailureRepoMarkdown,
  formatOrgModuleDetailMarkdown,
  formatRepoModuleDetailMarkdown,
  formatResultsReadmeMarkdown,
  formatSuccessRepoMarkdown,
  generateMigrationResults,
  writeResultsToDirectory,
} from '../../src/reporting/index.js';

test('formatResultsReadmeMarkdown produces clean executive overview with markdown tables', () => {
  const manifest: MigrationResultsManifest = {
    schemaVersion: '1.0.0',
    runId: 'run-wave-01',
    generatedAt: '2026-10-08T12:00:00Z',
    sourceOrg: 'src-org',
    targetOrg: 'tgt-org',
    targetResultsRepo: 'gei-migration-results',
    executionMode: 'live',
    summary: {
      totalRepositories: 2,
      succeededCount: 1,
      failedCount: 1,
      successRatePercent: 50,
      durationMs: 30000,
      orgModulesSummary: {
        teams: {
          status: 'complete',
          totalOperations: 4,
          succeededOperations: 4,
          failedOperations: 0,
          skippedOperations: 0,
          durationMs: 1500,
        },
      },
    },
    repositories: [
      {
        sourceRepo: 'repo-one',
        targetRepo: 'repo-one',
        status: 'succeeded',
        relativeFilePath: 'success/repo-one.md',
        durationMs: 15000,
        stagesRun: ['preflight', 'gei', 'verification'],
        verified: true,
        discrepancyCount: 0,
        warnings: [],
      },
      {
        sourceRepo: 'repo-two',
        targetRepo: 'repo-two',
        status: 'failed',
        relativeFilePath: 'failure/repo-two.md',
        durationMs: 15000,
        stagesRun: ['preflight', 'gei'],
        verified: false,
        discrepancyCount: 1,
        failureReason: 'Missing webhook secret mapping',
        failedStage: 'webhooks',
        warnings: [],
      },
    ],
  };

  const readme = formatResultsReadmeMarkdown(manifest);
  assert.ok(readme.includes('# Migration Results: src-org ➔ tgt-org'));
  assert.ok(readme.includes('| Total Repositories | 2 |'));
  assert.ok(readme.includes('| Success Rate | 50% |'));
  assert.ok(
    readme.includes('| `teams` | ✅ complete | 4 | 4 | 0 | 0 | 1.5s |'),
  );
  assert.ok(readme.includes('[View Log](success/repo-one.md)'));
  assert.ok(readme.includes('[View Failure Log](failure/repo-two.md)'));
  assert.ok(readme.includes('Missing webhook secret mapping'));
});

test('formatSuccessRepoMarkdown formats clean success documentation', () => {
  const record: RepositoryMigrationRecord = {
    sourceRepo: 'core-api',
    targetRepo: 'core-api',
    status: 'succeeded',
    relativeFilePath: 'success/core-api.md',
    durationMs: 12400,
    stagesRun: ['preflight', 'gei', 'variables', 'rulesets', 'verification'],
    verified: true,
    discrepancyCount: 0,
    warnings: [],
  };

  const md = formatSuccessRepoMarkdown(record, {
    visibility: 'private',
    defaultBranch: 'main',
    diskUsageKb: 4096,
  });

  assert.ok(md.includes('# Migration Result: core-api'));
  assert.ok(md.includes('✅ Succeeded'));
  assert.ok(md.includes('`main`'));
  assert.ok(md.includes('Zero Discrepancies'));
  assert.ok(md.includes('| `preflight` | ✅ Completed |'));
});

test('formatFailureRepoMarkdown formats caution alert and diagnostic runbook', () => {
  const record: RepositoryMigrationRecord = {
    sourceRepo: 'broken-repo',
    targetRepo: 'broken-repo',
    status: 'failed',
    relativeFilePath: 'failure/broken-repo.md',
    durationMs: 5000,
    stagesRun: ['preflight', 'gei'],
    verified: false,
    discrepancyCount: 2,
    failureReason:
      'GEI migration failed: HTTP 403 Forbidden with token ghp_abcdefghijklmnopqrstuvwxyz012345',
    failedStage: 'gei',
    warnings: [],
    remediationCommands: ['gh gei migrate-repo --source-repo broken-repo'],
  };

  const md = formatFailureRepoMarkdown(record, {
    discrepancies: [
      {
        resourceName: 'broken-repo:ruleset',
        expected: 'exempt',
        actual: 'always_allow',
        message: 'Ruleset bypass actor not configured as exempt',
      },
    ],
    errorLogs: [
      'Error: unauthorized access at https://api.github.com/repos/broken-repo',
    ],
  });

  assert.ok(md.includes('> [!CAUTION]'));
  assert.ok(md.includes('❌ Failed'));
  assert.ok(md.includes('gh gei migrate-repo'));
  assert.ok(md.includes('Ruleset bypass actor not configured as exempt'));
  // Token should be sanitized
  assert.ok(!md.includes('ghp_abcdefghijklmnopqrstuvwxyz012345'));
  assert.ok(md.includes('[REDACTED_TOKEN]'));
});

test('generateMigrationResults creates in-memory file tree for all successful repositories', () => {
  const executionReport: MigrationExecutionReport = {
    schemaVersion: '1.0.0',
    planId: 'plan-100',
    executedAt: '2026-10-08T12:00:00Z',
    status: 'complete',
    exitCode: 0,
    dryRun: false,
    results: [
      {
        schemaVersion: '1.0.0',
        moduleId: 'teams',
        status: 'complete',
        results: [
          {
            operationId: 'team-1',
            status: 'succeeded',
            completedAt: '2026-10-08T12:00:01Z',
          },
        ],
        durationMs: 1000,
      },
    ],
  };

  const verificationReport: VerificationReport = {
    schemaVersion: '1.0.0',
    reportId: 'ver-100',
    verifiedAt: '2026-10-08T12:05:00Z',
    scopeName: 'test-scope',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    modules: [
      {
        moduleId: 'teams',
        verified: true,
        discrepancies: [],
      },
    ],
    summary: {
      verifiedModuleCount: 1,
      unverifiedModuleCount: 0,
      discrepancyCount: 0,
    },
  };

  const results = generateMigrationResults({
    runId: 'run-clean',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    executionMode: 'live',
    executionReport,
    verificationReport,
    scope: {
      version: '1.0.0',
      name: 'test-scope',
      repositories: [
        {
          sourceOrg: 'source-org',
          sourceRepo: 'repo-clean-1',
          targetOrg: 'target-org',
          targetRepo: 'repo-clean-1',
          useGei: true,
        },
      ],
    },
  });

  assert.equal(results.manifest.summary.totalRepositories, 1);
  assert.equal(results.manifest.summary.succeededCount, 1);
  assert.equal(results.manifest.summary.failedCount, 0);
  assert.equal(results.manifest.summary.successRatePercent, 100);

  assert.ok(results.files['README.md']);
  assert.ok(results.files['manifest.json']);
  assert.ok(results.files['success/repo-clean-1.md']);
  assert.equal(results.files['failure/repo-clean-1.md'], undefined);
});

test('generateMigrationResults creates failure documentation when verification finds discrepancies', () => {
  const verificationReport: VerificationReport = {
    schemaVersion: '1.0.0',
    reportId: 'ver-200',
    verifiedAt: '2026-10-08T12:05:00Z',
    scopeName: 'test-scope',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    modules: [
      {
        moduleId: 'rulesets',
        verified: false,
        discrepancies: [
          {
            resourceName: 'failing-repo:ruleset-default',
            expected: { bypass: 'exempt' },
            actual: { bypass: 'none' },
            message: 'Destination ruleset bypass actor is missing.',
          },
        ],
      },
    ],
    summary: {
      verifiedModuleCount: 0,
      unverifiedModuleCount: 1,
      discrepancyCount: 1,
    },
  };

  const results = generateMigrationResults({
    runId: 'run-discrepant',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    executionMode: 'live',
    verificationReport,
    scope: {
      version: '1.0.0',
      name: 'test-scope',
      repositories: [
        {
          sourceOrg: 'source-org',
          sourceRepo: 'failing-repo',
          targetOrg: 'target-org',
          targetRepo: 'failing-repo',
          useGei: true,
        },
      ],
    },
    remediationPlan: {
      actions: [
        {
          id: 'rem-1',
          resourceName: 'failing-repo:ruleset-default',
          command:
            'ghec-consultant-cli migrate --modules rulesets --scope test.json',
        },
      ],
    },
  });

  assert.equal(results.manifest.summary.totalRepositories, 1);
  assert.equal(results.manifest.summary.succeededCount, 0);
  assert.equal(results.manifest.summary.failedCount, 1);
  assert.equal(results.manifest.summary.successRatePercent, 0);

  assert.ok(results.files['README.md']);
  assert.ok(results.files['manifest.json']);
  assert.ok(results.files['failure/failing-repo.md']);
  assert.ok(
    results.files['failure/failing-repo.md'].includes(
      'Destination ruleset bypass actor is missing.',
    ),
  );
  assert.ok(
    results.files['failure/failing-repo.md'].includes(
      'ghec-consultant-cli migrate --modules rulesets',
    ),
  );
});

test('writeResultsToDirectory persists files to temporary directory', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'results-test-'));
  try {
    const manifest: MigrationResultsManifest = {
      schemaVersion: '1.0.0',
      runId: 'run-fs',
      generatedAt: '2026-10-08T12:00:00Z',
      sourceOrg: 's-org',
      targetOrg: 't-org',
      targetResultsRepo: 'gei-migration-results',
      executionMode: 'dry-run',
      summary: {
        totalRepositories: 1,
        succeededCount: 1,
        failedCount: 0,
        successRatePercent: 100,
        durationMs: 2000,
        orgModulesSummary: {},
      },
      repositories: [
        {
          sourceRepo: 'app',
          targetRepo: 'app',
          status: 'succeeded',
          relativeFilePath: 'success/app.md',
          durationMs: 2000,
          stagesRun: ['preflight'],
          verified: true,
          discrepancyCount: 0,
          warnings: [],
        },
      ],
    };

    const generated = {
      manifest,
      files: {
        'README.md': '# Results',
        'manifest.json': JSON.stringify(manifest),
        'success/app.md': '# Success App',
      },
    };

    const written = writeResultsToDirectory(generated, tmpDir);
    assert.equal(written.length, 3);
    assert.ok(existsSync(join(tmpDir, 'README.md')));
    assert.ok(existsSync(join(tmpDir, 'manifest.json')));
    assert.ok(existsSync(join(tmpDir, 'success/app.md')));
    assert.equal(readFileSync(join(tmpDir, 'README.md'), 'utf-8'), '# Results');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('enrichModuleExecutionResult attaches planned operation metadata and sanitizes diagnostics', () => {
  const rawResult: ModuleExecutionResult = {
    schemaVersion: '1.0.0',
    moduleId: 'repo-variables',
    status: 'complete',
    results: [
      {
        operationId: 'var-op-1',
        status: 'succeeded',
        completedAt: '2026-10-08T12:00:00Z',
      },
      {
        operationId: 'var-op-2',
        status: 'failed',
        error: 'Auth error with token ghp_1234567890abcdefghijklmnopqrstuv',
      },
    ],
    durationMs: 250,
  };

  const plan: ModulePlan = {
    schemaVersion: '1.0.0',
    moduleId: 'repo-variables',
    operations: [
      {
        id: 'var-op-1',
        operation: 'create',
        resourceType: 'repo-variable',
        resourceName: 'API_BASE_URL',
        reason: 'Create repository variable API_BASE_URL',
      },
      {
        id: 'var-op-2',
        operation: 'update',
        resourceType: 'repo-variable',
        resourceName: 'RETRY_COUNT',
        reason: 'Update repository variable RETRY_COUNT',
      },
    ],
    summary: {
      totalOperations: 2,
      createCount: 1,
      updateCount: 1,
      noopCount: 0,
      skipCount: 0,
    },
  };

  const enriched = enrichModuleExecutionResult(rawResult, plan, {
    targetIdentifier: 'src-org/core-service',
    scopeLevel: 'repository',
  });

  assert.equal(enriched.targetIdentifier, 'src-org/core-service');
  assert.equal(enriched.scopeLevel, 'repository');
  assert.equal(enriched.results[0]?.resourceName, 'API_BASE_URL');
  assert.equal(enriched.results[0]?.resourceType, 'repo-variable');
  assert.equal(enriched.results[0]?.operationType, 'create');
  assert.equal(
    enriched.results[0]?.reason,
    'Create repository variable API_BASE_URL',
  );
  assert.equal(enriched.results[1]?.resourceName, 'RETRY_COUNT');
  assert.equal(enriched.results[1]?.operationType, 'update');
  assert.ok(
    !enriched.results[1]?.error?.includes(
      'ghp_1234567890abcdefghijklmnopqrstuv',
    ),
  );
  assert.ok(enriched.results[1]?.error?.includes('[REDACTED_TOKEN]'));
});

test('recognizes all ALL_ORGANIZATION_MODULES plus org-scoped rulesets and generates Tier 2 organization/<module>.md pages', () => {
  const orgModuleIds = [...ALL_ORGANIZATION_MODULES, 'rulesets'];
  const executionReport: MigrationExecutionReport = {
    schemaVersion: '1.0.0',
    planId: 'plan-org-all',
    executedAt: '2026-10-08T12:00:00Z',
    status: 'complete',
    exitCode: 0,
    dryRun: false,
    results: orgModuleIds.map((moduleId) => ({
      schemaVersion: '1.0.0',
      moduleId,
      targetIdentifier: 'org:source-org',
      scopeLevel: 'organization' as const,
      status: 'complete' as const,
      results: [
        {
          operationId: `${moduleId}-op-1`,
          status: 'succeeded' as const,
          resourceType: moduleId,
          resourceName:
            moduleId === 'org-secrets'
              ? 'ORG_DEPLOY_TOKEN'
              : `${moduleId}-item-1`,
          operationType: 'create' as const,
          reason: `Provision ${moduleId} resource`,
          completedAt: '2026-10-08T12:00:01Z',
        },
      ],
      durationMs: 500,
    })),
  };

  const results = generateMigrationResults({
    runId: 'run-org-all',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    executionMode: 'live',
    executionReport,
    scope: {
      version: '1.0.0',
      name: 'org-scope',
      repositories: [],
    },
  });

  const orgSummary = results.manifest.summary.orgModulesSummary;
  assert.ok(orgSummary);

  for (const moduleId of orgModuleIds) {
    assert.ok(
      orgSummary[moduleId],
      `Expected orgModulesSummary to include ${moduleId}`,
    );
    assert.equal(
      orgSummary[moduleId]?.relativeFilePath,
      `organization/${moduleId}.md`,
    );
    const pageContent = results.files[`organization/${moduleId}.md`];
    assert.ok(
      pageContent,
      `Expected results.files to contain organization/${moduleId}.md`,
    );
    assert.ok(pageContent.includes('[← Back to Overview](../README.md)'));
    assert.ok(pageContent.includes('## Granular Organization Items'));
  }

  // Verify DEC-004 [SEALED] placeholder on org-secrets
  const orgSecretsMd = results.files['organization/org-secrets.md'] ?? '';
  assert.ok(orgSecretsMd.includes('`ORG_DEPLOY_TOKEN` `[SEALED]`'));
});

test('generates full 3-tier hierarchy with standalone executionReport, secret sealing, and valid relative Markdown links', () => {
  const executionReport: MigrationExecutionReport = {
    schemaVersion: '1.0.0',
    planId: 'plan-3tier',
    executedAt: '2026-10-08T12:00:00Z',
    status: 'failed',
    exitCode: 1,
    dryRun: false,
    results: [
      {
        schemaVersion: '1.0.0',
        moduleId: 'teams',
        targetIdentifier: 'org:source-org',
        scopeLevel: 'organization',
        status: 'complete',
        results: [
          {
            operationId: 'team-platform',
            status: 'succeeded',
            resourceType: 'team',
            resourceName: 'platform-eng',
            operationType: 'create',
            reason: 'Create team platform-eng',
            completedAt: '2026-10-08T12:00:01Z',
          },
        ],
        durationMs: 1200,
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'repo-variables',
        targetIdentifier: 'source-org/alpha-api',
        scopeLevel: 'repository',
        status: 'complete',
        results: [
          {
            operationId: 'alpha-var-1',
            status: 'succeeded',
            resourceType: 'repo-variable',
            resourceName: 'NODE_ENV',
            operationType: 'create',
            reason: 'Create variable NODE_ENV',
            completedAt: '2026-10-08T12:00:02Z',
          },
        ],
        durationMs: 800,
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'repo-secrets',
        targetIdentifier: 'source-org/alpha-api',
        scopeLevel: 'repository',
        status: 'complete',
        results: [
          {
            operationId: 'alpha-sec-1',
            status: 'succeeded',
            resourceType: 'repo-secret',
            resourceName: 'DATABASE_PASSWORD',
            operationType: 'create',
            reason: 'Create sealed placeholder for DATABASE_PASSWORD',
            completedAt: '2026-10-08T12:00:03Z',
          },
        ],
        durationMs: 600,
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'webhooks',
        targetIdentifier: 'source-org/beta-worker',
        scopeLevel: 'repository',
        status: 'failed',
        results: [
          {
            operationId: 'beta-hook-1',
            status: 'failed',
            resourceType: 'webhook',
            resourceName: 'https://hooks.example.com/notify',
            operationType: 'create',
            error:
              'Webhook creation failed with token ghp_secret1234567890abcdefghijklmnop',
          },
        ],
        durationMs: 950,
      },
    ],
  };

  const verificationReport: VerificationReport = {
    schemaVersion: '1.0.0',
    reportId: 'ver-3tier',
    verifiedAt: '2026-10-08T12:05:00Z',
    scopeName: '3tier-scope',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    modules: [
      {
        moduleId: 'teams',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'repo-variables',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'repo-secrets',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'webhooks',
        verified: false,
        discrepancies: [
          {
            resourceName: 'beta-worker:https://hooks.example.com/notify',
            expected: 'active',
            actual: 'missing',
            message: 'Webhook missing at destination',
          },
        ],
      },
    ],
    summary: {
      verifiedModuleCount: 3,
      unverifiedModuleCount: 1,
      discrepancyCount: 1,
    },
  };

  const results = generateMigrationResults({
    runId: 'run-3tier',
    sourceOrg: 'source-org',
    targetOrg: 'target-org',
    executionMode: 'live',
    executionReport,
    verificationReport,
    scope: {
      version: '1.0.0',
      name: '3tier-scope',
      repositories: [
        {
          sourceOrg: 'source-org',
          sourceRepo: 'alpha-api',
          targetOrg: 'target-org',
          targetRepo: 'alpha-api',
          useGei: true,
        },
        {
          sourceOrg: 'source-org',
          sourceRepo: 'beta-worker',
          targetOrg: 'target-org',
          targetRepo: 'beta-worker',
          useGei: true,
        },
      ],
    },
  });

  // Verify Tier 1 README
  const readme = results.files['README.md'] ?? '';
  assert.ok(readme.includes('[View Details](organization/teams.md)'));
  assert.ok(readme.includes('2 categories (2 items)'));
  assert.ok(readme.includes('1 categories (1 items)'));

  // Verify Tier 2 Org page
  const orgTeamsMd = results.files['organization/teams.md'] ?? '';
  assert.ok(orgTeamsMd.includes('[← Back to Overview](../README.md)'));
  assert.ok(orgTeamsMd.includes('`platform-eng`'));

  // Verify Tier 2 Repo pages contain Migrated Items Summary & links to Tier 3
  const alphaMd = results.files['success/alpha-api.md'] ?? '';
  assert.ok(alphaMd.includes('[← Back to Overview](../README.md)'));
  assert.ok(alphaMd.includes('## Migrated Items Summary'));
  assert.ok(
    alphaMd.includes(
      '[View Items](../repositories/alpha-api/repo-variables.md)',
    ),
  );
  assert.ok(
    alphaMd.includes('[View Items](../repositories/alpha-api/repo-secrets.md)'),
  );

  const betaMd = results.files['failure/beta-worker.md'] ?? '';
  assert.ok(betaMd.includes('[← Back to Overview](../README.md)'));
  assert.ok(betaMd.includes('## Migrated Items Summary'));
  assert.ok(
    betaMd.includes('[View Items](../repositories/beta-worker/webhooks.md)'),
  );

  // Verify Tier 3 Repo Module pages
  const alphaVarsMd =
    results.files['repositories/alpha-api/repo-variables.md'] ?? '';
  assert.ok(
    alphaVarsMd.includes(
      '[← Back to alpha-api](../../success/alpha-api.md) | [Overview](../../README.md)',
    ),
  );
  assert.ok(alphaVarsMd.includes('`NODE_ENV`'));

  const alphaSecretsMd =
    results.files['repositories/alpha-api/repo-secrets.md'] ?? '';
  assert.ok(alphaSecretsMd.includes('`DATABASE_PASSWORD` `[SEALED]`'));

  const betaHooksMd =
    results.files['repositories/beta-worker/webhooks.md'] ?? '';
  assert.ok(
    betaHooksMd.includes(
      '[← Back to beta-worker](../../failure/beta-worker.md) | [Overview](../../README.md)',
    ),
  );
  assert.ok(
    !betaHooksMd.includes('ghp_secret1234567890abcdefghijklmnop'),
    'Token must be redacted in Tier 3 page',
  );
  assert.ok(betaHooksMd.includes('[REDACTED_TOKEN]'));
  assert.ok(betaHooksMd.includes('Webhook missing at destination'));

  // Verify every relative Markdown link across all generated files resolves to an existing key in results.files
  const markdownLinkRegex = /\[[^\]]+\]\(([^)]+\.md)\)/g;
  for (const [filePath, content] of Object.entries(results.files)) {
    if (!filePath.endsWith('.md')) continue;
    const dir = posix.dirname(filePath);
    let match: RegExpExecArray | null;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const relativeTarget = match[1];
      assert.ok(relativeTarget);
      const resolvedPath = posix.normalize(posix.join(dir, relativeTarget));
      assert.ok(
        results.files[resolvedPath] !== undefined,
        `Broken link in ${filePath}: (${relativeTarget}) resolved to "${resolvedPath}" which does not exist in results.files`,
      );
    }
  }
});

test('formatOrgModuleDetailMarkdown and formatRepoModuleDetailMarkdown escape pipe characters in table cells', () => {
  const orgMd = formatOrgModuleDetailMarkdown({
    moduleId: 'org-variables',
    sourceOrg: 'src-org',
    targetOrg: 'tgt-org',
    summary: {
      status: 'complete',
      totalOperations: 1,
      succeededOperations: 1,
      failedOperations: 0,
      skippedOperations: 0,
      durationMs: 100,
    },
    items: [
      {
        operationId: 'op-1',
        resourceName: 'VAR_WITH_|_PIPE',
        resourceType: 'org-variable',
        operationType: 'create',
        status: 'succeeded',
        verificationStatus: 'verified',
        notes: 'Note with | pipe\nand newline',
      },
    ],
  });
  assert.ok(orgMd.includes('`VAR_WITH_\\|_PIPE`'));
  assert.ok(orgMd.includes('Note with \\| pipe and newline'));

  const repoMd = formatRepoModuleDetailMarkdown({
    moduleId: 'repo-variables',
    sourceRepo: 'my-repo',
    targetRepo: 'my-repo',
    repoStatus: 'succeeded',
    summary: {
      moduleId: 'repo-variables',
      status: 'complete',
      totalOperations: 1,
      succeededOperations: 1,
      failedOperations: 0,
      skippedOperations: 0,
      discrepancyCount: 0,
      durationMs: 100,
      relativeFilePath: 'repositories/my-repo/repo-variables.md',
    },
    items: [
      {
        operationId: 'op-2',
        resourceName: 'REPO_VAR_|_PIPE',
        resourceType: 'repo-variable',
        operationType: 'update',
        status: 'succeeded',
        verificationStatus: 'verified',
        notes: 'Updated | value',
      },
    ],
  });
  assert.ok(repoMd.includes('`REPO_VAR_\\|_PIPE`'));
  assert.ok(repoMd.includes('Updated \\| value'));
});

test('replaces pre-migration absence/drift planning reasons with post-migration outcome notes when succeeded and verified', () => {
  const executionReport: MigrationExecutionReport = {
    schemaVersion: '1.0.0',
    planId: 'plan-notes',
    executedAt: '2026-10-15T12:00:00Z',
    status: 'complete',
    exitCode: 0,
    dryRun: false,
    results: [
      {
        schemaVersion: '1.0.0',
        moduleId: 'org-rulesets',
        targetIdentifier: 'demogxp-mig2',
        scopeLevel: 'organization',
        status: 'complete',
        durationMs: 200,
        results: [
          {
            operationId: 'ruleset:skip-org:demogxp-mig2:demo-ruleset',
            status: 'skipped',
            resourceType: 'ruleset',
            resourceName: 'demo-ruleset',
            operationType: 'skip',
            reason:
              'Selected target repositories have not been migrated yet; deferring.',
          },
          {
            operationId: 'ruleset:create-org:demogxp-mig2:demo-ruleset',
            status: 'succeeded',
            resourceType: 'ruleset',
            resourceName: 'demo-ruleset',
            operationType: 'create',
            reason: 'Ruleset is missing on target.',
          },
          {
            operationId: 'ruleset:noop-org:demogxp-mig2:demo-ruleset',
            status: 'succeeded',
            resourceType: 'ruleset',
            resourceName: 'demo-ruleset',
            operationType: 'noop',
            reason: 'Ruleset configuration is identical on target.',
          },
        ],
      },
    ],
  };

  const verificationReport: VerificationReport = {
    schemaVersion: '1.0.0',
    reportId: 'ver-notes',
    verifiedAt: '2026-10-15T12:05:00Z',
    scopeName: 'notes-scope',
    sourceOrg: 'demogxp',
    targetOrg: 'demogxp-mig2',
    modules: [
      {
        moduleId: 'org-rulesets',
        verified: true,
        discrepancies: [],
      },
    ],
    summary: {
      verifiedModuleCount: 1,
      unverifiedModuleCount: 0,
      discrepancyCount: 0,
    },
  };

  const results = generateMigrationResults({
    sourceOrg: 'demogxp',
    targetOrg: 'demogxp-mig2',
    executionMode: 'live',
    executionReport,
    verificationReport,
  });

  const orgRulesetsMd = results.files['organization/org-rulesets.md'] ?? '';
  assert.ok(!orgRulesetsMd.includes('Ruleset is missing on target.'));
  assert.ok(orgRulesetsMd.includes('Created and verified on target.'));
  assert.equal(
    results.manifest.summary.orgModulesSummary['org-rulesets']?.totalOperations,
    1,
  );
});

test('filters legacy autolinks/codeowners noise, marks 0-item modules as skipped, counts only active categories in README, and renders verification warnings and default noop notes', () => {
  const executionReport: MigrationExecutionReport = {
    schemaVersion: '1.0.0',
    planId: 'plan-consistency',
    executedAt: '2026-10-15T18:30:00Z',
    status: 'complete',
    exitCode: 0,
    dryRun: false,
    results: [
      {
        schemaVersion: '1.0.0',
        moduleId: 'org-variables',
        targetIdentifier: 'demogxp-mig2',
        scopeLevel: 'organization',
        status: 'complete',
        durationMs: 120,
        results: [
          {
            operationId: 'org-variables:noop:ORG_SHARED_VAR',
            status: 'succeeded',
            resourceType: 'org-variable',
            resourceName: 'ORG_SHARED_VAR',
            operationType: 'noop',
            completedAt: '2026-10-15T18:30:01Z',
          },
        ],
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'gei-repo',
        targetIdentifier: 'demogxp-mig2/demo',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 90,
        results: [],
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'autolinks',
        targetIdentifier: 'demogxp-mig2/demo',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 40,
        results: [
          {
            operationId: 'op-autolink-noop-empty-demo',
            status: 'succeeded',
            resourceType: 'autolink',
            resourceName: 'demo:autolinks',
            operationType: 'noop',
            reason: 'No autolinks defined on source repository',
            completedAt: '2026-10-15T18:30:02Z',
          },
        ],
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'post-migration-codeowners',
        targetIdentifier: 'demogxp-mig2/demo',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 50,
        results: [
          {
            operationId: 'codeowners:noop:.github/CODEOWNERS',
            status: 'succeeded',
            resourceType: 'codeowners-file',
            resourceName: '.github/CODEOWNERS',
            operationType: 'noop',
            completedAt: '2026-10-15T18:30:03Z',
          },
          {
            operationId: 'codeowners:noop:.github/workflows/ci.yml',
            status: 'succeeded',
            resourceType: 'codeowners-file',
            resourceName: '.github/workflows/ci.yml',
            operationType: 'noop',
            completedAt: '2026-10-15T18:30:03Z',
          },
        ],
      },
    ],
  };

  const verificationReport: VerificationReport = {
    schemaVersion: '1.0.0',
    reportId: 'ver-consistency',
    verifiedAt: '2026-10-15T18:35:00Z',
    scopeName: 'consistency-scope',
    sourceOrg: 'demogxp',
    targetOrg: 'demogxp-mig2',
    modules: [
      {
        moduleId: 'org-variables',
        verified: true,
        discrepancies: [],
        warnings: ['Organization variable values are verified by name parity.'],
      },
      {
        moduleId: 'gei-repo',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'autolinks',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'post-migration-codeowners',
        verified: true,
        discrepancies: [],
        warnings: [
          '[demogxp-mig2/demo] CODEOWNERS verified with pass-through team ownership.',
        ],
      },
    ],
    summary: {
      verifiedModuleCount: 4,
      unverifiedModuleCount: 0,
      discrepancyCount: 0,
    },
  };

  const results = generateMigrationResults({
    sourceOrg: 'demogxp',
    targetOrg: 'demogxp-mig2',
    executionMode: 'live',
    generatedAt: '2026-10-15T19:00:00Z',
    executionReport,
    verificationReport,
    scope: {
      version: '1.0.0',
      name: 'consistency-scope',
      repositories: [
        {
          sourceOrg: 'demogxp',
          sourceRepo: 'demo',
          targetOrg: 'demogxp-mig2',
          targetRepo: 'demo',
          useGei: true,
        },
      ],
    },
  });

  // 1. autolinks should have 0 items and status 'skipped'
  const demoRecord = results.manifest.repositories[0];
  assert.ok(demoRecord);
  assert.equal(demoRecord.moduleSummaries?.['autolinks']?.status, 'skipped');
  assert.equal(demoRecord.moduleSummaries?.['autolinks']?.totalOperations, 0);

  // 2. post-migration-codeowners should keep .github/CODEOWNERS and filter out untouched .github/workflows/ci.yml
  assert.equal(
    demoRecord.moduleSummaries?.['post-migration-codeowners']?.status,
    'complete',
  );
  assert.equal(
    demoRecord.moduleSummaries?.['post-migration-codeowners']?.totalOperations,
    1,
  );
  const codeownersMd =
    results.files['repositories/demo/post-migration-codeowners.md'] ?? '';
  assert.ok(codeownersMd.includes('`.github/CODEOWNERS`'));
  assert.ok(!codeownersMd.includes('.github/workflows/ci.yml'));
  assert.ok(
    codeownersMd.includes(
      'Configuration already matches target; verified parity.',
    ),
  );
  assert.ok(codeownersMd.includes('### Module Warnings'));
  assert.ok(
    codeownersMd.includes(
      'CODEOWNERS verified with pass-through team ownership.',
    ),
  );

  // 3. gei-repo should use earliest repo operation timestamp and noop parity note
  const geiRepoMd = results.files['repositories/demo/gei-repo.md'] ?? '';
  assert.ok(geiRepoMd.includes('`2026-10-15T18:30:02Z`'));
  assert.ok(geiRepoMd.includes('`noop`'));
  assert.ok(
    geiRepoMd.includes(
      'Target repository already exists on destination; verified parity.',
    ),
  );

  // 4. README should count only active (non-skipped) categories: gei-repo + post-migration-codeowners = 2 categories (2 items)
  const readmeMd = results.files['README.md'] ?? '';
  assert.ok(readmeMd.includes('2 categories (2 items)'));

  // 5. Org module detail should include verification warnings and default noop note
  const orgVarsMd = results.files['organization/org-variables.md'] ?? '';
  assert.ok(orgVarsMd.includes('### Module Warnings'));
  assert.ok(
    orgVarsMd.includes(
      'Organization variable values are verified by name parity.',
    ),
  );
  assert.ok(
    orgVarsMd.includes(
      'Configuration already matches target; verified parity.',
    ),
  );
});

test('parses gei-repo sub-action operation IDs, synthesizes strategy-aware GEI log summaries, strips org/repo prefixes, normalizes past-tense notes, deduplicates reports, and links Audit Repository', () => {
  const duplicateOrgModule: ModuleExecutionResult = {
    schemaVersion: '1.0.0',
    moduleId: 'teams',
    targetIdentifier: 'demogxp-mig4',
    scopeLevel: 'organization',
    status: 'complete',
    durationMs: 2500,
    results: [
      {
        operationId: 'team:create:platform-team',
        status: 'succeeded',
        resourceType: 'team',
        resourceName: 'platform-team',
        operationType: 'create',
        reason: 'Create team platform-team on target organization.',
        completedAt: '2026-10-16T08:00:00Z',
      },
    ],
  };

  const executionReport: MigrationExecutionReport = {
    schemaVersion: '1.0.0',
    planId: 'plan-audit-fixes',
    executedAt: '2026-10-16T08:10:00Z',
    status: 'complete',
    exitCode: 0,
    dryRun: false,
    results: [
      duplicateOrgModule,
      duplicateOrgModule, // Duplicate entry should be ignored so durationMs is not doubled
      {
        schemaVersion: '1.0.0',
        moduleId: 'gei-repo',
        targetIdentifier: 'demogxp-mig4/release-heavy-benchmark',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 120000,
        failedMetadataCategories: ['releases'],
        results: [
          {
            operationId: 'gei-repo-migration-release-heavy-benchmark',
            status: 'succeeded',
            completedAt: '2026-10-16T08:01:00Z',
          },
        ],
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'releases',
        targetIdentifier: 'demogxp-mig4/release-heavy-benchmark',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 480000,
        results: [
          {
            operationId: 'release:release-heavy-benchmark:v1.0.0',
            status: 'succeeded',
            resourceType: 'release',
            resourceName: 'v1.0.0',
            operationType: 'create',
            reason:
              'Release "v1.0.0" does not exist on target; recreate oldest-first.',
            completedAt: '2026-10-16T08:05:00Z',
          },
          {
            operationId:
              'release-asset:release-heavy-benchmark:v1.0.0:engine.tar.gz',
            status: 'succeeded',
            resourceType: 'release-asset',
            resourceName: 'v1.0.0/engine.tar.gz',
            operationType: 'create',
            reason:
              'Streamed release asset "engine.tar.gz" (1073741824 bytes) to release "v1.0.0".',
            completedAt: '2026-10-16T08:06:00Z',
          },
        ],
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'repo-settings',
        targetIdentifier: 'demogxp-mig4/release-heavy-benchmark',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 500,
        results: [
          {
            operationId:
              'repo-settings:update:demogxp-mig4/release-heavy-benchmark',
            status: 'succeeded',
            resourceType: 'repository-settings',
            resourceName: 'demogxp-mig4/release-heavy-benchmark',
            operationType: 'update',
            reason:
              'Update repository settings (auto-merge, branch deletion, merge strategies) on target.',
            completedAt: '2026-10-16T08:06:10Z',
          },
        ],
      },
      {
        schemaVersion: '1.0.0',
        moduleId: 'gei-repo',
        targetIdentifier: 'demogxp-mig4/chromium',
        scopeLevel: 'repository',
        status: 'complete',
        durationMs: 300000,
        failedMetadataCategories: ['issues', 'pull_requests', 'releases'],
        results: [
          {
            operationId: 'gei-repo-mirror-push-chromium',
            status: 'succeeded',
            completedAt: '2026-10-16T08:07:00Z',
          },
        ],
      },
    ],
  };

  const verificationReport: VerificationReport = {
    schemaVersion: '1.0.0',
    reportId: 'ver-audit-fixes',
    verifiedAt: '2026-10-16T08:15:00Z',
    scopeName: 'audit-fixes-scope',
    sourceOrg: 'demogxp',
    targetOrg: 'demogxp-mig4',
    modules: [
      {
        moduleId: 'teams',
        verified: true,
        discrepancies: [],
        warnings: ['[demogxp-mig4] Team IdP group bindings verified.'],
      },
      {
        moduleId: 'gei-repo',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'releases',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'repo-settings',
        verified: true,
        discrepancies: [],
      },
    ],
    summary: {
      verifiedModuleCount: 4,
      unverifiedModuleCount: 0,
      discrepancyCount: 0,
    },
  };

  const results = generateMigrationResults({
    sourceOrg: 'demogxp',
    targetOrg: 'demogxp-mig4',
    targetResultsRepo: 'migration-audit-results',
    executionMode: 'live',
    executionReport,
    verificationReport,
    scope: {
      version: '1.0.0',
      name: 'audit-fixes-scope',
      repositories: [
        {
          sourceOrg: 'demogxp',
          sourceRepo: 'release-heavy-benchmark',
          targetOrg: 'demogxp-mig4',
          targetRepo: 'release-heavy-benchmark',
          useGei: true,
        },
        {
          sourceOrg: 'demogxp',
          sourceRepo: 'chromium',
          targetOrg: 'demogxp-mig4',
          targetRepo: 'chromium',
          useGei: true,
        },
      ],
    },
  });

  // 1. README has clickable Audit Repository link
  const readmeMd = results.files['README.md'] ?? '';
  assert.ok(
    readmeMd.includes(
      '> **Audit Repository:** [`migration-audit-results`](https://github.com/demogxp-mig4/migration-audit-results)',
    ),
    'README missing clickable Audit Repository link',
  );

  // 2. Duplicate org module execution is deduplicated (durationMs = 2500, not 5000) and [demogxp-mig4] warning prefix is stripped
  assert.equal(
    results.manifest.summary.orgModulesSummary['teams']?.durationMs,
    2500,
  );
  const orgTeamsMd = results.files['organization/teams.md'] ?? '';
  assert.ok(
    orgTeamsMd.includes('Created team platform-team on target organization.'),
    `orgTeamsMd missing past-tense note: ${orgTeamsMd}`,
  );
  assert.ok(
    orgTeamsMd.includes('- Team IdP group bindings verified.'),
    `orgTeamsMd missing stripped warning: ${orgTeamsMd}`,
  );
  assert.ok(
    !orgTeamsMd.includes('[demogxp-mig4] Team IdP'),
    'orgTeamsMd still has [demogxp-mig4] prefix',
  );

  // 3. gei-repo.md parses clean resource name and strategy note
  const rhmGeiMd =
    results.files['repositories/release-heavy-benchmark/gei-repo.md'] ?? '';
  assert.ok(
    rhmGeiMd.includes(
      '| `release-heavy-benchmark` | `repository` | `create` | ✅ succeeded | `2026-10-16T08:01:00Z` | ✅ Verified |',
    ),
    `rhmGeiMd missing clean row: ${rhmGeiMd}`,
  );
  assert.ok(
    rhmGeiMd.includes('--skip-releases'),
    `rhmGeiMd missing --skip-releases: ${rhmGeiMd}`,
  );

  // 4. success/release-heavy-benchmark.md has strategy-aware GEI Log Summary & Notes
  const rhmSuccessMd =
    results.files['success/release-heavy-benchmark.md'] ?? '';
  assert.ok(
    rhmSuccessMd.includes('`--skip-releases`'),
    `rhmSuccessMd missing --skip-releases: ${rhmSuccessMd}`,
  );
  assert.ok(
    rhmSuccessMd.includes('1 release and 1 release asset'),
    `rhmSuccessMd missing release counts: ${rhmSuccessMd}`,
  );

  // 5. success/chromium.md describes mirror-push transfer
  const chromiumSuccessMd = results.files['success/chromium.md'] ?? '';
  assert.ok(
    chromiumSuccessMd.includes('mirror-push'),
    `chromiumSuccessMd missing mirror-push: ${chromiumSuccessMd}`,
  );

  // 6. releases.md replaces "recreate oldest-first" with past-tense "Recreated release ..."
  const rhmReleasesMd =
    results.files['repositories/release-heavy-benchmark/releases.md'] ?? '';
  assert.ok(
    !rhmReleasesMd.includes('does not exist on target; recreate oldest-first.'),
    'rhmReleasesMd still has recreate oldest-first',
  );
  assert.ok(
    rhmReleasesMd.includes('Recreated release "v1.0.0" on target repository.'),
    `rhmReleasesMd missing Recreated release note: ${rhmReleasesMd}`,
  );

  // 7. repo-settings.md strips demogxp-mig4/ prefix and uses past-tense "Updated repository settings..."
  const rhmSettingsMd =
    results.files['repositories/release-heavy-benchmark/repo-settings.md'] ??
    '';
  assert.ok(
    rhmSettingsMd.includes(
      '| `release-heavy-benchmark` | `repository-settings` | `update` |',
    ),
    `rhmSettingsMd missing stripped row: ${rhmSettingsMd}`,
  );
  assert.ok(
    !rhmSettingsMd.includes('`demogxp-mig4/release-heavy-benchmark`'),
    `rhmSettingsMd still has org prefix: ${rhmSettingsMd}`,
  );
  assert.ok(
    rhmSettingsMd.includes(
      'Updated repository settings (auto-merge, branch deletion, merge strategies) on target.',
    ),
    `rhmSettingsMd missing Updated note: ${rhmSettingsMd}`,
  );
});

test('generates POST-CARE-CHECKLIST.md, exports/*.csv, and evidence/*.json with 100% parity across discovery, dry-run plan, and live modes', () => {
  // 1. Standalone Discovery Mode
  const discoveryResults = generateMigrationResults({
    sourceOrg: 'src-org',
    targetOrg: 'dest-emu',
    executionMode: 'dry-run',
    operationalMode: 'discovery',
    discoveryBundle: {
      schemaVersion: '1.0.0',
      generatedAt: '2026-10-16T12:00:00Z',
      entities: [
        {
          kind: 'repository',
          id: 'repo:billing-api',
          name: 'billing-api',
        },
        {
          kind: 'configuration-metadata',
          id: 'secret:org:STRIPE_LIVE_KEY',
          name: 'STRIPE_LIVE_KEY',
          configurationKind: 'secret',
          level: 'organization',
          domain: 'actions',
          accessMode: 'write-only',
        },
        {
          kind: 'configuration-metadata',
          id: 'secret:repo:DB_PASS',
          name: 'DB_PASS',
          configurationKind: 'secret',
          level: 'repository',
          repositoryId: 'repo:billing-api',
          domain: 'dependabot',
          accessMode: 'write-only',
        },
      ],
    } as never,
    evidenceFiles: {
      'custom-scan-summary.json': '{"ok":true}\n',
    },
  });

  assert.ok(discoveryResults.files['POST-CARE-CHECKLIST.md']);
  assert.ok(discoveryResults.files['exports/post-care-items.csv']);
  assert.ok(discoveryResults.files['exports/secrets-to-populate.csv']);
  assert.ok(discoveryResults.files['exports/github-apps-reinstall.csv']);
  assert.ok(discoveryResults.files['exports/webhooks-reconfiguration.csv']);
  assert.ok(discoveryResults.files['exports/runners-registration.csv']);
  assert.ok(discoveryResults.files['exports/migration-operations-full.csv']);
  assert.ok(discoveryResults.files['evidence/discovery-bundle.json']);
  assert.ok(discoveryResults.files['evidence/custom-scan-summary.json']);

  const discoveryChecklist =
    discoveryResults.files['POST-CARE-CHECKLIST.md'] ?? '';
  assert.ok(
    discoveryChecklist.includes(
      'https://github.com/organizations/dest-emu/settings/secrets/actions/STRIPE_LIVE_KEY',
    ),
  );
  assert.ok(
    discoveryChecklist.includes(
      'https://github.com/dest-emu/billing-api/settings/secrets/dependabot/DB_PASS',
    ),
  );

  // 2. Standalone Plan / Dry-Run Mode (without executionReport)
  const planResults = generateMigrationResults({
    sourceOrg: 'src-org',
    targetOrg: 'dest-emu',
    executionMode: 'dry-run',
    operationalMode: 'dry-run',
    plan: {
      schemaVersion: '1.0.0',
      id: 'plan-standalone',
      createdAt: '2026-10-16T12:00:00Z',
      scopeName: 'plan-scope',
      modules: [
        {
          moduleId: 'org-secrets',
          targetIdentifier: 'dest-emu',
          scopeLevel: 'organization',
          operations: [
            {
              id: 'org-secret:create:SONAR_TOKEN',
              resourceType: 'org-secret',
              resourceName: 'actions:SONAR_TOKEN',
              operation: 'create',
              reason:
                'Create sealed empty placeholder for actions organization secret SONAR_TOKEN (visibility: all)',
              dependencies: [],
            },
          ],
          warnings: [],
        },
        {
          moduleId: 'repo-secrets',
          targetIdentifier: 'dest-emu/billing-api',
          scopeLevel: 'repository',
          operations: [
            {
              id: 'repo-secret:codespaces:CS_PAT',
              resourceType: 'repo-secret',
              resourceName: 'CS_PAT',
              operation: 'create',
              reason: 'Create codespaces secret placeholder',
              dependencies: [],
            },
          ],
          warnings: [],
        },
      ],
      executionOrder: ['org-secrets', 'repo-secrets'],
    },
  });

  assert.ok(planResults.files['POST-CARE-CHECKLIST.md']);
  assert.ok(planResults.files['organization/org-secrets.md']);
  assert.ok(planResults.files['repositories/billing-api/repo-secrets.md']);
  assert.ok(planResults.files['evidence/migration-plan.json']);

  const orgSecretsMd = planResults.files['organization/org-secrets.md'] ?? '';
  assert.ok(
    orgSecretsMd.includes(
      'https://github.com/organizations/dest-emu/settings/secrets/actions/SONAR_TOKEN',
    ),
  );
  const repoSecretsMd =
    planResults.files['repositories/billing-api/repo-secrets.md'] ?? '';
  assert.ok(
    repoSecretsMd.includes(
      'https://github.com/dest-emu/billing-api/settings/secrets/codespaces/CS_PAT',
    ),
  );
});
