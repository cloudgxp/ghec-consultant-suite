import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdaptiveRateLimiter } from '../src/index.js';

test('tracks GraphQL points and REST requests independently', () => {
  const limiter = new AdaptiveRateLimiter({ label: 'source' });
  limiter.updateGraphQL(470, '2026-10-04T12:00:00Z', 7);
  limiter.updateREST(320, 1_790_000_000);

  assert.deepEqual(limiter.getStatus('graphql'), {
    remaining: 470,
    resetAt: Date.parse('2026-10-04T12:00:00Z'),
    cost: 7,
  });
  assert.deepEqual(limiter.getStatus('rest'), {
    remaining: 320,
    resetAt: 1_790_000_000_000,
  });
  assert.equal(limiter.logPrefix, '[rate-limit:source]');
});

test('paces constrained requests and critically pauses until quota reset', async () => {
  const limiter = new AdaptiveRateLimiter();
  limiter.updateGraphQL(400);
  const releaseFirst = await limiter.acquire('graphql');
  releaseFirst();
  const startedPacing = Date.now();
  const releaseSecond = await limiter.acquire('graphql');
  releaseSecond();
  assert.ok(Date.now() - startedPacing >= 450);

  limiter.updateREST(50, Date.now() + 20);
  const startedPause = Date.now();
  const releaseCritical = await limiter.acquire('rest');
  releaseCritical();
  assert.ok(Date.now() - startedPause >= 950);
  assert.equal(limiter.getStatus('rest').remaining, 5000);
});

test('keeps tenant quotas isolated without cross-talk', () => {
  const source = new AdaptiveRateLimiter({ label: 'source' });
  const target = new AdaptiveRateLimiter({ label: 'target' });
  source.updateREST(12, 1_790_000_000);
  target.updateGraphQL(34, 1_790_000_100, 5);

  assert.equal(source.getStatus('rest').remaining, 12);
  assert.equal(source.getStatus('graphql').remaining, 5000);
  assert.equal(target.getStatus('graphql').remaining, 34);
  assert.equal(target.getStatus('rest').remaining, 5000);
});
