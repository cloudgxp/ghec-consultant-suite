import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sanitizeFormula,
  formatStepSummaryMarkdown,
  appendStepSummary,
  buildSummaryFromExecutionReport,
  buildSummaryFromVerification,
  writeJsonSummaryFile,
  readJsonSummaryFile,
  type MigrationRunSummary,
} from '../../src/index.js';
import type { MigrationExecutionReport } from '../../src/orchestrator/types.js';
import type { VerificationReport } from '@ghec/contracts';

describe('Reporting & Step Summary Subsystem', () => {
  describe('sanitizeFormula', () => {
    it('neutralizes formula injection triggers (=, +, -, @, \\t, \\r)', () => {
      assert.equal(sanitizeFormula('=1+2'), "'=1+2");
      assert.equal(sanitizeFormula('+cmd'), "'+cmd");
      assert.equal(sanitizeFormula('-100'), "'-100");
      assert.equal(sanitizeFormula('@import'), "'@import");
      assert.equal(sanitizeFormula('\tindented'), "'\tindented");
      assert.equal(sanitizeFormula('\r\nreturn'), "'\r\nreturn");
      assert.equal(sanitizeFormula('  =leading_spaces'), "'  =leading_spaces");
    });

    it('leaves safe strings untouched', () => {
      assert.equal(sanitizeFormula('normal-repo-name'), 'normal-repo-name');
      assert.equal(sanitizeFormula('user_login_123'), 'user_login_123');
      assert.equal(sanitizeFormula(''), '');
    });
  });

  describe('formatStepSummaryMarkdown', () => {
    const sampleSummary: MigrationRunSummary = {
      schemaVersion: '1.0.0',
      runId: 'run-20261004-test',
      startedAt: '2026-10-04T12:00:00.000Z',
      completedAt: '2026-10-04T12:05:00.000Z',
      durationMs: 300000,
      sourceOrg: '=malicious-source',
      targetOrg: 'target-enterprise',
      status: 'complete',
      dryRun: false,
      preflight: {
        totalRepositories: 10,
        ready: 8,
        readyWithFollowUp: 1,
        requiresSpecialStrategy: 1,
        blocked: 0,
        rulesetBypassExempt: true,
      },
      coreTransfer: {
        gei: {
          total: 10,
          succeeded: 10,
          failed: 0,
          skippedReleases: 1,
        },
        lfs: {
          repositoriesWithLfs: 2,
          objectsTransferred: 450,
          bytesTransferred: 1073741824, // 1 GiB
        },
        largeReleases: {
          repositoriesWithLargeReleases: 1,
          assetsStreamed: 4,
          bytesStreamed: 5368709120, // 5 GiB
        },
      },
      rehydration: {
        variables: { planned: 20, succeeded: 20, failed: 0 },
        secrets: { planned: 15, succeeded: 15, failed: 0 },
        environments: { planned: 3, succeeded: 3, failed: 0 },
        rulesets: { planned: 5, succeeded: 5, failed: 0 },
        branchProtection: { planned: 2, succeeded: 2, failed: 0 },
        teams: { planned: 8, succeeded: 8, failed: 0 },
      },
      postMigration: {
        mannequins: { total: 12, reclaimed: 10, unmapped: 2 },
        webhooks: { reEnabled: 6 },
      },
      verification: {
        verified: true,
        totalDiscrepancies: 0,
      },
      warnings: ['Reviewer user "contractor" could not be mapped to EMU.'],
      errors: [],
    };

    it('formats a comprehensive Markdown summary across all stages', () => {
      const markdown = formatStepSummaryMarkdown(sampleSummary);

      // Verify sections
      assert.ok(markdown.includes('## 🚀 Migration Execution Summary'));
      assert.ok(markdown.includes('**Run ID** | `run-20261004-test`'));
      assert.ok(markdown.includes('🟢 **Complete**'));
      assert.ok(markdown.includes('Stage 1: Preflight Assessment'));
      assert.ok(
        markdown.includes('Stage 2–4: Core Transfers & Fallback Strategies'),
      );
      assert.ok(markdown.includes('Stage 5: Configuration Rehydration'));
      assert.ok(markdown.includes('Stage 6: Post-Migration Reconciliations'));
      assert.ok(markdown.includes('Stage 7: Target State Verification'));
      assert.ok(markdown.includes('Verification Passed'));

      // Verify formula neutralization applied
      assert.ok(markdown.includes("`'=malicious-source`"));

      // Verify human-readable bytes
      assert.ok(markdown.includes('1 GiB'));
      assert.ok(markdown.includes('5 GiB'));
    });

    it('renders alert boxes for errors and discrepancies', () => {
      const failedSummary: MigrationRunSummary = {
        ...sampleSummary,
        status: 'failed',
        verification: {
          verified: false,
          totalDiscrepancies: 2,
          discrepancySummaries: [
            'Variable "PORT" missing on target',
            'Environment "prod" wait timer mismatch',
          ],
        },
        errors: ['Network failure during GEI transfer on repo-b'],
      };

      const markdown = formatStepSummaryMarkdown(failedSummary);
      assert.ok(markdown.includes('🔴 **Failed**'));
      assert.ok(markdown.includes('> [!WARNING]'));
      assert.ok(markdown.includes('Verification Discrepancies Detected (2)'));
      assert.ok(markdown.includes('> [!CAUTION]'));
      assert.ok(
        markdown.includes('Network failure during GEI transfer on repo-b'),
      );
    });
  });

  describe('appendStepSummary', () => {
    it('appends Markdown content to specified file path', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'step-summary-test-'));
      const summaryFile = join(tempDir, 'summary.md');
      writeFileSync(summaryFile, '# Initial Content\n', 'utf8');

      const success = appendStepSummary('## Appended Section', summaryFile);
      assert.equal(success, true);

      const content = readFileSync(summaryFile, 'utf8');
      assert.ok(content.includes('# Initial Content'));
      assert.ok(content.includes('## Appended Section'));

      rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns false when no file path is provided and env var is absent', () => {
      const originalEnv = process.env.GITHUB_STEP_SUMMARY;
      delete process.env.GITHUB_STEP_SUMMARY;

      try {
        const success = appendStepSummary('# Content without target');
        assert.equal(success, false);
      } finally {
        if (originalEnv) {
          process.env.GITHUB_STEP_SUMMARY = originalEnv;
        }
      }
    });
  });

  describe('buildSummaryFromExecutionReport', () => {
    it('constructs MigrationRunSummary from raw ExecutionReport', () => {
      const rawReport: MigrationExecutionReport = {
        schemaVersion: '1.0.0',
        planId: 'plan-1234',
        executedAt: '2026-10-04T10:00:00.000Z',
        status: 'complete',
        exitCode: 0,
        dryRun: false,
        results: [
          {
            schemaVersion: '1.0.0',
            moduleId: 'repo-variables',
            status: 'complete',
            results: [
              {
                operationId: 'op-1',
                status: 'succeeded',
                completedAt: '2026-10-04T10:01:00Z',
              },
              {
                operationId: 'op-2',
                status: 'succeeded',
                completedAt: '2026-10-04T10:01:00Z',
              },
            ],
            durationMs: 1200,
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'repo-secrets',
            status: 'partial',
            results: [
              {
                operationId: 'op-3',
                status: 'succeeded',
                completedAt: '2026-10-04T10:01:00Z',
              },
              {
                operationId: 'op-4',
                status: 'failed',
                error: 'Key expired',
                completedAt: '2026-10-04T10:01:00Z',
              },
            ],
            durationMs: 800,
          },
        ],
      };

      const summary = buildSummaryFromExecutionReport(rawReport, {
        sourceOrg: 'source-org',
        targetOrg: 'target-org',
      });

      assert.equal(summary.runId, 'plan-1234');
      assert.equal(summary.sourceOrg, 'source-org');
      assert.equal(summary.targetOrg, 'target-org');
      assert.equal(summary.status, 'complete');
      assert.equal(summary.durationMs, 2000);
      assert.equal(summary.rehydration?.variables?.succeeded, 2);
      assert.equal(summary.rehydration?.secrets?.failed, 1);
      assert.equal(summary.errors.length, 1);
      assert.ok(summary.errors[0]?.includes('[repo-secrets] Key expired'));
    });

    it('extracts failedMetadataCategories and recommendations into summary', () => {
      const reportWithMetadataFailure: MigrationExecutionReport = {
        schemaVersion: '1.0.0',
        planId: 'plan-meta-1',
        executedAt: '2026-10-04T10:00:00Z',
        dryRun: false,
        status: 'partial',
        exitCode: 4,
        recommendations: [
          "GEI omitted issues metadata for my-repo. Recommended fallback module: 'issues'.",
        ],
        results: [
          {
            schemaVersion: '1.0.0',
            moduleId: 'gei-repo',
            status: 'partial',
            failedMetadataCategories: ['issues', 'pull-requests'],
            results: [
              {
                operationId: 'gei-op-1',
                status: 'succeeded',
                completedAt: '2026-10-04T10:01:00Z',
              },
            ],
            durationMs: 5000,
          },
        ],
      };

      const summary = buildSummaryFromExecutionReport(
        reportWithMetadataFailure,
        {
          sourceOrg: 'src-org',
          targetOrg: 'tgt-org',
        },
      );

      assert.ok(summary.metadataFailures);
      assert.equal(summary.metadataFailures.length, 1);
      assert.deepEqual(summary.metadataFailures[0]?.categories, [
        'issues',
        'pull-requests',
      ]);
      assert.ok(
        summary.metadataFailures[0]?.fallbackCommands.some((c) =>
          c.includes('--modules issues'),
        ),
      );
      assert.ok(
        summary.warnings.some((w) => w.includes('GEI omitted issues metadata')),
      );

      const markdown = formatStepSummaryMarkdown(summary);
      assert.ok(markdown.includes('GEI Metadata Drop & Fallback Remediation'));
      assert.ok(
        markdown.includes('Omitted categories: `issues`, `pull-requests`'),
      );
      assert.ok(
        markdown.includes('ghec-consultant-cli migrate --modules issues'),
      );
    });
  });

  describe('buildSummaryFromVerification', () => {
    it('constructs MigrationRunSummary from VerificationReport', () => {
      const vReport: VerificationReport = {
        schemaVersion: '1.0.0',
        reportId: 'verify-1234',
        scopeName: 'test-scope',
        sourceOrg: 'source-default',
        targetOrg: 'target-default',
        verifiedAt: '2026-10-04T11:00:00.000Z',
        summary: {
          verifiedModuleCount: 0,
          unverifiedModuleCount: 1,
          discrepancyCount: 1,
        },
        modules: [
          {
            moduleId: 'repo-variables',
            verified: false,
            discrepancies: [
              {
                resourceName: 'NEW_VAR',
                expected: 'prod',
                actual: 'dev',
                message: 'Value mismatch',
              },
            ],
          },
        ],
      };

      const summary = buildSummaryFromVerification(vReport, {
        sourceOrg: 'source-corp',
        targetOrg: 'target-corp',
      });

      assert.equal(summary.runId, 'verify-1234');
      assert.equal(summary.sourceOrg, 'source-corp');
      assert.equal(summary.targetOrg, 'target-corp');
      assert.equal(summary.status, 'failed');
      assert.equal(summary.verification?.verified, false);
      assert.equal(summary.verification?.totalDiscrepancies, 1);
      assert.ok(
        summary.verification?.discrepancySummaries?.[0]?.includes('NEW_VAR'),
      );
    });
  });

  describe('writeJsonSummaryFile & readJsonSummaryFile', () => {
    it('writes and reads JSON summary file accurately', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'json-summary-test-'));
      const outputPath = join(tempDir, 'nested', 'summary.json');

      const sample: MigrationRunSummary = {
        schemaVersion: '1.0.0',
        runId: 'json-run-1',
        startedAt: '2026-10-04T12:00:00Z',
        completedAt: '2026-10-04T12:01:00Z',
        durationMs: 60000,
        sourceOrg: 'source',
        targetOrg: 'target',
        status: 'complete',
        dryRun: false,
        warnings: [],
        errors: [],
      };

      writeJsonSummaryFile(sample, outputPath);
      const readBack = readJsonSummaryFile(outputPath);

      assert.deepEqual(readBack, sample);
      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('Phase 7: 32-Module Attribution & Un-Truncated Step Summaries', () => {
    it('prefixes errors with [<moduleId> @ <targetIdentifier>], maps lfs module, and accumulates multi-repo counts', () => {
      const report: MigrationExecutionReport = {
        schemaVersion: '1.0.0',
        planId: 'plan-multi-repo',
        executedAt: '2026-10-15T00:00:00.000Z',
        status: 'partial',
        exitCode: 1,
        dryRun: false,
        results: [
          {
            schemaVersion: '1.0.0',
            moduleId: 'lfs',
            targetIdentifier: 'target-org/repo-a',
            status: 'complete',
            durationMs: 500,
            results: [
              {
                operationId: 'lfs-1',
                status: 'succeeded',
                completedAt: '2026-10-15T00:00:01.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'rulesets',
            targetIdentifier: 'target-org/repo-a',
            status: 'complete',
            durationMs: 200,
            results: [
              {
                operationId: 'rs-a1',
                status: 'succeeded',
                completedAt: '2026-10-15T00:00:02.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'rulesets',
            targetIdentifier: 'target-org/repo-b',
            status: 'failed',
            durationMs: 300,
            results: [
              {
                operationId: 'rs-b1',
                status: 'failed',
                error: 'HTTP 422 Unprocessable Entity: ruleset name conflict',
                completedAt: '2026-10-15T00:00:03.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'issues',
            targetIdentifier: 'target-org/repo-b',
            status: 'complete',
            durationMs: 400,
            results: [
              {
                operationId: 'iss-1',
                status: 'succeeded',
                completedAt: '2026-10-15T00:00:04.000Z',
              },
              {
                operationId: 'iss-2',
                status: 'succeeded',
                completedAt: '2026-10-15T00:00:04.000Z',
              },
            ],
          },
        ],
      };

      const summary = buildSummaryFromExecutionReport(report, {
        sourceOrg: 'source-org',
        targetOrg: 'target-org',
      });

      assert.equal(summary.coreTransfer?.lfs?.repositoriesWithLfs, 1);
      assert.deepEqual(summary.rehydration?.rulesets, {
        planned: 2,
        succeeded: 1,
        failed: 1,
      });
      assert.deepEqual(summary.rehydration?.issues, {
        planned: 2,
        succeeded: 2,
        failed: 0,
      });
      assert.deepEqual(summary.moduleBreakdown?.['rulesets'], {
        planned: 2,
        succeeded: 1,
        failed: 1,
      });
      assert.equal(summary.errors.length, 1);
      assert.equal(
        summary.errors[0],
        '[rulesets @ target-org/repo-b] HTTP 422 Unprocessable Entity: ruleset name conflict',
      );
    });

    it('accurately counts gei-repo existing targets, LFS objects/bytes, org-rulesets, org-webhooks, and post-migration-codeowners', () => {
      const report: MigrationExecutionReport = {
        schemaVersion: '1.0.0',
        planId: 'plan-step-summary-accuracy',
        executedAt: '2026-10-15T18:30:00.000Z',
        status: 'complete',
        exitCode: 0,
        dryRun: false,
        results: [
          {
            schemaVersion: '1.0.0',
            moduleId: 'gei-repo',
            targetIdentifier: 'demogxp-mig2/demo',
            scopeLevel: 'repository',
            status: 'complete',
            durationMs: 100,
            results: [],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'lfs',
            targetIdentifier: 'demogxp-mig2/dummy-repo-private-lfs',
            scopeLevel: 'repository',
            status: 'complete',
            durationMs: 250,
            results: [
              {
                operationId: 'lfs:noop:dummy-repo-private-lfs:a.bin',
                status: 'succeeded',
                reason:
                  'Git-tracked LFS binary blob a.bin (5242880 bytes) verified on target.',
                completedAt: '2026-10-15T18:31:10.000Z',
              },
              {
                operationId: 'lfs:noop:dummy-repo-private-lfs:b.bin',
                status: 'succeeded',
                reason:
                  'Git-tracked LFS binary blob b.bin (10485760 bytes) verified on target.',
                completedAt: '2026-10-15T18:31:12.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'org-rulesets',
            targetIdentifier: 'demogxp-mig2',
            scopeLevel: 'organization',
            status: 'complete',
            durationMs: 80,
            results: [
              {
                operationId: 'ruleset:create-org:demogxp-mig2:org-rule-1',
                status: 'succeeded',
                completedAt: '2026-10-15T18:32:00.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'org-webhooks',
            targetIdentifier: 'demogxp-mig2',
            scopeLevel: 'organization',
            status: 'complete',
            durationMs: 60,
            results: [
              {
                operationId: 'org-webhook:create:1',
                status: 'succeeded',
                completedAt: '2026-10-15T18:32:05.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'post-migration-codeowners',
            targetIdentifier: 'demogxp-mig2/demo',
            scopeLevel: 'repository',
            status: 'complete',
            durationMs: 40,
            results: [
              {
                operationId: 'codeowners:noop:.github/CODEOWNERS',
                status: 'succeeded',
                resourceType: 'codeowners-file',
                resourceName: '.github/CODEOWNERS',
                operationType: 'noop',
                completedAt: '2026-10-15T18:31:20.000Z',
              },
              {
                operationId: 'codeowners:noop:.github/workflows/build.yml',
                status: 'succeeded',
                resourceType: 'codeowners-file',
                resourceName: '.github/workflows/build.yml',
                operationType: 'noop',
                completedAt: '2026-10-15T18:31:20.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'releases',
            targetIdentifier: 'demogxp-mig2/release-heavy-benchmark',
            scopeLevel: 'repository',
            status: 'complete',
            durationMs: 1200,
            results: [
              {
                operationId: 'release:release-heavy-benchmark:v1.0.0',
                status: 'succeeded',
                resourceType: 'release',
                resourceName: 'v1.0.0',
                operationType: 'create',
                reason: 'Created release "v1.0.0" on target repository.',
                completedAt: '2026-10-15T18:31:30.000Z',
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
                completedAt: '2026-10-15T18:31:40.000Z',
              },
              {
                operationId:
                  'release-asset:release-heavy-benchmark:v1.0.0:engine.tar.gz.sha256',
                status: 'succeeded',
                resourceType: 'release-asset',
                resourceName: 'v1.0.0/engine.tar.gz.sha256',
                operationType: 'create',
                reason:
                  'Streamed release asset "engine.tar.gz.sha256" (94 bytes) to release "v1.0.0".',
                completedAt: '2026-10-15T18:31:41.000Z',
              },
            ],
          },
        ],
      };

      const summary = buildSummaryFromExecutionReport(report, {
        sourceOrg: 'demogxp',
        targetOrg: 'demogxp-mig2',
      });

      assert.equal(summary.completedAt, '2026-10-15T18:32:05.000Z');
      assert.deepEqual(summary.coreTransfer?.gei, {
        total: 1,
        succeeded: 1,
        failed: 0,
        skippedReleases: 0,
      });
      assert.deepEqual(summary.coreTransfer?.lfs, {
        repositoriesWithLfs: 1,
        objectsTransferred: 2,
        bytesTransferred: 15728640,
      });
      assert.deepEqual(summary.coreTransfer?.largeReleases, {
        repositoriesWithLargeReleases: 1,
        assetsStreamed: 2,
        bytesStreamed: 1073741918,
      });
      assert.deepEqual(summary.rehydration?.orgRulesets, {
        planned: 1,
        succeeded: 1,
        failed: 0,
      });
      assert.deepEqual(summary.rehydration?.codeowners, {
        planned: 1,
        succeeded: 1,
        failed: 0,
      });
      assert.deepEqual(summary.postMigration?.webhooks, {
        reEnabled: 1,
      });
    });

    it('renders collapsible <details> block when errors, warnings, or discrepancies exceed 10 items', () => {
      const manyErrors = Array.from(
        { length: 15 },
        (_, i) => `[rulesets @ target-org/repo-${i + 1}] Error #${i + 1}`,
      );
      const manyDiscrepancies = Array.from(
        { length: 12 },
        (_, i) => `[repo-variables] repo-${i + 1}:VAR_${i + 1} missing`,
      );

      const summary: MigrationRunSummary = {
        schemaVersion: '1.0.0',
        runId: 'run-many-errors',
        startedAt: '2026-10-15T00:00:00.000Z',
        completedAt: '2026-10-15T00:01:00.000Z',
        durationMs: 60000,
        sourceOrg: 'source-org',
        targetOrg: 'target-org',
        status: 'failed',
        dryRun: false,
        verification: {
          verified: false,
          totalDiscrepancies: 12,
          discrepancySummaries: manyDiscrepancies,
        },
        warnings: [],
        errors: manyErrors,
      };

      const markdown = formatStepSummaryMarkdown(summary);
      assert.ok(
        markdown.includes(
          '<details><summary>Full Diagnostic Error List (15 total)</summary>',
        ),
      );
      assert.ok(
        markdown.includes('[rulesets @ target-org/repo-15] Error #15'),
        '15th error should be present in collapsible details block',
      );
      assert.ok(
        markdown.includes(
          '<details><summary>Full Verification Discrepancy List (12 total)</summary>',
        ),
      );
      assert.ok(
        markdown.includes('[repo-variables] repo-12:VAR_12 missing'),
        '12th discrepancy should be present in collapsible details block',
      );
    });

    it('ensures startedAt <= completedAt when executedAt >= latestOpCompletedAt, counts skippedReleases, suppresses healed failedMetadataCategories, and renders Organization Rulesets', () => {
      const report: MigrationExecutionReport = {
        schemaVersion: '1.0.0',
        planId: 'plan-healed-releases',
        executedAt: '2026-10-16T08:06:16.533Z',
        status: 'complete',
        exitCode: 0,
        dryRun: false,
        results: [
          {
            schemaVersion: '1.0.0',
            moduleId: 'gei-repo',
            targetIdentifier: 'demogxp-mig4/release-heavy-benchmark',
            scopeLevel: 'repository',
            status: 'complete',
            durationMs: 120000,
            failedMetadataCategories: ['releases'],
            recommendations: [
              'Run `ghec-consultant-cli migrate --modules releases --scope <scope.json>` to rehydrate releases and binary assets via streaming REST fallback.',
            ],
            results: [
              {
                operationId: 'gei-repo-migration-release-heavy-benchmark',
                status: 'succeeded',
                resourceType: 'repository',
                resourceName: 'release-heavy-benchmark',
                operationType: 'create',
                completedAt: '2026-10-16T07:57:40.000Z',
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
                completedAt: '2026-10-16T08:05:00.000Z',
              },
            ],
          },
          {
            schemaVersion: '1.0.0',
            moduleId: 'org-rulesets',
            targetIdentifier: 'demogxp-mig4',
            scopeLevel: 'organization',
            status: 'complete',
            durationMs: 5000,
            results: [
              {
                operationId: 'ruleset:create-org:demogxp-mig4:demo-ruleset',
                status: 'succeeded',
                resourceType: 'ruleset',
                resourceName: 'demo-ruleset',
                operationType: 'create',
                completedAt: '2026-10-16T08:06:10.000Z',
              },
            ],
          },
        ],
      };

      const summary = buildSummaryFromExecutionReport(report, {
        sourceOrg: 'demogxp',
        targetOrg: 'demogxp-mig4',
      });

      assert.ok(
        Date.parse(summary.startedAt) <= Date.parse(summary.completedAt),
        `Expected startedAt (${summary.startedAt}) <= completedAt (${summary.completedAt})`,
      );
      assert.equal(summary.completedAt, '2026-10-16T08:06:16.533Z');
      assert.equal(summary.coreTransfer?.gei?.skippedReleases, 1);
      assert.equal(summary.failedMetadataCategories, undefined);
      assert.equal(summary.recommendations, undefined);
      assert.deepEqual(summary.rehydration?.orgRulesets, {
        planned: 1,
        succeeded: 1,
        failed: 0,
      });

      const stepMd = formatStepSummaryMarkdown(summary);
      assert.ok(
        stepMd.includes('| **Organization Rulesets** | 1 | 1 | 0 |'),
        'Expected Organization Rulesets row in Step Summary',
      );
    });
  });
});
