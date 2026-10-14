import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VerificationReport } from '@ghec/contracts';

interface DiscrepancyDiff {
  readonly resolvedCount: number;
  readonly remainingCount: number;
  readonly resolvedIds: readonly string[];
  readonly remainingIds: readonly string[];
}

function computeDiscrepancyDiff(
  preReport: VerificationReport,
  postReport: VerificationReport,
): DiscrepancyDiff {
  const preIds = new Set<string>();
  for (const mod of preReport.modules) {
    for (const disc of mod.discrepancies) {
      preIds.add(`${mod.moduleId}:${disc.resourceName}`);
    }
  }

  const postIds = new Set<string>();
  for (const mod of postReport.modules) {
    for (const disc of mod.discrepancies) {
      postIds.add(`${mod.moduleId}:${disc.resourceName}`);
    }
  }

  const resolvedIds: string[] = [];
  for (const id of preIds) {
    if (!postIds.has(id)) {
      resolvedIds.push(id);
    }
  }

  const remainingIds = Array.from(postIds);

  return {
    resolvedCount: resolvedIds.length,
    remainingCount: remainingIds.length,
    resolvedIds,
    remainingIds,
  };
}

describe('Standalone Remediation Differential Assessment (US3)', () => {
  it('computes accurate resolution diff between pre and post verification reports', () => {
    const preReport: VerificationReport = {
      schemaVersion: '1.0.0',
      reportId: 'rep-pre',
      generatedAt: '2026-10-14T12:00:00.000Z',
      scopeName: 'wave-1',
      sourceOrg: 'src-org',
      targetOrg: 'tgt-org',
      verifiedAt: '2026-10-14T12:00:00.000Z',
      summary: {
        totalModules: 2,
        verifiedModules: 0,
        failedModules: 2,
        totalChecks: 6,
        passedChecks: 4,
        discrepancyCount: 2,
        criticalDiscrepancies: 1,
        warningDiscrepancies: 1,
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
              id: 'd1',
              resourceName: 'frontend/KEY',
              message: 'Missing',
              severity: 'critical',
              remediable: true,
            },
          ],
        },
        {
          moduleId: 'webhooks',
          moduleName: 'Webhooks',
          verified: false,
          checksRun: 3,
          passedChecks: 2,
          discrepancies: [
            {
              id: 'd2',
              resourceName: 'frontend/hook-1',
              message: 'Disabled',
              severity: 'medium',
              remediable: true,
            },
          ],
        },
      ],
    };

    const postReport: VerificationReport = {
      schemaVersion: '1.0.0',
      reportId: 'rep-post',
      generatedAt: '2026-10-14T12:15:00.000Z',
      scopeName: 'wave-1',
      sourceOrg: 'src-org',
      targetOrg: 'tgt-org',
      verifiedAt: '2026-10-14T12:15:00.000Z',
      summary: {
        totalModules: 2,
        verifiedModules: 1,
        failedModules: 1,
        totalChecks: 6,
        passedChecks: 5,
        discrepancyCount: 1,
        criticalDiscrepancies: 0,
        warningDiscrepancies: 1,
        overallStatus: 'failed',
      },
      modules: [
        {
          moduleId: 'repo-secrets',
          moduleName: 'Repository Secrets',
          verified: true,
          checksRun: 3,
          passedChecks: 3,
          discrepancies: [],
        },
        {
          moduleId: 'webhooks',
          moduleName: 'Webhooks',
          verified: false,
          checksRun: 3,
          passedChecks: 2,
          discrepancies: [
            {
              id: 'd2',
              resourceName: 'frontend/hook-1',
              message: 'Disabled',
              severity: 'medium',
              remediable: true,
            },
          ],
        },
      ],
    };

    const diff = computeDiscrepancyDiff(preReport, postReport);

    assert.equal(diff.resolvedCount, 1);
    assert.equal(diff.remainingCount, 1);
    assert.deepEqual(diff.resolvedIds, ['repo-secrets:frontend/KEY']);
    assert.deepEqual(diff.remainingIds, ['webhooks:frontend/hook-1']);
  });
});
