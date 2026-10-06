import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { validateMigrationScope, type MigrationScope } from '@ghec/contracts';
import { evaluatePreflightDirect } from '../commands/preflight.js';

export interface PreflightProxyOptions {
  getToken: () => Promise<string | null>;
}

export function registerPreflightProxy(
  fastify: FastifyInstance,
  options: PreflightProxyOptions,
): void {
  fastify.post('/api/cli/preflight', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const ambientToken = await options.getToken();
      const body = (req.body ?? {}) as {
        scope?: unknown;
        sourceToken?: string;
        targetToken?: string;
      };

      if (!body.scope) {
        return reply.status(400).send({
          error:
            'Missing required field: "scope" (JSON object) must be provided.',
        });
      }

      const scopeValidation = validateMigrationScope(body.scope);
      if (!scopeValidation.success) {
        return reply.status(400).send({
          error: `Invalid scope schema: ${scopeValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        });
      }
      const scope: MigrationScope = scopeValidation.data;

      try {
        const sourceToken =
          body.sourceToken ||
          process.env.GHEC_SOURCE_TOKEN ||
          ambientToken ||
          undefined;
        const targetToken =
          body.targetToken ||
          process.env.GHEC_TARGET_TOKEN ||
          ambientToken ||
          undefined;

        const result = await evaluatePreflightDirect({
          scope,
          sourceToken,
          targetToken,
        });

        return reply.status(200).send({
          report: result.report,
          filePath: '',
          hasBlockers: result.hasBlockers,
          blockedCount: result.blockedCount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply
          .status(500)
          .send({ error: `Preflight execution failed: ${msg}` });
      }
    },
  });
}
