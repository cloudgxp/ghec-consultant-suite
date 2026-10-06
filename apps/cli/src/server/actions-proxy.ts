import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as fflate from 'fflate';
import type { SseManager } from './sse.js';

export interface ActionsProxyOptions {
  getToken: () => Promise<string | null>;
  sseManager: SseManager;
  fetchFn?: typeof fetch;
}

const GITHUB_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const NUMERIC_ID_REGEX = /^[0-9]+$/;
const WORKFLOW_ID_REGEX = /^[a-zA-Z0-9_.-]+$/;

function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (
    !trimmed ||
    !GITHUB_NAME_REGEX.test(trimmed) ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    return null;
  }
  return encodeURIComponent(trimmed);
}

function sanitizeId(id: unknown): string | null {
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const str = String(id).trim();
  if (!str || !NUMERIC_ID_REGEX.test(str)) {
    return null;
  }
  return encodeURIComponent(str);
}

function sanitizeWorkflowId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (
    !trimmed ||
    !WORKFLOW_ID_REGEX.test(trimmed) ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    return null;
  }
  return encodeURIComponent(trimmed);
}

export function registerActionsProxy(
  fastify: FastifyInstance,
  options: ActionsProxyOptions,
): void {
  const fetchFn = options.fetchFn ?? fetch;

  const getRequiredToken = async (
    reply: FastifyReply,
  ): Promise<string | null> => {
    const token = await options.getToken();
    if (!token) {
      reply.status(401).send({
        error:
          'No GitHub credentials found. Run "gh auth login" or set GITHUB_TOKEN.',
      });
      return null;
    }
    return token;
  };

  // POST /api/actions/workflows/:workflowId/dispatch
  fastify.post(
    '/api/actions/workflows/:workflowId/dispatch',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { workflowId } = req.params as { workflowId: string };
      const body = (req.body ?? {}) as {
        owner?: string;
        repo?: string;
        ref?: string;
        inputs?: Record<string, unknown>;
      };
      const query = (req.query ?? {}) as { owner?: string; repo?: string };

      const safeOwner = sanitizeName(body.owner || query.owner);
      const safeRepo = sanitizeName(body.repo || query.repo);
      const safeWorkflowId = sanitizeWorkflowId(workflowId);

      if (!safeOwner || !safeRepo || !safeWorkflowId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required parameters: owner, repo, or workflowId.',
        });
      }

      const ref = body.ref || 'main';
      const inputs = body.inputs || {};

      const ghUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/workflows/${safeWorkflowId}/dispatches`;
      const res = await fetchFn(ghUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-cli',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref, inputs }),
      });

      if (!res.ok && res.status !== 204) {
        const errText = await res.text();
        return reply
          .status(res.status)
          .send({ error: `GitHub API error: ${errText}` });
      }

      return reply.status(200).send({ status: 'dispatched', workflowId, ref });
    },
  );

  // GET /api/actions/workflows/:workflowId/runs
  fastify.get(
    '/api/actions/workflows/:workflowId/runs',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { workflowId } = req.params as { workflowId: string };
      const query = (req.query ?? {}) as {
        owner?: string;
        repo?: string;
        event?: string;
        status?: string;
        per_page?: string;
        page?: string;
      };
      const { owner, repo, event, status, per_page, page } = query;

      const safeOwner = sanitizeName(owner);
      const safeRepo = sanitizeName(repo);
      const safeWorkflowId = sanitizeWorkflowId(workflowId);

      if (!safeOwner || !safeRepo || !safeWorkflowId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required query parameters: owner, repo, or workflowId.',
        });
      }

      const params = new URLSearchParams();
      if (event && GITHUB_NAME_REGEX.test(event)) params.set('event', event);
      if (status && GITHUB_NAME_REGEX.test(status))
        params.set('status', status);
      if (per_page && NUMERIC_ID_REGEX.test(per_page))
        params.set('per_page', per_page);
      if (page && NUMERIC_ID_REGEX.test(page)) params.set('page', page);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const ghUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/workflows/${safeWorkflowId}/runs${qs}`;
      const res = await fetchFn(ghUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-cli',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return reply
          .status(res.status)
          .send({ error: `GitHub API error: ${errText}` });
      }

      const data = await res.json();
      return reply.status(200).send(data);
    },
  );

  // GET /api/actions/runs/:runId
  fastify.get(
    '/api/actions/runs/:runId',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { runId } = req.params as { runId: string };
      const query = (req.query ?? {}) as { owner?: string; repo?: string };
      const { owner, repo } = query;

      const safeOwner = sanitizeName(owner);
      const safeRepo = sanitizeName(repo);
      const safeRunId = sanitizeId(runId);

      if (!safeOwner || !safeRepo || !safeRunId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required query parameters: owner, repo, or runId.',
        });
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ghec-consultant-cli',
        'X-GitHub-Api-Version': '2022-11-28',
      };

      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && typeof ifNoneMatch === 'string') {
        headers['If-None-Match'] = ifNoneMatch;
      }

      const ghUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/runs/${safeRunId}`;
      const res = await fetchFn(ghUrl, { headers });

      if (res.status === 304) {
        return reply.status(304).send();
      }

      const etag = res.headers.get('etag');
      if (etag) {
        reply.header('ETag', etag);
      }

      if (!res.ok) {
        const errText = await res.text();
        return reply
          .status(res.status)
          .send({ error: `GitHub API error: ${errText}` });
      }

      const data = await res.json();
      return reply.status(200).send(data);
    },
  );

  // GET /api/actions/runs/:runId/jobs
  fastify.get(
    '/api/actions/runs/:runId/jobs',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { runId } = req.params as { runId: string };
      const query = (req.query ?? {}) as { owner?: string; repo?: string };
      const { owner, repo } = query;

      const safeOwner = sanitizeName(owner);
      const safeRepo = sanitizeName(repo);
      const safeRunId = sanitizeId(runId);

      if (!safeOwner || !safeRepo || !safeRunId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required query parameters: owner, repo, or runId.',
        });
      }

      const ghUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/runs/${safeRunId}/jobs`;
      const res = await fetchFn(ghUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-cli',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return reply
          .status(res.status)
          .send({ error: `GitHub API error: ${errText}` });
      }

      const data = await res.json();
      return reply.status(200).send(data);
    },
  );

  // POST /api/actions/runs/:runId/cancel
  fastify.post(
    '/api/actions/runs/:runId/cancel',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { runId } = req.params as { runId: string };
      const body = (req.body ?? {}) as { owner?: string; repo?: string };
      const query = (req.query ?? {}) as { owner?: string; repo?: string };
      const owner = body.owner || query.owner;
      const repo = body.repo || query.repo;

      const safeOwner = sanitizeName(owner);
      const safeRepo = sanitizeName(repo);
      const safeRunId = sanitizeId(runId);

      if (!safeOwner || !safeRepo || !safeRunId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required parameters: owner, repo, or runId.',
        });
      }

      const ghUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/runs/${safeRunId}/cancel`;
      const res = await fetchFn(ghUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-cli',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok && res.status !== 202) {
        const errText = await res.text();
        return reply
          .status(res.status)
          .send({ error: `GitHub API error: ${errText}` });
      }

      return reply.status(200).send({ status: 'cancelled', runId });
    },
  );

  // GET /api/actions/runs/:runId/artifacts
  fastify.get(
    '/api/actions/runs/:runId/artifacts',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { runId } = req.params as { runId: string };
      const query = (req.query ?? {}) as { owner?: string; repo?: string };
      const { owner, repo } = query;

      const safeOwner = sanitizeName(owner);
      const safeRepo = sanitizeName(repo);
      const safeRunId = sanitizeId(runId);

      if (!safeOwner || !safeRepo || !safeRunId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required query parameters: owner, repo, or runId.',
        });
      }

      const ghUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/runs/${safeRunId}/artifacts`;
      const res = await fetchFn(ghUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-cli',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return reply
          .status(res.status)
          .send({ error: `GitHub API error: ${errText}` });
      }

      const data = await res.json();
      return reply.status(200).send(data);
    },
  );

  // GET /api/actions/artifacts/:artifactId/unpacked
  fastify.get(
    '/api/actions/artifacts/:artifactId/unpacked',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = await getRequiredToken(reply);
      if (!token) return;

      const { artifactId } = req.params as { artifactId: string };
      const query = (req.query ?? {}) as { owner?: string; repo?: string };
      const { owner, repo } = query;

      const safeOwner = sanitizeName(owner);
      const safeRepo = sanitizeName(repo);
      const safeArtifactId = sanitizeId(artifactId);

      if (!safeOwner || !safeRepo || !safeArtifactId) {
        return reply.status(400).send({
          error:
            'Missing or invalid required query parameters: owner, repo, or artifactId.',
        });
      }

      const zipUrl = `https://api.github.com/repos/${safeOwner}/${safeRepo}/actions/artifacts/${safeArtifactId}/zip`;
      const initialRes = await fetchFn(zipUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ghec-consultant-cli',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'manual',
      });

      let downloadRes: Response;
      if (initialRes.status === 302 || initialRes.status === 301) {
        const location = initialRes.headers.get('location');
        if (!location) {
          return reply.status(502).send({
            error: 'Redirect location missing from GitHub artifact response.',
          });
        }
        let parsedRedirect: URL;
        try {
          parsedRedirect = new URL(location);
        } catch {
          return reply
            .status(502)
            .send({ error: 'Invalid redirect URL received.' });
        }
        if (parsedRedirect.protocol !== 'https:') {
          return reply.status(502).send({
            error: 'Insecure redirect protocol from artifact download.',
          });
        }
        // Follow redirect without Authorization header to avoid Azure Blob 400
        downloadRes = await fetchFn(parsedRedirect.toString());
      } else if (initialRes.ok) {
        downloadRes = initialRes;
      } else {
        const errText = await initialRes.text();
        return reply
          .status(initialRes.status)
          .send({ error: `Failed to download artifact: ${errText}` });
      }

      if (!downloadRes.ok) {
        return reply.status(downloadRes.status).send({
          error: 'Failed to download artifact from storage provider.',
        });
      }

      try {
        const arrayBuffer = await downloadRes.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const decompressed = fflate.unzipSync(uint8);

        const files: Record<string, unknown> = {};
        const reports: {
          plan?: unknown;
          verification?: unknown;
          cohorts: unknown[];
          preflight?: unknown;
        } = {
          cohorts: [],
        };

        for (const [filename, fileBytes] of Object.entries(decompressed)) {
          if (filename.endsWith('.json')) {
            try {
              const text = fflate.strFromU8(fileBytes);
              const parsed = JSON.parse(text);
              files[filename] = parsed;

              if (filename === 'migration-plan.json') {
                reports.plan = parsed;
              } else if (filename === 'verification-report.json') {
                reports.verification = parsed;
              } else if (
                filename === 'test-preflight-report.json' ||
                filename === 'preflight-report.json'
              ) {
                reports.preflight = parsed;
              } else if (filename.startsWith('cohort-report-')) {
                reports.cohorts.push(parsed);
              }
            } catch {
              files[filename] = null;
            }
          }
        }

        return reply.status(200).send({
          artifactId: Number(artifactId),
          files,
          reports,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply
          .status(500)
          .send({ error: `Failed to unpack artifact archive: ${msg}` });
      }
    },
  );
}
