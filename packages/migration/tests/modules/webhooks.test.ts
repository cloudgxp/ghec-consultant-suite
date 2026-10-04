import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  WebhooksMigrationModule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';

function client(hooks: unknown[], directArray = false): GitHubReadAdapter {
  return {
    async readSingle<T>(operation: ReadOperation) {
      void operation;
      return {
        data: (directArray ? hooks : { hooks }) as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    },
    async readPage() {
      return {
        items: [],
        nextCursor: null,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    },
    async fetchAll() {
      return {
        items: [],
        complete: true,
        observedAt: new Date().toISOString(),
      };
    },
    async queryGraphQL() {
      return { data: {}, observedAt: new Date().toISOString() };
    },
  };
}

test('patches a GEI-disabled matching webhook instead of creating a duplicate (direct array response)', async () => {
  const source = [
    {
      active: true,
      events: ['push'],
      config: {
        url: 'https://example.test/hook',
        content_type: 'json',
        insecure_ssl: '0',
        secret: 'configured',
      },
    },
  ];
  const target = [
    {
      id: 99,
      active: false,
      events: ['push'],
      config: {
        url: 'https://example.test/hook',
        content_type: 'json',
        insecure_ssl: '0',
      },
    },
  ];
  const writes: TargetWriteOperation[] = [];
  const writer: TargetWriteClient = {
    async mutate(operation) {
      writes.push(operation);
      return { status: 200 };
    },
  };
  const ctx: MigrationContext = {
    runId: 'test',
    scope: {
      level: 'repository',
      sourceOrg: 'source',
      targetOrg: 'target',
      sourceRepo: 'repo',
      targetRepo: 'repo',
    },
    sourceClient: client(source, true),
    targetClient: client(target, true),
    targetWriteClient: writer,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const module = new WebhooksMigrationModule({
    secretProvider: {
      async getSecret() {
        return 'replacement';
      },
    },
  });
  const plan = await module.plan(ctx, await module.discover(ctx));
  assert.equal(plan.operations[0]?.operation, 'update');
  await module.apply(ctx, plan);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.method, 'PATCH');
  assert.equal(
    (writes[0]?.body as { config: { secret: string } }).config.secret,
    'replacement',
  );
});

test('creates a new webhook with name: web when target is missing the hook', async () => {
  const source = [
    {
      active: true,
      events: ['push', 'pull_request'],
      config: {
        url: 'https://ci.example.com/events',
        content_type: 'json',
        insecure_ssl: '0',
      },
    },
  ];
  const writes: TargetWriteOperation[] = [];
  const writer: TargetWriteClient = {
    async mutate(operation) {
      writes.push(operation);
      return { status: 201 };
    },
  };
  const ctx: MigrationContext = {
    runId: 'test',
    scope: {
      level: 'repository',
      sourceOrg: 'source',
      targetOrg: 'target',
      sourceRepo: 'repo',
      targetRepo: 'repo',
    },
    sourceClient: client(source, true),
    targetClient: client([], true),
    targetWriteClient: writer,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const module = new WebhooksMigrationModule();
  const plan = await module.plan(ctx, await module.discover(ctx));
  assert.equal(plan.operations[0]?.operation, 'create');
  await module.apply(ctx, plan);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.method, 'POST');
  assert.equal((writes[0]?.body as { name?: string }).name, 'web');
});

test('emits warning when webhook has secret but secretProvider is omitted', async () => {
  const source = [
    {
      active: true,
      events: ['push'],
      config: {
        url: 'https://example.test/secure',
        content_type: 'json',
        insecure_ssl: '0',
        secret: 'configured',
      },
    },
  ];
  const ctx: MigrationContext = {
    runId: 'test',
    scope: {
      level: 'repository',
      sourceOrg: 'source',
      targetOrg: 'target',
      sourceRepo: 'repo',
      targetRepo: 'repo',
    },
    sourceClient: client(source, true),
    targetClient: client([], true),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const module = new WebhooksMigrationModule();
  const plan = await module.plan(ctx, await module.discover(ctx));
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0]!, /has a source secret but no replacement/);
});

test('does not re-enable a webhook disabled on the source', async () => {
  const hook = {
    id: 5,
    active: false,
    events: ['issues'],
    config: {
      url: 'https://example.test/off',
      content_type: 'json',
      insecure_ssl: '0',
    },
  };
  const ctx: MigrationContext = {
    runId: 'test',
    scope: {
      level: 'repository',
      sourceOrg: 'source',
      targetOrg: 'target',
      sourceRepo: 'repo',
      targetRepo: 'repo',
    },
    sourceClient: client([hook]),
    targetClient: client([hook]),
    signal: new AbortController().signal,
    dryRun: true,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const module = new WebhooksMigrationModule();
  const plan = await module.plan(ctx, await module.discover(ctx));
  assert.equal(plan.operations[0]?.operation, 'noop');
});

test('verify detects missing and mismatched target webhooks', async () => {
  const hook = {
    id: 10,
    active: true,
    events: ['push'],
    config: {
      url: 'https://example.test/live',
      content_type: 'json',
      insecure_ssl: '0',
    },
  };
  const ctx: MigrationContext = {
    runId: 'test',
    scope: {
      level: 'repository',
      sourceOrg: 'source',
      targetOrg: 'target',
      sourceRepo: 'repo',
      targetRepo: 'repo',
    },
    sourceClient: client([hook], true),
    targetClient: client([], true), // target is missing hook
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
  const module = new WebhooksMigrationModule();
  const plan = await module.plan(ctx, await module.discover(ctx));
  const verifyResult = await module.verify(ctx, plan);
  assert.equal(verifyResult.verified, false);
  assert.equal(verifyResult.discrepancies.length, 1);
  assert.equal(verifyResult.discrepancies[0]?.actual, 'missing');
});
