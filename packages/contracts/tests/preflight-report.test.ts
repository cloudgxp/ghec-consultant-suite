import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePreflightReport } from '../src/index.js';

const report = {
  schemaVersion: '1.0.0',
  reportId: 'preflight-001',
  evaluatedAt: '2026-10-04T12:00:00Z',
  sourceOrg: 'acme-engineering',
  targetOrg: 'contoso-engineering',
  repositoryAssessments: [
    {
      repo: 'api',
      gitSizeBytes: 100,
      largestCommitBytes: 20,
      largestBlobBytes: 10,
      longestRefLength: 18,
      lfsObjectCount: 3,
      lfsTotalBytes: 40,
      releaseCount: 1,
      releaseTotalAssetBytes: 50,
      status: 'ready-with-follow-up',
      blockers: ['Git LFS objects require a dual-remote push.'],
    },
  ],
  destinationAssessments: [
    {
      rulesetBypassConfigured: true,
      ipAllowListReachable: true,
      ghasEnabled: true,
      nameConflicts: [],
    },
  ],
};

test('preflight report accepts measured repository and destination assessments', () => {
  assert.equal(validatePreflightReport(report).success, true);
});

test('preflight report rejects malformed metrics and duplicate assessments', () => {
  assert.equal(
    validatePreflightReport({
      ...report,
      repositoryAssessments: [
        { ...report.repositoryAssessments[0], gitSizeBytes: -1 },
      ],
    }).success,
    false,
  );
  assert.equal(
    validatePreflightReport({
      ...report,
      repositoryAssessments: [
        report.repositoryAssessments[0],
        report.repositoryAssessments[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    validatePreflightReport({ ...report, schemaVersion: '2.0.0' }).success,
    false,
  );
});
