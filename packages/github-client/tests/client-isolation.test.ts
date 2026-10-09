import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGitHubDualClient, type ReadOperation } from '../src/index.js';

test('rejects shared source and target credentials', () => {
  const sharedToken = `ghp_${'a'.repeat(32)}`;
  assert.throws(
    () =>
      createGitHubDualClient({
        source: { token: sharedToken },
        target: { token: sharedToken },
      }),
    /must not share the same credential/,
  );
});

test('permits shared credentials when allowSameCredential is set or env var is present', () => {
  const sharedToken = `ghp_${'a'.repeat(32)}`;
  assert.doesNotThrow(() =>
    createGitHubDualClient({
      source: { token: sharedToken },
      target: { token: sharedToken },
      allowSameCredential: true,
    }),
  );
});

test('builds isolated tenant clients and never permits writes through the source client', async () => {
  const requests: Array<{ method?: string; url: string }> = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    requests.push({ method: init?.method, url: String(url) });
    return new Response(JSON.stringify({ name: 'api' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const clients = createGitHubDualClient({
    source: { token: `ghp_${'s'.repeat(32)}`, fetchImpl },
    target: { token: `ghp_${'t'.repeat(32)}`, fetchImpl },
  });
  const operation: ReadOperation = {
    id: 'rest.repos.get',
    transport: 'rest',
    verifiedReadOnly: true,
    path: '/repos/acme/api',
  };

  await clients.sourceClient.readPage(
    operation,
    null,
    new AbortController().signal,
  );
  assert.notEqual(clients.sourceRateLimiter, clients.targetRateLimiter);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, 'GET');
  assert.equal('create' in clients.sourceClient, false);
  assert.equal('update' in clients.sourceClient, false);
  assert.equal('delete' in clients.sourceClient, false);
});
