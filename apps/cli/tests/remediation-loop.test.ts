import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateRemediationPlan } from '../src/commands/agent-review.js';
import type { VerificationReport } from '@ghec/contracts';

describe('Closed-Loop Autonomous Self-Healing Remediation (US2)', () => {
  it('synthesizes actionable remediation plan from verification discrepancies', () => {
    const syntheticReport: VerificationReport = {
      schemaVersion: '1.0.0',
      reportId: 'rep-001',
      generatedAt: '2026-10-14T12:00:00.000Z',
      scopeName: 'wave-1',
      sourceOrg: 'src-org',
      targetOrg: 'tgt-org',
      verifiedAt: '2026-10-14T12:00:00.000Z',
      summary: {
        totalModules: 3,
        verifiedModules: 1,
        failedModules: 2,
        totalChecks: 10,
        passedChecks: 7,
        discrepancyCount: 3,
        criticalDiscrepancies: 1,
        warningDiscrepancies: 2,
        overallStatus: 'failed',
      },
      modules: [
        {
          moduleId: 'repo-secrets',
          moduleName: 'Repository Secrets',
          verified: false,
          checksRun: 3,
          passedChecks: 2,
          discrepancies: [
            {
              id: 'disc-1',
              resourceName: 'frontend/PROD_DEPLOY_KEY',
              message: 'Target repository secret missing',
              severity: 'critical',
              remediable: true,
            },
          ],
        },
        {
          moduleId: 'webhooks',
          moduleName: 'Webhooks',
          verified: false,
          checksRun: 4,
          passedChecks: 3,
          discrepancies: [
            {
              id: 'disc-2',
              resourceName: 'frontend/hook-1',
              message: 'Webhook disabled at target',
              severity: 'medium',
              remediable: true,
            },
          ],
        },
        {
          moduleId: 'org-settings',
          moduleName: 'Organization Settings',
          verified: true,
          checksRun: 3,
          passedChecks: 3,
          discrepancies: [],
        },
      ],
    };

    const plan = generateRemediationPlan(syntheticReport);

    assert.equal(plan.totalDiscrepancies, 3);
    assert.equal(plan.actionableCount, 2);
    assert.equal(plan.actions.length, 2);

    const secretAction = plan.actions.find(
      (a) => a.moduleId === 'repo-secrets',
    );
    assert.ok(secretAction);
    assert.equal(secretAction.category, 'secrets-and-variables');
    assert.match(secretAction.command, /printf "" \| gh secret set/);

    const webhookAction = plan.actions.find((a) => a.moduleId === 'webhooks');
    assert.ok(webhookAction);
    assert.equal(webhookAction.category, 'webhooks-and-integrations');
    assert.match(
      webhookAction.command,
      /ghec-consultant-cli migrate --modules webhooks/,
    );

    assert.match(plan.script, /#!/);
    assert.match(plan.script, /frontend\/PROD_DEPLOY_KEY/);
    assert.match(plan.script, /frontend\/hook-1/);
  });

  it('produces empty plan script when report has zero discrepancies', () => {
    const cleanReport: VerificationReport = {
      schemaVersion: '1.0.0',
      reportId: 'rep-clean',
      generatedAt: '2026-10-14T12:00:00.000Z',
      scopeName: 'wave-1',
      sourceOrg: 'src-org',
      targetOrg: 'tgt-org',
      verifiedAt: '2026-10-14T12:00:00.000Z',
      summary: {
        totalModules: 1,
        verifiedModules: 1,
        failedModules: 0,
        totalChecks: 5,
        passedChecks: 5,
        discrepancyCount: 0,
        criticalDiscrepancies: 0,
        warningDiscrepancies: 0,
        overallStatus: 'passed',
      },
      modules: [
        {
          moduleId: 'teams',
          moduleName: 'Teams',
          verified: true,
          checksRun: 5,
          passedChecks: 5,
          discrepancies: [],
        },
      ],
    };

    const plan = generateRemediationPlan(cleanReport);
    assert.equal(plan.actionableCount, 0);
    assert.match(plan.script, /Zero discrepancies detected/);
  });
});
