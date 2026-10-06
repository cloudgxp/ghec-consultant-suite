import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import { parseConsoleOptions } from '../src/commands/console.js';
import { getAuthStatus } from '../src/server/auth-bridge.js';
import { createConsoleServer } from '../src/server/server.js';
import { SseManager } from '../src/server/sse.js';

describe('Task 036: Local Console Server & Ambient Auth Proxy', () => {
  describe('parseConsoleOptions', () => {
    it('parses valid port, host, and --no-open flags', () => {
      const options = parseConsoleOptions([
        '--port',
        '4500',
        '--host',
        '127.0.0.2',
        '--no-open',
      ]);
      assert.equal(options.port, 4500);
      assert.equal(options.host, '127.0.0.2');
      assert.equal(options.openBrowser, false);
    });

    it('defaults host to 127.0.0.1 and openBrowser to true', () => {
      const options = parseConsoleOptions([]);
      assert.equal(options.port, undefined);
      assert.equal(options.host, '127.0.0.1');
      assert.equal(options.openBrowser, true);
    });

    it('throws error on invalid port', () => {
      assert.throws(
        () => parseConsoleOptions(['--port', 'invalid']),
        /Invalid port/,
      );
      assert.throws(
        () => parseConsoleOptions(['--port', '999999']),
        /Invalid port/,
      );
    });
  });

  describe('auth-bridge: getAuthStatus', () => {
    it('returns unauthenticated when token is absent', async () => {
      const status = await getAuthStatus(null, async () => {
        throw new Error('should not be called');
      });
      assert.equal(status.authenticated, false);
      assert.equal(status.authType, 'unauthenticated');
      assert.equal(status.user, null);
    });

    it('returns authenticated with username when GitHub API call succeeds', async () => {
      const mockFetch: typeof fetch = async (url) => {
        assert.equal(url.toString(), 'https://api.github.com/user');
        return new Response(JSON.stringify({ login: 'octocat' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const status = await getAuthStatus('fake-token', mockFetch);
      assert.equal(status.authenticated, true);
      assert.equal(status.user, 'octocat');
    });
  });

  describe('Fastify Console Server & Proxy Routes', () => {
    it('handles /api/auth/status endpoint', async () => {
      const mockFetch: typeof fetch = async (url) => {
        if (url.toString() === 'https://api.github.com/user') {
          return new Response(JSON.stringify({ login: 'test-consultant' }), {
            status: 200,
          });
        }
        return new Response('Not found', { status: 404 });
      };

      const { app, stop } = await createConsoleServer({
        port: 0,
        openBrowser: false,
        explicitToken: 'test-token-123',
        fetchFn: mockFetch,
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/status',
        });

        assert.equal(res.statusCode, 200);
        const data = JSON.parse(res.body);
        assert.equal(data.authenticated, true);
        assert.equal(data.user, 'test-consultant');
      } finally {
        await stop();
      }
    });

    it('handles workflow dispatch and run status proxying with ETag caching', async () => {
      const mockFetch: typeof fetch = async (url, init) => {
        const u = url.toString();
        const headers = (init?.headers ?? {}) as Record<string, string>;

        if (u.includes('/actions/workflows/migration.yml/dispatches')) {
          assert.equal(init?.method, 'POST');
          assert.equal(headers.Authorization, 'Bearer test-token');
          return new Response(null, { status: 204 });
        }

        if (u.includes('/actions/runs/12345/jobs')) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              jobs: [{ id: 1, name: 'migrate' }],
            }),
            {
              status: 200,
            },
          );
        }

        if (u.includes('/actions/runs/12345/cancel')) {
          return new Response(null, { status: 202 });
        }

        if (u.includes('/actions/runs/12345')) {
          if (headers['If-None-Match'] === '"etag-xyz"') {
            return new Response(null, { status: 304 });
          }
          return new Response(
            JSON.stringify({ id: 12345, status: 'in_progress' }),
            {
              status: 200,
              headers: {
                etag: '"etag-xyz"',
                'Content-Type': 'application/json',
              },
            },
          );
        }

        return new Response('Not found', { status: 404 });
      };

      const { app, stop } = await createConsoleServer({
        port: 0,
        openBrowser: false,
        explicitToken: 'test-token',
        fetchFn: mockFetch,
      });

      try {
        // Test dispatch
        const dispatchRes = await app.inject({
          method: 'POST',
          url: '/api/actions/workflows/migration.yml/dispatch',
          payload: {
            owner: 'src-org',
            repo: 'src-repo',
            ref: 'main',
            inputs: { dry_run: 'true' },
          },
        });
        assert.equal(dispatchRes.statusCode, 200);
        assert.equal(JSON.parse(dispatchRes.body).status, 'dispatched');

        // Test run status initial request
        const runRes1 = await app.inject({
          method: 'GET',
          url: '/api/actions/runs/12345?owner=src-org&repo=src-repo',
        });
        assert.equal(runRes1.statusCode, 200);
        assert.equal(runRes1.headers.etag, '"etag-xyz"');
        assert.equal(JSON.parse(runRes1.body).id, 12345);

        // Test run status 304 Not Modified
        const runRes2 = await app.inject({
          method: 'GET',
          url: '/api/actions/runs/12345?owner=src-org&repo=src-repo',
          headers: {
            'if-none-match': '"etag-xyz"',
          },
        });
        assert.equal(runRes2.statusCode, 304);

        // Test run jobs
        const jobsRes = await app.inject({
          method: 'GET',
          url: '/api/actions/runs/12345/jobs?owner=src-org&repo=src-repo',
        });
        assert.equal(jobsRes.statusCode, 200);
        assert.equal(JSON.parse(jobsRes.body).total_count, 1);

        // Test run cancellation
        const cancelRes = await app.inject({
          method: 'POST',
          url: '/api/actions/runs/12345/cancel',
          payload: { owner: 'src-org', repo: 'src-repo' },
        });
        assert.equal(cancelRes.statusCode, 200);
        assert.equal(JSON.parse(cancelRes.body).status, 'cancelled');
      } finally {
        await stop();
      }
    });

    it('proxies workflow runs listing via GET /api/actions/workflows/:workflowId/runs', async () => {
      const mockFetch: typeof fetch = async (url) => {
        const u = url.toString();
        if (
          u.includes(
            '/actions/workflows/enterprise-multi-org-scan.yml/runs?event=workflow_dispatch',
          )
        ) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              workflow_runs: [{ id: 12345, status: 'in_progress' }],
            }),
            { status: 200 },
          );
        }
        return new Response('Not found', { status: 404 });
      };

      const { app, stop } = await createConsoleServer({
        port: 0,
        openBrowser: false,
        explicitToken: 'test-token',
        fetchFn: mockFetch,
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/actions/workflows/enterprise-multi-org-scan.yml/runs?owner=cloudgxp&repo=ghec-consultant-suite&event=workflow_dispatch',
        });
        assert.equal(res.statusCode, 200);
        const data = JSON.parse(res.body);
        assert.equal(data.total_count, 1);
        assert.equal(data.workflow_runs[0].id, 12345);
      } finally {
        await stop();
      }
    });

    it('downloads and unzips artifacts in Node memory without disk access', async () => {
      // Build a synthetic ZIP archive in memory using fflate
      const planContent = JSON.stringify({
        planId: 'test-plan-001',
        summary: { create: 2 },
      });
      const cohortContent = JSON.stringify({
        cohortId: 'cohort-1',
        status: 'completed',
      });

      const zipData = fflate.zipSync({
        'migration-plan.json': fflate.strToU8(planContent),
        'cohort-report-1.json': fflate.strToU8(cohortContent),
      });

      const mockFetch: typeof fetch = async (url) => {
        const u = url.toString();
        if (u.includes('/actions/artifacts/888/zip')) {
          // Emulate GitHub redirect to storage CDN
          return new Response(null, {
            status: 302,
            headers: {
              location:
                'https://storage.mock.blob.core.windows.net/artifacts/888.zip',
            },
          });
        }
        if (
          u.includes('storage.mock.blob.core.windows.net/artifacts/888.zip')
        ) {
          return new Response(zipData, {
            status: 200,
            headers: { 'Content-Type': 'application/zip' },
          });
        }
        return new Response('Not found', { status: 404 });
      };

      const { app, stop } = await createConsoleServer({
        port: 0,
        openBrowser: false,
        explicitToken: 'test-token',
        fetchFn: mockFetch,
      });

      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/actions/artifacts/888/unpacked?owner=org&repo=repo',
        });

        assert.equal(res.statusCode, 200);
        const data = JSON.parse(res.body);
        assert.equal(data.artifactId, 888);
        assert.deepEqual(
          data.files['migration-plan.json'],
          JSON.parse(planContent),
        );
        assert.deepEqual(
          data.files['cohort-report-1.json'],
          JSON.parse(cohortContent),
        );
        assert.equal(
          (data.reports.plan as { planId: string }).planId,
          'test-plan-001',
        );
        assert.equal(data.reports.cohorts.length, 1);
      } finally {
        await stop();
      }
    });

    it('validates and handles /api/cli/preflight endpoint in-memory', async () => {
      const { app, stop } = await createConsoleServer({
        port: 0,
        openBrowser: false,
        explicitToken: 'test-token',
      });

      try {
        // Missing scope
        const missingRes = await app.inject({
          method: 'POST',
          url: '/api/cli/preflight',
          payload: {},
        });
        assert.equal(missingRes.statusCode, 400);

        // Invalid scope schema
        const invalidRes = await app.inject({
          method: 'POST',
          url: '/api/cli/preflight',
          payload: { scope: { invalid: true } },
        });
        assert.equal(invalidRes.statusCode, 400);
      } finally {
        await stop();
      }
    });

    it('manages SSE connections and broadcasts correctly', () => {
      const sseManager = new SseManager();
      assert.equal(sseManager.getClientCount(), 0);

      // Verify broadcast does not throw when 0 clients
      assert.doesNotThrow(() => {
        sseManager.broadcast('test_event', { message: 'hello' });
      });

      sseManager.close();
    });
  });
});
