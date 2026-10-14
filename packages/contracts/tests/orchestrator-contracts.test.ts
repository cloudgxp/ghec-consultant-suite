import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORCHESTRATOR_SCHEMA_VERSION,
  validateCheckpointState,
  validateRemediationExecution,
  validateSlicerMatrix,
  validateTeardownManifest,
} from '../src/index.js';

describe('Orchestrator Contracts Validation', () => {
  describe('SlicerMatrix', () => {
    it('accepts valid slicer matrix output', () => {
      const parsed = validateSlicerMatrix({
        schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
        cohortCount: 2,
        matrix: {
          include: [
            {
              cohortId: 'cohort-standard-01',
              runnerLabels: ['ubuntu-latest'],
              repositories: ['repo-small-1', 'repo-small-2'],
              tier: 'standard',
              useGei: true,
              skipReleases: false,
              useReleaseFallback: false,
              useLfsStreamer: false,
              useMirrorPush: false,
              requiresHeadroomCheck: false,
              estimatedScratchBytes: 1048576,
            },
            {
              cohortId: 'cohort-massive-01',
              runnerLabels: ['self-hosted', 'high-disk'],
              repositories: ['repo-massive-40gb'],
              tier: 'massive-mirror',
              useGei: false,
              skipReleases: true,
              useReleaseFallback: false,
              useLfsStreamer: false,
              useMirrorPush: true,
              requiresHeadroomCheck: true,
              estimatedScratchBytes: 53687091200,
            },
          ],
        },
      });

      assert.equal(parsed.cohortCount, 2);
      assert.equal(parsed.matrix.include.length, 2);
      assert.equal(parsed.matrix.include[0].tier, 'standard');
      assert.equal(parsed.matrix.include[1].tier, 'massive-mirror');
      assert.equal(parsed.matrix.include[1].requiresHeadroomCheck, true);
    });

    it('rejects invalid schemaVersion or empty runnerLabels', () => {
      assert.throws(
        () =>
          validateSlicerMatrix({
            schemaVersion: '2.0.0',
            cohortCount: 1,
            matrix: {
              include: [
                {
                  cohortId: 'c1',
                  runnerLabels: ['ubuntu-latest'],
                  repositories: ['r1'],
                  tier: 'standard',
                },
              ],
            },
          }),
        /expected.*1\.0\.0/,
      );

      assert.throws(
        () =>
          validateSlicerMatrix({
            schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
            cohortCount: 1,
            matrix: {
              include: [
                {
                  cohortId: 'c1',
                  runnerLabels: [],
                  repositories: ['r1'],
                  tier: 'standard',
                },
              ],
            },
          }),
        /at least 1 element|too_small/,
      );
    });
  });

  describe('CheckpointState', () => {
    it('accepts valid checkpoint state', () => {
      const parsed = validateCheckpointState({
        schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
        cohortId: 'cohort-std-01',
        moduleId: 'gei-repo',
        stage: 'apply',
        status: 'completed',
        updatedAt: '2026-10-14T12:00:00.000Z',
        resumptionToken: 'tok-123',
        metrics: {
          reposTransferred: 5,
          bytesMoved: 1024000,
        },
      });

      assert.equal(parsed.cohortId, 'cohort-std-01');
      assert.equal(parsed.stage, 'apply');
      assert.equal(parsed.status, 'completed');
      assert.equal(parsed.metrics?.reposTransferred, 5);
    });

    it('rejects invalid stage or status', () => {
      assert.throws(
        () =>
          validateCheckpointState({
            schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
            cohortId: 'cohort-std-01',
            moduleId: 'gei-repo',
            stage: 'invalid_stage',
            status: 'completed',
            updatedAt: '2026-10-14T12:00:00.000Z',
          }),
        /expected one of/,
      );
    });
  });

  describe('RemediationExecution', () => {
    it('accepts valid remediation execution outcome', () => {
      const parsed = validateRemediationExecution({
        schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
        planId: 'plan-uuid-001',
        round: 1,
        executedAt: '2026-10-14T12:30:00.000Z',
        dryRun: false,
        totalActions: 2,
        successfulActions: 2,
        failedActions: 0,
        actionResults: [
          {
            actionId: 'ACT-001',
            moduleId: 'repo-secrets',
            resourceName: 'CI_SECRET_PLACEHOLDER',
            status: 'succeeded',
            durationMs: 120,
          },
          {
            actionId: 'ACT-002',
            moduleId: 'webhooks',
            resourceName: 'deploy-hook',
            status: 'succeeded',
            durationMs: 80,
          },
        ],
        preRemediationDiscrepancies: 2,
        postRemediationDiscrepancies: 0,
        resolvedDiscrepancies: 2,
        remainingDiscrepancies: 0,
      });

      assert.equal(parsed.round, 1);
      assert.equal(parsed.totalActions, 2);
      assert.equal(parsed.successfulActions, 2);
      assert.equal(parsed.postRemediationDiscrepancies, 0);
    });

    it('rejects round < 1', () => {
      assert.throws(
        () =>
          validateRemediationExecution({
            schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
            planId: 'plan-uuid-001',
            round: 0,
            executedAt: '2026-10-14T12:30:00.000Z',
            totalActions: 0,
            successfulActions: 0,
            failedActions: 0,
            preRemediationDiscrepancies: 0,
            postRemediationDiscrepancies: 0,
            resolvedDiscrepancies: 0,
            remainingDiscrepancies: 0,
          }),
        /expected number to be >=1|too_small/,
      );
    });
  });

  describe('TeardownManifest', () => {
    it('accepts valid teardown manifest', () => {
      const parsed = validateTeardownManifest({
        schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
        targetOrg: 'mig-target-test',
        prefixFilter: 'dummy-',
        dryRun: false,
        discoveredAt: '2026-10-14T13:00:00.000Z',
        totalDiscovered: 3,
        totalPurged: 3,
        totalRetained: 10,
        targets: [
          {
            type: 'repository',
            identifier: 'dummy-repo-1',
            status: 'deleted',
          },
          {
            type: 'team',
            identifier: 'dummy-team-alpha',
            status: 'deleted',
          },
          {
            type: 'ruleset',
            identifier: '12345',
            status: 'deleted',
          },
        ],
      });

      assert.equal(parsed.targetOrg, 'mig-target-test');
      assert.equal(parsed.totalPurged, 3);
      assert.equal(parsed.targets.length, 3);
    });

    it('rejects prefix filter shorter than 3 characters', () => {
      assert.throws(
        () =>
          validateTeardownManifest({
            schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
            targetOrg: 'mig-target-test',
            prefixFilter: 'd-',
            dryRun: false,
            discoveredAt: '2026-10-14T13:00:00.000Z',
            totalDiscovered: 0,
            totalPurged: 0,
            totalRetained: 0,
          }),
        /prefixFilter must be at least 3 characters long/,
      );
    });
  });
});
