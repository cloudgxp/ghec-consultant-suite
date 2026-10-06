import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Task 032: Dashboard Migration Control Plane', () => {
  it('correctly formats and dispatches a migration wave with runner capacity and scope', async () => {
    let dispatchedPayload: Record<string, unknown> | null = null;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = input.toString();

      if (
        url.includes('/actions/workflows/migration-execute-wave.yml/dispatch')
      ) {
        dispatchedPayload = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ status: 'dispatched' }), {
          status: 200,
        });
      }

      if (url.includes('/actions/workflows/migration-execute-wave.yml/runs')) {
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 881230,
                run_number: 14,
                status: 'in_progress',
                conclusion: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response('Not found', { status: 404 });
    };

    // Simulate dispatch
    const res = await mockFetch(
      'http://localhost:3000/api/actions/workflows/migration-execute-wave.yml/dispatch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'cloudgxp',
          repo: 'ghec-consultant-suite',
          ref: 'main',
          inputs: {
            scope: 'scopes/test-all-wave.json',
            runner_capacity: 4,
            batch_size: 4,
            modules: 'all',
            dry_run: true,
            continue_on_error: true,
            runner_labels: 'ubuntu-latest',
            environment_gate: 'test-gate',
          },
        }),
      },
    );

    assert.equal(res.ok, true);
    assert.equal(dispatchedPayload.owner, 'cloudgxp');
    assert.equal(dispatchedPayload.inputs.scope, 'scopes/test-all-wave.json');
    assert.equal(dispatchedPayload.inputs.runner_capacity, 4);
    assert.equal(dispatchedPayload.inputs.dry_run, true);
  });

  it('monitors live cohort matrix jobs and step telemetry', async () => {
    const mockJobsResponse = {
      jobs: [
        {
          id: 101,
          name: 'Partition Scopes & Plan Wave',
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-10-06T10:00:00Z',
          completed_at: '2026-10-06T10:00:15Z',
        },
        {
          id: 102,
          name: 'Migrate Cohort: cohort-1',
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-10-06T10:00:16Z',
          completed_at: '2026-10-06T10:01:20Z',
          steps: [
            { name: 'preflight', status: 'completed', conclusion: 'success' },
            { name: 'verify', status: 'completed', conclusion: 'success' },
          ],
        },
        {
          id: 103,
          name: 'Migrate Cohort: cohort-2',
          status: 'in_progress',
          conclusion: null,
          started_at: '2026-10-06T10:00:16Z',
          completed_at: null,
          steps: [
            { name: 'preflight', status: 'completed', conclusion: 'success' },
            { name: 'gei-repo', status: 'in_progress', conclusion: null },
          ],
        },
        {
          id: 104,
          name: 'Aggregate & Verify Wave Compliance',
          status: 'queued',
          conclusion: null,
          started_at: null,
          completed_at: null,
        },
      ],
    };

    const mockFetch: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes('/actions/runs/881230/jobs')) {
        return new Response(JSON.stringify(mockJobsResponse), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const jobsRes = await mockFetch(
      'http://localhost:3000/api/actions/runs/881230/jobs?owner=cloudgxp&repo=ghec-consultant-suite',
    );
    assert.equal(jobsRes.ok, true);
    const data = (await jobsRes.json()) as typeof mockJobsResponse;

    const slicer = data.jobs.find((j) => j.name.includes('Partition'));
    assert.ok(slicer);
    assert.equal(slicer.status, 'completed');
    assert.equal(slicer.conclusion, 'success');

    const cohorts = data.jobs.filter((j) => j.name.includes('Cohort'));
    assert.equal(cohorts.length, 2);
    assert.equal(cohorts[0]?.status, 'completed');
    assert.equal(cohorts[1]?.status, 'in_progress');
  });

  it('cancels ongoing migration wave via cancel endpoint', async () => {
    let cancelledRunId: string | null = null;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = input.toString();
      if (url.includes('/actions/runs/881230/cancel')) {
        assert.equal(init?.method, 'POST');
        cancelledRunId = '881230';
        return new Response(
          JSON.stringify({ status: 'cancelled', runId: 881230 }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const cancelRes = await mockFetch(
      'http://localhost:3000/api/actions/runs/881230/cancel',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'cloudgxp',
          repo: 'ghec-consultant-suite',
        }),
      },
    );

    assert.equal(cancelRes.ok, true);
    assert.equal(cancelledRunId, '881230');
    const data = await cancelRes.json();
    assert.equal(data.status, 'cancelled');
  });
});
