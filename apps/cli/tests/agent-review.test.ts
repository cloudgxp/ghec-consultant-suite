import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type VerificationReport,
} from '@ghec/contracts';
import {
  parseAgentReviewOptions,
  generateRemediationPlan,
  formatRemediationMarkdown,
  executeAgentReviewCommand,
} from '../src/commands/agent-review.js';
import { runCli } from '../src/index.js';

describe('Task 035: Agentic Automation & Remediation Integration', () => {
  const sampleReport: VerificationReport = {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    reportId: 'verify-12345678',
    verifiedAt: new Date().toISOString(),
    scopeName: 'test-wave-scope',
    sourceOrg: 'corp-source',
    targetOrg: 'corp-target-emu',
    summary: {
      verifiedModuleCount: 1,
      unverifiedModuleCount: 3,
      discrepancyCount: 3,
    },
    modules: [
      {
        moduleId: 'repo-variables',
        verified: true,
        discrepancies: [],
      },
      {
        moduleId: 'repo-secrets',
        verified: false,
        discrepancies: [
          {
            resourceName: 'api-service/DEPLOY_KEY',
            expected: 'sha256:abcd',
            actual: null,
            message: 'Secret DEPLOY_KEY is missing on target repository.',
          },
        ],
      },
      {
        moduleId: 'releases',
        verified: false,
        discrepancies: [
          {
            resourceName: 'web-app/v1.0.0/build.tar.gz',
            expected: '10485760 bytes',
            actual: '0 bytes',
            message: 'Release binary asset missing on target repository.',
          },
        ],
      },
      {
        moduleId: 'rulesets',
        verified: false,
        discrepancies: [
          {
            resourceName: 'api-service/main-branch-protection',
            expected: 'enforced',
            actual: 'disabled',
            message: 'Ruleset is disabled on target.',
          },
        ],
      },
    ],
  };

  it('parses agent-review command options and rejects missing report', () => {
    assert.throws(() => {
      parseAgentReviewOptions([]);
    }, /The --report <file> flag is required/);

    const parsed = parseAgentReviewOptions([
      '--report',
      './test-report.json',
      '--spec',
      './spec.md',
      '--output',
      './out.json',
      '--output-markdown',
      './out.md',
    ]);

    assert.equal(parsed.reportPath, './test-report.json');
    assert.equal(parsed.specPath, './spec.md');
    assert.equal(parsed.outputPath, './out.json');
    assert.equal(parsed.outputMarkdownPath, './out.md');
  });

  it('generates structured remediation plan from verification discrepancies', () => {
    const plan = generateRemediationPlan(sampleReport);

    assert.equal(plan.reportId, 'verify-12345678');
    assert.equal(plan.targetOrg, 'corp-target-emu');
    assert.equal(plan.actionableCount, 3);
    assert.equal(plan.actions.length, 3);

    const secretAction = plan.actions.find(
      (a) => a.moduleId === 'repo-secrets',
    );
    assert.ok(secretAction);
    assert.equal(secretAction.severity, 'critical');
    assert.match(secretAction.command, /gh secret set/);

    const releaseAction = plan.actions.find((a) => a.moduleId === 'releases');
    assert.ok(releaseAction);
    assert.equal(releaseAction.severity, 'high');
    assert.match(releaseAction.command, /migrate --modules releases/);

    const ruleAction = plan.actions.find((a) => a.moduleId === 'rulesets');
    assert.ok(ruleAction);
    assert.equal(ruleAction.severity, 'high');
    assert.match(ruleAction.command, /migrate --modules "rulesets"/);

    assert.match(plan.script, /#!/);
    assert.match(plan.script, /gh secret set/);
  });

  it('formats remediation markdown report with summary and script block', () => {
    const plan = generateRemediationPlan(sampleReport);
    const md = formatRemediationMarkdown(plan);

    assert.match(md, /## 🤖 Agentic Remediation Plan/);
    assert.match(md, /corp-target-emu/);
    assert.match(md, /🔴 Critical/);
    assert.match(md, /```bash/);
    assert.match(md, /gh secret set/);
  });

  it('executes agent-review command end-to-end and writes JSON and Markdown files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-review-test-'));
    try {
      const reportPath = join(dir, 'verification-report.json');
      const jsonOutPath = join(dir, 'remediation-plan.json');
      const mdOutPath = join(dir, 'remediation-plan.md');

      writeFileSync(reportPath, JSON.stringify(sampleReport, null, 2));

      const res = await executeAgentReviewCommand({
        reportPath,
        outputPath: jsonOutPath,
        outputMarkdownPath: mdOutPath,
        appendStepSummary: false,
      });

      assert.equal(res.plan.actionableCount, 3);
      assert.equal(res.jsonPath, jsonOutPath);
      assert.equal(res.markdownPath, mdOutPath);

      const writtenJson = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      assert.equal(writtenJson.actionableCount, 3);

      const writtenMd = readFileSync(mdOutPath, 'utf8');
      assert.match(writtenMd, /Agentic Remediation Plan/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('invokes agent-review via runCli entrypoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-review-cli-'));
    const originalLog = console.log;
    const originalError = console.error;
    const stdout: string[] = [];

    try {
      console.log = (...values: unknown[]) => stdout.push(values.join(' '));
      console.error = (...values: unknown[]) => stdout.push(values.join(' '));

      const reportPath = join(dir, 'verification-report.json');
      const jsonOutPath = join(dir, 'remediation-plan.json');
      const mdOutPath = join(dir, 'remediation-plan.md');

      writeFileSync(reportPath, JSON.stringify(sampleReport, null, 2));

      const exitCode = await runCli([
        'agent-review',
        '--report',
        reportPath,
        '--output',
        jsonOutPath,
        '--output-markdown',
        mdOutPath,
        '--append-step-summary',
      ]);

      assert.equal(exitCode, 0);
      assert.match(stdout.join('\n'), /Agentic remediation plan generated/);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
