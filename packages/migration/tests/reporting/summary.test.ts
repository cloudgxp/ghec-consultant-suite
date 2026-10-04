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
});
