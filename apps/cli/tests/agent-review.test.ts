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

  it('generates fallback remediation commands for issues, pull-requests, repo-settings, and gei-repo metadata omissions', () => {
    const metadataReport: VerificationReport = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      reportId: 'verify-meta-001',
      verifiedAt: new Date().toISOString(),
      scopeName: 'cohort-alpha',
      sourceOrg: 'corp-src',
      targetOrg: 'corp-emu',
      summary: {
        verifiedModuleCount: 0,
        unverifiedModuleCount: 4,
        discrepancyCount: 6,
      },
      modules: [
        {
          moduleId: 'issues',
          verified: false,
          discrepancies: [
            {
              resourceName: 'web-frontend/issues',
              expected: '42 issues',
              actual: '0 issues',
              message: 'Target repository has no issues.',
            },
          ],
        },
        {
          moduleId: 'pull-requests',
          verified: false,
          discrepancies: [
            {
              resourceName: 'web-frontend/pull-requests',
              expected: '15 PRs',
              actual: '0 PRs',
              message: 'Target repository has no pull requests.',
            },
          ],
        },
        {
          moduleId: 'repo-settings',
          verified: false,
          discrepancies: [
            {
              resourceName: 'web-frontend/settings',
              expected: 'hasIssues: true',
              actual: 'hasIssues: false',
              message: 'Repository feature flag hasIssues drifted.',
            },
          ],
        },
        {
          moduleId: 'gei-repo',
          verified: false,
          discrepancies: [
            {
              resourceName: 'issues',
              expected: 10,
              actual: 0,
              message: 'GEI metadata migration omitted issues.',
            },
            {
              resourceName: 'pull-requests',
              expected: 5,
              actual: 0,
              message: 'GEI metadata migration omitted pull requests.',
            },
            {
              resourceName: 'releases',
              expected: '2 releases',
              actual: '0 releases',
              message: 'Release assets missing on target.',
            },
          ],
        },
      ],
    };

    const plan = generateRemediationPlan(metadataReport);
    assert.equal(plan.actionableCount, 6);

    const issuesActions = plan.actions.filter((a) => a.moduleId === 'issues');
    assert.equal(issuesActions.length, 2);
    for (const a of issuesActions) {
      assert.equal(a.category, 'metadata-and-content');
      assert.equal(a.severity, 'high');
      assert.match(
        a.command,
        /ghec-consultant-cli migrate --modules issues --scope "\.\/scopes\/cohort-alpha\.json"/,
      );
    }

    const prActions = plan.actions.filter(
      (a) => a.moduleId === 'pull-requests',
    );
    assert.equal(prActions.length, 2);
    for (const a of prActions) {
      assert.equal(a.category, 'metadata-and-content');
      assert.equal(a.severity, 'high');
      assert.match(
        a.command,
        /ghec-consultant-cli migrate --modules pull-requests --scope "\.\/scopes\/cohort-alpha\.json"/,
      );
    }

    const settingsAction = plan.actions.find(
      (a) => a.moduleId === 'repo-settings',
    );
    assert.ok(settingsAction);
    assert.equal(settingsAction.category, 'metadata-and-content');
    assert.match(
      settingsAction.command,
      /ghec-consultant-cli migrate --modules repo-settings --scope "\.\/scopes\/cohort-alpha\.json"/,
    );

    const releasesAction = plan.actions.find((a) => a.moduleId === 'releases');
    assert.ok(releasesAction);
    assert.equal(releasesAction.category, 'assets-and-storage');
    assert.match(
      releasesAction.command,
      /ghec-consultant-cli migrate --modules releases --scope "\.\/scopes\/cohort-alpha\.json"/,
    );

    // Verify script contains sequential fallback commands
    assert.match(plan.script, /ghec-consultant-cli migrate --modules issues/);
    assert.match(
      plan.script,
      /ghec-consultant-cli migrate --modules pull-requests/,
    );
    assert.match(
      plan.script,
      /ghec-consultant-cli migrate --modules repo-settings/,
    );
    assert.match(plan.script, /ghec-consultant-cli migrate --modules releases/);
  });
});
