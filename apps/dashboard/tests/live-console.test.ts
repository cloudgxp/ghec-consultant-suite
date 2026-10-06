import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_LINEAR_STAGES,
  type PipelineStageInfo,
  type MatrixCohortJob,
  mergePipelineStages,
  aggregateCohortMetrics,
  detectTopology,
  formatResumeDispatchPayload,
  formatCancelRunUrl,
} from '../src/lib/execution-console.js';

describe('Task 040 (DASH-25): Live Execution Console & Resumption Manager', () => {
  describe('Linear Pipeline Stage Model', () => {
    it('defines exactly the 7 canonical sequential stages in correct dependency order', () => {
      assert.equal(CANONICAL_LINEAR_STAGES.length, 7);
      const stageIds = CANONICAL_LINEAR_STAGES.map((s) => s.id);
      assert.deepEqual(stageIds, [
        'preflight',
        'plan',
        'gei-repo',
        'releases-lfs',
        'rulesets-keys',
        'teams-collaborators',
        'verify',
      ]);
    });

    it('merges runtime stage execution telemetry into canonical sequence', () => {
      const runtimeStages: PipelineStageInfo[] = [
        {
          id: 'preflight',
          name: '1. Preflight Validation',
          status: 'completed',
          durationSeconds: 15,
          summary: 'All preflight checks green.',
        },
        {
          id: 'plan',
          name: '2. Migration Planning',
          status: 'completed',
          durationSeconds: 10,
        },
        {
          id: 'gei-repo',
          name: '3. GEI Repositories',
          status: 'failed',
          durationSeconds: 45,
          error: 'Rate limit encountered on repository migration endpoint.',
        },
      ];

      const merged = mergePipelineStages(runtimeStages);

      assert.equal(merged[0]?.status, 'completed');
      assert.equal(merged[0]?.durationSeconds, 15);
      assert.equal(merged[1]?.status, 'completed');
      assert.equal(merged[2]?.status, 'failed');
      assert.equal(
        merged[2]?.error,
        'Rate limit encountered on repository migration endpoint.',
      );
      assert.equal(merged[3]?.status, 'pending');
      assert.equal(merged[6]?.id, 'verify');
      assert.equal(merged[6]?.status, 'pending');
    });
  });

  describe('Parallel Matrix Cohort Telemetry Model', () => {
    it('aggregates cohort operations and tracks progress percentages', () => {
      const cohorts: MatrixCohortJob[] = [
        {
          id: 'cohort-1',
          name: 'Cohort 1: Core Tier',
          status: 'completed',
          repositoryCount: 5,
          currentStep: 'verify',
          elapsedSeconds: 120,
          progressPercent: 100,
          operations: { created: 10, updated: 5, noop: 25, failed: 0 },
        },
        {
          id: 'cohort-2',
          name: 'Cohort 2: Secondary Tier',
          status: 'in_progress',
          repositoryCount: 8,
          currentStep: 'releases-and-lfs',
          elapsedSeconds: 65,
          progressPercent: 55,
          operations: { created: 4, updated: 2, noop: 12, failed: 1 },
        },
      ];

      const metrics = aggregateCohortMetrics(cohorts);

      assert.equal(cohorts.length, 2);
      assert.equal(metrics.totalRepositories, 13);
      assert.equal(metrics.totalOperations.created, 14);
      assert.equal(metrics.totalOperations.updated, 7);
      assert.equal(metrics.totalOperations.noop, 37);
      assert.equal(metrics.totalOperations.failed, 1);
      assert.equal(metrics.overallProgressPercent, 78);
    });
  });

  describe('Resumption & Control Request Dispatching', () => {
    it('formats correct workflow dispatch payload for --resume latest', () => {
      const resumePayload = formatResumeDispatchPayload({
        sourceOrg: 'source-enterprise-org',
        resumeRef: 'latest',
        runnerLabels: 'ubuntu-latest',
      });

      assert.equal(resumePayload.owner, 'source-enterprise-org');
      assert.equal(resumePayload.repo, 'ghec-consultant-suite');
      assert.equal(resumePayload.ref, 'main');
      assert.equal(resumePayload.inputs.resume_ref, 'latest');
      assert.equal(resumePayload.inputs.runner_labels, 'ubuntu-latest');
    });

    it('formats cancel endpoint URL for active runs', () => {
      const cancelUrl = formatCancelRunUrl({
        runId: 12849102,
        owner: 'source-org',
        repo: 'ghec-consultant-suite',
      });

      assert.equal(
        cancelUrl,
        '/api/actions/runs/12849102/cancel?owner=source-org&repo=ghec-consultant-suite',
      );
    });

    it('correctly auto-detects topology from run data', () => {
      const matrixRun = {
        topology: 'matrix' as const,
        cohorts: [
          {
            id: 'cohort-1',
            name: 'Cohort 1',
            status: 'in_progress' as const,
            repositoryCount: 3,
          },
        ],
      };

      const linearRun = {
        topology: 'linear' as const,
        cohorts: [],
      };

      assert.equal(detectTopology(matrixRun, 'auto'), 'matrix');
      assert.equal(detectTopology(linearRun, 'auto'), 'linear');
      assert.equal(detectTopology(linearRun, 'matrix'), 'matrix');
    });
  });
});
