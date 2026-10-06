import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executePreflightCommand,
  type PreflightCommandOptions,
} from '../commands/preflight.js';

export interface PreflightProxyOptions {
  getToken: () => Promise<string | null>;
}

export function registerPreflightProxy(
  fastify: FastifyInstance,
  options: PreflightProxyOptions,
): void {
  fastify.post(
    '/api/cli/preflight',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const ambientToken = await options.getToken();
      const body = (req.body ?? {}) as {
        scope?: unknown;
        scopePath?: string;
        outputPath?: string;
        sourceToken?: string;
        targetToken?: string;
        verbose?: boolean;
      };

      let tempDir: string | null = null;
      let effectiveScopePath: string;

      try {
        if (body.scopePath) {
          effectiveScopePath = body.scopePath;
        } else if (body.scope) {
          tempDir = mkdtempSync(join(tmpdir(), 'ghec-preflight-'));
          effectiveScopePath = join(tempDir, 'scope.json');
          writeFileSync(
            effectiveScopePath,
            JSON.stringify(body.scope, null, 2),
            'utf8',
          );
        } else {
          return reply.status(400).send({
            error:
              'Missing required field: either "scope" (JSON object) or "scopePath" must be provided.',
          });
        }

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

        const outputPath =
          body.outputPath ||
          (tempDir
            ? join(tempDir, 'preflight-report.json')
            : join(tmpdir(), `preflight-report-${Date.now()}.json`));

        const preflightOptions: PreflightCommandOptions = {
          scopePath: effectiveScopePath,
          outputPath,
          sourceToken,
          targetToken,
          verbose: body.verbose ?? false,
        };

        const result = await executePreflightCommand(preflightOptions);

        return reply.status(200).send({
          report: result.report,
          filePath: result.filePath,
          hasBlockers: result.hasBlockers,
          blockedCount: result.blockedCount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply
          .status(500)
          .send({ error: `Preflight execution failed: ${msg}` });
      } finally {
        if (tempDir) {
          try {
            rmSync(tempDir, { recursive: true, force: true });
          } catch {
            // Cleanup best effort
          }
        }
      }
    },
  );
}
