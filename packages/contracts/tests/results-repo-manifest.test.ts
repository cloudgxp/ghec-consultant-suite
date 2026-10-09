import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type MigrationResultsManifest,
  validateMigrationResultsManifest,
} from '../src/index.js';

const validManifest: MigrationResultsManifest = {
  schemaVersion: '1.0.0',
  runId: 'run-20261008-001',
  generatedAt: '2026-10-08T12:00:00Z',
  sourceOrg: 'octocat-source',
  targetOrg: 'octocat-target-emu',
  targetResultsRepo: 'gei-migration-results',
  executionMode: 'live',
  summary: {
    totalRepositories: 2,
    succeededCount: 1,
    failedCount: 1,
    successRatePercent: 50,
    durationMs: 45000,
    orgModulesSummary: {
      teams: {
        status: 'complete',
        totalOperations: 5,
        succeededOperations: 5,
        failedOperations: 0,
        skippedOperations: 0,
        durationMs: 1200,
      },
      'actions-secrets': {
        status: 'complete',
        totalOperations: 3,
        succeededOperations: 3,
        failedOperations: 0,
        skippedOperations: 0,
        durationMs: 800,
      },
    },
  },
  repositories: [
    {
      sourceRepo: 'frontend-app',
      targetRepo: 'frontend-app',
      status: 'succeeded',
      relativeFilePath: 'success/frontend-app.md',
      durationMs: 25000,
      stagesRun: ['preflight', 'gei', 'variables', 'rulesets'],
      verified: true,
      discrepancyCount: 0,
      warnings: [],
    },
    {
      sourceRepo: 'backend-api',
      targetRepo: 'backend-api',
      status: 'failed',
      relativeFilePath: 'failure/backend-api.md',
      durationMs: 20000,
      stagesRun: ['preflight', 'gei'],
      verified: false,
      discrepancyCount: 2,
      failureReason: 'GEI transfer failed with HTTP 502',
      failedStage: 'gei',
      failedMetadataCategories: ['rulesets'],
      warnings: ['Archive size exceeded warning threshold'],
      remediationCommands: [
        'gh gei migrate-repo --source-repo octocat-source/backend-api',
      ],
    },
  ],
};

test('valid migration results manifest is accepted', () => {
  const result = validateMigrationResultsManifest(validManifest);
  assert.equal(result.success, true);
});

test('manifest rejects invalid schema version', () => {
  const invalid = { ...validManifest, schemaVersion: '2.0.0' };
  const result = validateMigrationResultsManifest(invalid);
  assert.equal(result.success, false);
});

test('manifest rejects mismatched repository counts', () => {
  const invalid = {
    ...validManifest,
    summary: {
      ...validManifest.summary,
      totalRepositories: 3,
    },
  };
  const result = validateMigrationResultsManifest(invalid);
  assert.equal(result.success, false);
});

test('manifest rejects inconsistent succeeded and failed counts', () => {
  const invalid = {
    ...validManifest,
    summary: {
      ...validManifest.summary,
      succeededCount: 2,
      failedCount: 0,
    },
  };
  const result = validateMigrationResultsManifest(invalid);
  assert.equal(result.success, false);
});

test('manifest rejects mismatched successRatePercent', () => {
  const invalid = {
    ...validManifest,
    summary: {
      ...validManifest.summary,
      successRatePercent: 99.9,
    },
  };
  const result = validateMigrationResultsManifest(invalid);
  assert.equal(result.success, false);
});

test('manifest rejects duplicate target repositories', () => {
  const invalid = {
    ...validManifest,
    repositories: [
      validManifest.repositories[0],
      {
        ...validManifest.repositories[1],
        targetRepo: 'frontend-app', // duplicate of first repo
      },
    ],
  };
  const result = validateMigrationResultsManifest(invalid);
  assert.equal(result.success, false);
});

test('succeeded repository record rejects failure fields and non-zero discrepancies', () => {
  // Succeeded with failureReason
  const withFailureReason = {
    ...validManifest,
    repositories: [
      {
        ...validManifest.repositories[0],
        failureReason: 'Something went wrong',
      },
      validManifest.repositories[1],
    ],
  };
  assert.equal(
    validateMigrationResultsManifest(withFailureReason).success,
    false,
  );

  // Succeeded with discrepancies > 0
  const withDiscrepancies = {
    ...validManifest,
    repositories: [
      {
        ...validManifest.repositories[0],
        discrepancyCount: 1,
      },
      validManifest.repositories[1],
    ],
  };
  assert.equal(
    validateMigrationResultsManifest(withDiscrepancies).success,
    false,
  );

  // Succeeded with verified: false
  const unverified = {
    ...validManifest,
    repositories: [
      {
        ...validManifest.repositories[0],
        verified: false,
      },
      validManifest.repositories[1],
    ],
  };
  assert.equal(validateMigrationResultsManifest(unverified).success, false);

  // Succeeded with invalid path (e.g. failure/ prefix)
  const invalidPath = {
    ...validManifest,
    repositories: [
      {
        ...validManifest.repositories[0],
        relativeFilePath: 'failure/frontend-app.md',
      },
      validManifest.repositories[1],
    ],
  };
  assert.equal(validateMigrationResultsManifest(invalidPath).success, false);
});

test('failed repository record requires failureReason and failure/ relative path', () => {
  // Failed missing failureReason
  const missingReason = {
    ...validManifest,
    repositories: [
      validManifest.repositories[0],
      {
        ...validManifest.repositories[1],
        failureReason: undefined,
      },
    ],
  };
  assert.equal(validateMigrationResultsManifest(missingReason).success, false);

  // Failed with success/ path
  const wrongPath = {
    ...validManifest,
    repositories: [
      validManifest.repositories[0],
      {
        ...validManifest.repositories[1],
        relativeFilePath: 'success/backend-api.md',
      },
    ],
  };
  assert.equal(validateMigrationResultsManifest(wrongPath).success, false);
});

test('handles 100% success and 0 repositories edge cases', () => {
  const allSucceeded: MigrationResultsManifest = {
    schemaVersion: '1.0.0',
    runId: 'run-success',
    generatedAt: '2026-10-08T12:00:00Z',
    sourceOrg: 'src-org',
    targetOrg: 'tgt-org',
    targetResultsRepo: 'gei-migration-results',
    executionMode: 'dry-run',
    summary: {
      totalRepositories: 1,
      succeededCount: 1,
      failedCount: 0,
      successRatePercent: 100,
      durationMs: 5000,
      orgModulesSummary: {},
    },
    repositories: [validManifest.repositories[0]],
  };
  assert.equal(validateMigrationResultsManifest(allSucceeded).success, true);

  const zeroRepos: MigrationResultsManifest = {
    schemaVersion: '1.0.0',
    runId: 'run-empty',
    generatedAt: '2026-10-08T12:00:00Z',
    sourceOrg: 'src-org',
    targetOrg: 'tgt-org',
    targetResultsRepo: 'gei-migration-results',
    executionMode: 'dry-run',
    summary: {
      totalRepositories: 0,
      succeededCount: 0,
      failedCount: 0,
      successRatePercent: 100,
      durationMs: 1000,
      orgModulesSummary: {},
    },
    repositories: [],
  };
  assert.equal(validateMigrationResultsManifest(zeroRepos).success, true);
});
