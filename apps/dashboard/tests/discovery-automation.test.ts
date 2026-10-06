import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importBundleJson } from '../src/lib/importer.js';
import { SAMPLE_ORGANIZATION_BUNDLE } from '../src/lib/samples.js';

describe('Task 031: Discovery Automation & Ingestion via Dashboard', () => {
  describe('importBundleJson', () => {
    it('successfully validates and evaluates a valid discovery bundle in-memory', () => {
      const result = importBundleJson(SAMPLE_ORGANIZATION_BUNDLE);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.bundle.schemaVersion, '1.0.0');
        assert.equal(result.bundle.scan.id, 'fictional-scan-001');
        assert.ok(result.insights);
        assert.ok(result.insights.dimensions.length > 0);
        assert.ok(result.insights.collectorSummary.total > 0);
      }
    });

    it('rejects an invalid bundle object with clear error code and message', () => {
      const invalidData = {
        schemaVersion: '1.0.0',
        scan: { id: 'test' },
        // missing required fields
      };
      const result = importBundleJson(invalidData);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.message);
        assert.equal(result.code, 'invalid_bundle');
      }
    });
  });

  describe('Discovery Scan Dispatch & Ingestion Flow', () => {
    it('simulates end-to-end dispatch, polling, artifact retrieval, and hydration', async () => {
      const mockState = {
        dispatched: false,
        pollCount: 0,
        runId: 991823,
        artifactId: 44219,
      };

      const mockFetch: typeof fetch = async (input, init) => {
        const url = input.toString();

        if (
          url.includes(
            '/actions/workflows/enterprise-multi-org-scan.yml/dispatch',
          )
        ) {
          assert.equal(init?.method, 'POST');
          const body = JSON.parse(init?.body as string);
          assert.equal(body.owner, 'cloudgxp');
          assert.equal(body.repo, 'ghec-consultant-suite');
          assert.equal(body.inputs.enterprise_slug, 'cloudgxp');
          mockState.dispatched = true;
          return new Response(JSON.stringify({ status: 'dispatched' }), {
            status: 200,
          });
        }

        if (
          url.includes('/actions/workflows/enterprise-multi-org-scan.yml/runs')
        ) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: mockState.runId,
                  created_at: new Date().toISOString(),
                  status: 'in_progress',
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.includes(`/actions/runs/${mockState.runId}?`)) {
          mockState.pollCount++;
          const status = mockState.pollCount >= 2 ? 'completed' : 'in_progress';
          const conclusion = mockState.pollCount >= 2 ? 'success' : null;
          return new Response(
            JSON.stringify({
              id: mockState.runId,
              status,
              conclusion,
            }),
            { status: 200 },
          );
        }

        if (url.includes(`/actions/runs/${mockState.runId}/artifacts?`)) {
          return new Response(
            JSON.stringify({
              artifacts: [
                {
                  id: mockState.artifactId,
                  name: 'discovery-enterprise-cloudgxp',
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (
          url.includes(`/actions/artifacts/${mockState.artifactId}/unpacked?`)
        ) {
          return new Response(
            JSON.stringify({
              artifactId: mockState.artifactId,
              files: {
                'ghec-discovery-cloudgxp-sample.json':
                  SAMPLE_ORGANIZATION_BUNDLE,
              },
            }),
            { status: 200 },
          );
        }

        return new Response('Not Found', { status: 404 });
      };

      // 1. Dispatch
      const dispatchRes = await mockFetch(
        'http://localhost:3000/api/actions/workflows/enterprise-multi-org-scan.yml/dispatch',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: 'cloudgxp',
            repo: 'ghec-consultant-suite',
            ref: 'main',
            inputs: {
              enterprise_slug: 'cloudgxp',
              organizations: '',
              modules: 'all',
              dry_run: false,
              scan_enterprise_level: true,
            },
          }),
        },
      );
      assert.equal(dispatchRes.ok, true);
      assert.equal(mockState.dispatched, true);

      // 2. Poll workflow runs
      const runsRes = await mockFetch(
        'http://localhost:3000/api/actions/workflows/enterprise-multi-org-scan.yml/runs?owner=cloudgxp&repo=ghec-consultant-suite&event=workflow_dispatch',
      );
      assert.equal(runsRes.ok, true);
      const runsData = (await runsRes.json()) as {
        workflow_runs: Array<{ id: number }>;
      };
      const runId = runsData.workflow_runs[0]?.id;
      assert.equal(runId, mockState.runId);

      // 3. Poll run status
      let runStatus = '';
      let conclusion: string | null = null;
      while (runStatus !== 'completed') {
        const runRes = await mockFetch(
          `http://localhost:3000/api/actions/runs/${runId}?owner=cloudgxp&repo=ghec-consultant-suite`,
        );
        const data = (await runRes.json()) as {
          status: string;
          conclusion: string | null;
        };
        runStatus = data.status;
        conclusion = data.conclusion;
      }
      assert.equal(runStatus, 'completed');
      assert.equal(conclusion, 'success');

      // 4. Retrieve artifacts
      const artRes = await mockFetch(
        `http://localhost:3000/api/actions/runs/${runId}/artifacts?owner=cloudgxp&repo=ghec-consultant-suite`,
      );
      assert.equal(artRes.ok, true);
      const artData = (await artRes.json()) as {
        artifacts: Array<{ id: number; name: string }>;
      };
      const artifact = artData.artifacts.find((a) =>
        a.name.startsWith('discovery-enterprise-'),
      );
      assert.ok(artifact);
      assert.equal(artifact.id, mockState.artifactId);

      // 5. Unpack
      const unpackRes = await mockFetch(
        `http://localhost:3000/api/actions/artifacts/${artifact.id}/unpacked?owner=cloudgxp&repo=ghec-consultant-suite`,
      );
      assert.equal(unpackRes.ok, true);
      const unpacked = (await unpackRes.json()) as {
        files: Record<string, unknown>;
      };
      const rawBundle = unpacked.files['ghec-discovery-cloudgxp-sample.json'];
      assert.ok(rawBundle);

      // 6. Ingest into application state
      const importResult = importBundleJson(rawBundle);
      assert.equal(importResult.success, true);
      if (importResult.success) {
        assert.equal(importResult.bundle.scan.id, 'fictional-scan-001');
      }
    });
  });
});
