import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import {
  GitHubActionsService,
  unpackArtifactZipBuffer,
} from '../src/actions/index.js';

describe('Task 037: GitHub Actions Client Service Adapter', () => {
  const owner = 'test-org';
  const repo = 'test-migration-repo';
  const token = 'ghp_mock_token_12345';

  describe('unpackArtifactZipBuffer', () => {
    it('correctly unpacks JSON files from an in-memory ZIP buffer', () => {
      const plan = { planId: 'plan-xyz', summary: { create: 5, update: 1 } };
      const verification = { verifiedModuleCount: 17, discrepancyCount: 0 };
      const cohort1 = { cohortId: 'cohort-1', processed: 10 };
      const preflight = { ready: true };

      const zipData = fflate.zipSync({
        'migration-plan.json': fflate.strToU8(JSON.stringify(plan)),
        'verification-report.json': fflate.strToU8(
          JSON.stringify(verification),
        ),
        'cohort-report-1.json': fflate.strToU8(JSON.stringify(cohort1)),
        'test-preflight-report.json': fflate.strToU8(JSON.stringify(preflight)),
        'ignore.txt': fflate.strToU8('not a json file'),
      });

      const result = unpackArtifactZipBuffer(zipData);

      assert.deepEqual(result.plan, plan);
      assert.deepEqual(result.verification, verification);
      assert.deepEqual(result.preflight, preflight);
      assert.equal(result.cohorts.length, 1);
      assert.deepEqual(result.cohorts[0], cohort1);
      assert.equal(result.rawFiles['ignore.txt'], undefined);
    });
  });

  describe('Workflow Dispatches', () => {
    it('dispatches migration-execute-wave.yml and resolves the run ID', async () => {
      let dispatchCalled = false;
      let capturedBody: Record<string, unknown> | null = null;

      const mockFetch: typeof fetch = async (url, init) => {
        const u = url.toString();
        if (
          u.includes('/actions/workflows/migration-execute-wave.yml/dispatches')
        ) {
          dispatchCalled = true;
          capturedBody = JSON.parse(init?.body as string);
          return new Response(null, { status: 204 });
        }
        if (u.includes('/actions/workflows/migration-execute-wave.yml/runs')) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 99101,
                  created_at: new Date(Date.now() + 1000).toISOString(),
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const { runId } = await service.dispatchWave({
        scope: 'scopes/test-all-wave.json',
        batchSize: 5,
        modules: [
          'org-variables',
          'org-secrets',
          'teams',
          'org-custom-properties',
          'repo-variables',
          'repo-secrets',
          'repo-custom-properties',
          'repo-settings',
          'branch-protection',
          'rulesets',
          'environments',
          'webhooks',
          'releases',
          'deploy-keys',
          'collaborators',
          'lfs',
          'packages',
        ],
        dryRun: true,
        continueOnError: true,
        runnerLabels: ['ubuntu-latest'],
        environmentGate: 'staging',
      });

      assert.equal(dispatchCalled, true);
      assert.equal(runId, 99101);
      assert.equal(capturedBody?.ref, 'main');
      const inputs = capturedBody?.inputs as Record<string, string>;
      assert.equal(inputs.scope, 'scopes/test-all-wave.json');
      assert.equal(inputs.batch_size, '5');
      assert.equal(inputs.dry_run, 'true');
      assert.equal(inputs.continue_on_error, 'true');
      assert.equal(inputs.environment_gate, 'staging');
      assert.ok(inputs.modules.includes('org-variables'));
      assert.ok(inputs.modules.includes('packages'));
    });

    it('dispatches test-migration-dispatch.yml and resolves the run ID', async () => {
      let dispatchCalled = false;

      const mockFetch: typeof fetch = async (url) => {
        const u = url.toString();
        if (
          u.includes(
            '/actions/workflows/test-migration-dispatch.yml/dispatches',
          )
        ) {
          dispatchCalled = true;
          return new Response(null, { status: 204 });
        }
        if (u.includes('/actions/workflows/test-migration-dispatch.yml/runs')) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                { id: 77202, created_at: new Date().toISOString() },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const { runId } = await service.dispatchTestMigration({
        scope: 'scopes/test-repo-wave.json',
        stage: 'stage3',
        dryRun: false,
        enablePreflight: true,
      });

      assert.equal(dispatchCalled, true);
      assert.equal(runId, 77202);
    });

    it('dispatches migration-resume.yml with checkpoint ID', async () => {
      let dispatchCalled = false;
      let capturedBody: Record<string, unknown> | null = null;

      const mockFetch: typeof fetch = async (url, init) => {
        const u = url.toString();
        if (u.includes('/actions/workflows/migration-resume.yml/dispatches')) {
          dispatchCalled = true;
          capturedBody = JSON.parse(init?.body as string);
          return new Response(null, { status: 204 });
        }
        if (u.includes('/actions/workflows/migration-resume.yml/runs')) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                { id: 88303, created_at: new Date().toISOString() },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const { runId } = await service.dispatchResumeWave(12345, {
        checkpointId: 'latest',
      });

      assert.equal(dispatchCalled, true);
      assert.equal(runId, 88303);
      const inputs = capturedBody?.inputs as Record<string, string>;
      assert.equal(inputs.checkpoint_id, 'latest');
      assert.equal(inputs.original_run_id, '12345');
    });
  });

  describe('Run & Job Polling and Cancellation', () => {
    it('polls run status with ETag and supports 304 Not Modified', async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (headers['If-None-Match'] === '"run-etag-1"') {
          return new Response(null, { status: 304 });
        }
        return new Response(
          JSON.stringify({
            id: 55404,
            name: 'Migration Wave',
            status: 'in_progress',
            conclusion: null,
            html_url:
              'https://github.com/test-org/test-migration-repo/actions/runs/55404',
            created_at: '2026-10-06T00:00:00Z',
            updated_at: '2026-10-06T00:01:00Z',
            run_attempt: 1,
            event: 'workflow_dispatch',
          }),
          {
            status: 200,
            headers: {
              etag: '"run-etag-1"',
              'Content-Type': 'application/json',
            },
          },
        );
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const initial = await service.getRunStatus(55404);
      assert.equal(initial.notModified, false);
      assert.equal(initial.etag, '"run-etag-1"');
      assert.equal(initial.run.status, 'in_progress');

      const cached = await service.getRunStatus(55404, '"run-etag-1"');
      assert.equal(cached.notModified, true);
    });

    it('parses jobs and identifies matrix cohorts', async () => {
      const mockFetch: typeof fetch = async (url) => {
        const u = url.toString();
        if (u.includes('/actions/runs/55404/jobs')) {
          return new Response(
            JSON.stringify({
              jobs: [
                {
                  id: 1,
                  run_id: 55404,
                  name: 'slicer',
                  status: 'completed',
                  conclusion: 'success',
                  started_at: '2026-10-06T00:00:00Z',
                  completed_at: '2026-10-06T00:00:10Z',
                  steps: [
                    {
                      name: 'Slice scope',
                      status: 'completed',
                      conclusion: 'success',
                      number: 1,
                      started_at: '2026-10-06T00:00:01Z',
                      completed_at: '2026-10-06T00:00:09Z',
                    },
                  ],
                },
                {
                  id: 2,
                  run_id: 55404,
                  name: 'migrate-cohorts (cohort-1)',
                  status: 'completed',
                  conclusion: 'success',
                  started_at: '2026-10-06T00:00:10Z',
                  completed_at: '2026-10-06T00:01:00Z',
                  steps: [],
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const jobs = await service.getRunJobs(55404);
      assert.equal(jobs.length, 2);
      assert.equal(jobs[0].isMatrixCohort, false);
      assert.equal(jobs[0].durationMs, 10000);
      assert.equal(jobs[0].steps[0].durationMs, 8000);

      assert.equal(jobs[1].isMatrixCohort, true);
      assert.equal(jobs[1].cohortIdentifier, 'cohort-1');
      assert.equal(jobs[1].durationMs, 50000);
    });

    it('cancels a running workflow', async () => {
      let cancelCalled = false;
      const mockFetch: typeof fetch = async (url, init) => {
        const u = url.toString();
        if (u.includes('/actions/runs/55404/cancel')) {
          cancelCalled = true;
          assert.equal(init?.method, 'POST');
          return new Response(null, { status: 202 });
        }
        return new Response('Not found', { status: 404 });
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const success = await service.cancelRun(55404);
      assert.equal(cancelCalled, true);
      assert.equal(success, true);
    });
  });

  describe('Artifact Download & In-Memory Decompression', () => {
    it('downloads artifacts, follows redirect, and unpacks reports', async () => {
      const plan = { planId: 'plan-download-1' };
      const cohort1 = { cohortId: 'cohort-1', status: 'completed' };

      const zipData = fflate.zipSync({
        'migration-plan.json': fflate.strToU8(JSON.stringify(plan)),
        'cohort-report-1.json': fflate.strToU8(JSON.stringify(cohort1)),
      });

      const mockFetch: typeof fetch = async (url, init) => {
        const u = url.toString();
        const headers = (init?.headers ?? {}) as Record<string, string>;

        if (u.includes('/actions/runs/66505/artifacts')) {
          return new Response(
            JSON.stringify({
              artifacts: [
                {
                  id: 999,
                  name: 'migration-reports',
                  size_in_bytes: zipData.byteLength,
                  expired: false,
                  archive_download_url:
                    'https://api.github.com/mock/artifacts/999/zip',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (u.includes('/actions/artifacts/999/zip')) {
          assert.ok(headers.Authorization);
          return new Response(null, {
            status: 302,
            headers: {
              location:
                'https://azure.blob.core.windows.net/test/artifact-999.zip',
            },
          });
        }

        if (u.includes('azure.blob.core.windows.net/test/artifact-999.zip')) {
          // Verify authorization header was stripped on redirect
          assert.equal(headers.Authorization, undefined);
          return new Response(zipData, {
            status: 200,
            headers: { 'Content-Type': 'application/zip' },
          });
        }

        return new Response('Not found', { status: 404 });
      };

      const service = new GitHubActionsService({
        owner,
        repo,
        token,
        fetchFn: mockFetch,
      });

      const artifacts = await service.downloadAndUnpackArtifacts(66505);

      assert.deepEqual(artifacts.plan, plan);
      assert.equal(artifacts.cohorts.length, 1);
      assert.deepEqual(artifacts.cohorts[0], cohort1);
      assert.deepEqual(artifacts.rawFiles['migration-plan.json'], plan);
    });
  });
});
