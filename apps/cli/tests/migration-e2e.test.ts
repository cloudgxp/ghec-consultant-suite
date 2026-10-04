import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { HttpGitHubReadAdapter } from '@ghec/github-client';
import type { TargetWriteClient, TargetWriteOperation } from '@ghec/migration';
import { runCli } from '../src/index.js';

async function server(variables: Map<string, string>) {
  const mutations: string[] = [];
  let reads = 0;
  const instance = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = url.pathname.match(
      /^\/repos\/[^/]+\/[^/]+\/actions\/variables(?:\/([^/]+))?$/,
    );
    if (!match) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'GET') {
      reads++;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          total_count: variables.size,
          variables: [...variables].map(([name, value]) => ({ name, value })),
        }),
      );
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body) as { name?: string; value?: string };
    const name = match[1] ?? input.name;
    if (!name || input.value === undefined) {
      response.writeHead(400).end();
      return;
    }
    variables.set(name, input.value);
    mutations.push(`${request.method}:${name}`);
    response.writeHead(request.method === 'POST' ? 201 : 200).end('{}');
  });
  await new Promise<void>((resolve) =>
    instance.listen(0, '127.0.0.1', resolve),
  );
  const address = instance.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    mutations,
    get reads() {
      return reads;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        instance.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test('CLI cached plan, apply, and verify use local HTTP clients without source reads', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ghec-cli-e2e-'));
  const source = await server(new Map([['LIVE_ONLY', 'source']]));
  const target = await server(new Map([['CACHED_UPDATE', 'stale']]));
  try {
    const scopePath = fileURLToPath(
      new URL('../../../fixtures/migration/sample-scope.json', import.meta.url),
    );
    const bundlePath = fileURLToPath(
      new URL(
        '../../../fixtures/migration/sample-discovery.json',
        import.meta.url,
      ),
    );
    const planPath = join(root, 'migration-plan.json');
    const executionPath = join(root, 'execution.json');
    const verificationPath = join(root, 'verification.json');
    const sourceClient = new HttpGitHubReadAdapter({
      baseUrl: source.baseUrl,
      token: 'source-token',
    });
    const targetClient = new HttpGitHubReadAdapter({
      baseUrl: target.baseUrl,
      token: 'target-token',
    });
    const targetWriteClient: TargetWriteClient = {
      mutate: async (operation: TargetWriteOperation, signal) => {
        const response = await fetch(
          `${target.baseUrl}${operation.path
            .replace('{owner}', 'fictional-target')
            .replace('{repo}', 'fictional-demo')
            .replace('{name}', operation.pathParams?.name ?? '')}`,
          {
            method: operation.method,
            signal,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(operation.body),
          },
        );
        return { status: response.status, data: await response.json() };
      },
    };
    assert.equal(
      await runCli(
        [
          'plan',
          '--scope',
          scopePath,
          '--input',
          bundlePath,
          '--output',
          planPath,
        ],
        { sourceClient, targetClient },
      ),
      0,
    );
    assert.equal(source.reads, 0);
    assert.deepEqual(JSON.parse(readFileSync(planPath, 'utf8')).summary, {
      create: 1,
      update: 1,
      noop: 0,
      skip: 0,
      warn: 0,
    });
    assert.equal(
      await runCli(['migrate', '--plan', planPath, '--output', executionPath], {
        sourceClient,
        targetClient,
        targetWriteClient,
      }),
      0,
    );
    assert.deepEqual(target.mutations, [
      'POST:CACHED_CREATE',
      'PATCH:CACHED_UPDATE',
    ]);
    assert.equal(
      await runCli(
        [
          'verify',
          '--scope',
          scopePath,
          '--plan',
          planPath,
          '--output',
          verificationPath,
        ],
        { sourceClient, targetClient },
      ),
      0,
    );
    assert.equal(
      await runCli(
        [
          'migrate',
          '--scope',
          scopePath,
          '--modules',
          'repo-variables',
          '--output',
          join(root, 'live-execution.json'),
        ],
        { sourceClient, targetClient, targetWriteClient },
      ),
      0,
    );
    assert.equal(target.mutations.includes('POST:LIVE_ONLY'), true);
    assert.ok(source.reads > 0);
    const idempotentPlanPath = join(root, 'idempotent-plan.json');
    assert.equal(
      await runCli(
        [
          'plan',
          '--scope',
          scopePath,
          '--modules',
          'repo-variables',
          '--output',
          idempotentPlanPath,
        ],
        { sourceClient, targetClient },
      ),
      0,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(idempotentPlanPath, 'utf8')).summary,
      { create: 0, update: 0, noop: 1, skip: 0, warn: 0 },
    );
    const mutationsBeforeNoop = target.mutations.length;
    assert.equal(
      await runCli(
        [
          'migrate',
          '--plan',
          idempotentPlanPath,
          '--output',
          join(root, 'idempotent-execution.json'),
        ],
        { sourceClient, targetClient, targetWriteClient },
      ),
      0,
    );
    assert.equal(target.mutations.length, mutationsBeforeNoop);
    assert.equal(
      await runCli(
        [
          'migrate',
          '--plan',
          idempotentPlanPath,
          '--output',
          join(root, 'idempotent-reexecution.json'),
        ],
        { sourceClient, targetClient, targetWriteClient },
      ),
      0,
    );
    assert.equal(target.mutations.length, mutationsBeforeNoop);
    assert.equal(
      JSON.parse(readFileSync(verificationPath, 'utf8')).summary
        .discrepancyCount,
      0,
    );
  } finally {
    await source.close();
    await target.close();
    rmSync(root, { recursive: true, force: true });
  }
});
