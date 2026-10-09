import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type {
  MigrationExecutionReport,
  MigrationResultsManifest,
  RepositoryMigrationRecord,
  VerificationReport,
} from '@ghec/contracts';
import {
  formatFailureRepoMarkdown,
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
