import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertReadOnlyGraphQL,
  HttpGitHubReadAdapter,
  type ReadOperation,
} from '../src/index.js';

const signal = new AbortController().signal;
const operation: ReadOperation = {
  id: 'rest.repos.get',
  transport: 'rest',
  verifiedReadOnly: true,
  path: '/repos/acme/api',
};

test('rejects unverified REST operations and GraphQL mutations before network access', async () => {
  let requests = 0;
  const adapter = new HttpGitHubReadAdapter({
    fetchImpl: async () => {
      requests++;
      return new Response('{}', { status: 200 });
    },
  });

  const unverified = {
    ...operation,
    verifiedReadOnly: false,
  } as unknown as ReadOperation;
  await assert.rejects(
    adapter.readPage(unverified, null, signal),
    /verifiedReadOnly/,
  );
  assert.throws(() =>
    assertReadOnlyGraphQL(
      'mutation { createRepository(input: {}) { clientMutationId } }',
    ),
  );
  assert.throws(() =>
    assertReadOnlyGraphQL(
      'query { viewer { login } } , mutation { createRepository(input: {}) { clientMutationId } }',
    ),
  );
  assert.throws(() => assertReadOnlyGraphQL('subscription { ping }'));
  assert.throws(
    () => assertReadOnlyGraphQL('not valid graphql {{{'),
    /GraphQL validation failed/,
  );
  assert.doesNotThrow(() =>
    assertReadOnlyGraphQL('query { viewer { login } }'),
  );
  assert.equal(requests, 0);
});

test('uses GET for REST reads and returns non-retry HTTP errors without loops', async () => {
  for (const status of [400, 401, 403, 404, 422]) {
    let requests = 0;
    const adapter = new HttpGitHubReadAdapter({
      fetchImpl: async (_url, init) => {
        requests++;
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({ message: 'not retryable' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    const page = await adapter.readPage<{ name: string }>(
      operation,
      null,
      signal,
    );
    assert.equal(page.status, status);
    assert.deepEqual(page.items, []);
    assert.equal(requests, 1);
  }
});

test('retries transient 429 and 503 responses before succeeding', async () => {
  for (const status of [429, 503]) {
    let requests = 0;
    const adapter = new HttpGitHubReadAdapter({
      maxAttempts: 2,
      fetchImpl: async () => {
        requests++;
        if (requests === 1) {
          return new Response(JSON.stringify({ message: 'temporary' }), {
            status,
            headers: {
              'retry-after': '0',
              'Content-Type': 'application/json',
            },
          });
        }
        return new Response(JSON.stringify({ name: 'api' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const page = await adapter.readPage<{ name: string }>(
      operation,
      null,
      signal,
    );
    assert.equal(page.status, 200, `HTTP ${status}`);
    assert.equal(page.items[0]?.name, 'api');
    assert.equal(requests, 2, `HTTP ${status}`);
  }
});

test('readSingle preserves both JSON array and JSON object responses without unwrapping arrays', async () => {
  const arrayAdapter = new HttpGitHubReadAdapter({
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          { id: 101, name: 'ruleset-a' },
          { id: 102, name: 'ruleset-b' },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  });

  const arrayRes = await arrayAdapter.readSingle<
    Array<{ id: number; name: string }>
  >(
    {
      id: 'rest.rulesets.list-repository',
      transport: 'rest',
      verifiedReadOnly: true,
      path: '/repos/acme/api/rulesets',
    },
    signal,
  );
  assert.equal(arrayRes.status, 200);
  assert.equal(Array.isArray(arrayRes.data), true);
  assert.equal(arrayRes.data.length, 2);
  assert.equal(arrayRes.data[0]?.name, 'ruleset-a');
  assert.equal(arrayRes.data[1]?.name, 'ruleset-b');

  const emptyArrayAdapter = new HttpGitHubReadAdapter({
    fetchImpl: async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  const emptyRes = await emptyArrayAdapter.readSingle<unknown[]>(
    operation,
    signal,
  );
  assert.equal(emptyRes.status, 200);
  assert.deepEqual(emptyRes.data, []);
});
