import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sodium from 'libsodium-wrappers';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  RepoSecretsMigrationModule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
  type SecretValueProvider,
} from '../../src/index.js';

type SecretState = Record<string, readonly string[]>;

function secretDomain(path: string): string | undefined {
  return ['actions', 'dependabot', 'codespaces'].find((domain) =>
    path.includes(`/${domain}/secrets`),
  );
}

function createReadClient(
  secrets: SecretState,
  publicKeys: Record<string, { key_id: string; key: string }> = {},
): GitHubReadAdapter {
  return {
    async readSingle<T>(operation: ReadOperation) {
      const domain = secretDomain(operation.path);
      if (domain && operation.path.endsWith('/public-key')) {
        return {
          data: publicKeys[domain] as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      const names = domain ? (secrets[domain] ?? []) : [];
      return {
        data: {
          total_count: names.length,
          secrets: names.map((name) => ({
            name,
            updated_at: '2026-10-04T00:00:00Z',
          })),
        } as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    },
    async readPage() {
      return {
        items: [],
        nextCursor: null,
        observedAt: new Date().toISOString(),
        status: 200,
      };
    },
    async fetchAll() {
      return {
        items: [],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    },
    async queryGraphQL() {
      return { data: {}, observedAt: new Date().toISOString() };
    },
  };
}

function context(
  options: {
    source?: SecretState;
    target?: SecretState;
    publicKeys?: Record<string, { key_id: string; key: string }>;
    writes?: TargetWriteOperation[];
    secretValueProvider?: SecretValueProvider;
  } = {},
): MigrationContext {
  const writes = options.writes ?? [];
  const writeClient: TargetWriteClient = {
    async mutate(operation) {
      writes.push(operation);
      return { status: 201, data: {} };
    },
  };
  return {
    runId: 'repo-secrets-test',
    scope: {
      level: 'repository',
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
      sourceRepo: 'sample-repo',
      targetRepo: 'sample-repo',
    },
    sourceClient: createReadClient(options.source ?? {}),
    targetClient: createReadClient(options.target ?? {}, options.publicKeys),
    targetWriteClient: writeClient,
    secretValueProvider: options.secretValueProvider,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

describe('RepoSecretsMigrationModule', () => {
  const module = new RepoSecretsMigrationModule();

  it('discovers Actions, Dependabot, and Codespaces secret names without values', async () => {
    const data = await module.discover(
      context({
        source: {
          actions: ['ACTION_TOKEN'],
          dependabot: ['DEPENDABOT_TOKEN'],
          codespaces: ['CODESPACE_TOKEN'],
        },
      }),
    );

    assert.deepEqual(data.secrets, [
      {
        domain: 'actions',
        name: 'ACTION_TOKEN',
        updatedAt: '2026-10-04T00:00:00Z',
      },
      {
        domain: 'dependabot',
        name: 'DEPENDABOT_TOKEN',
        updatedAt: '2026-10-04T00:00:00Z',
      },
      {
        domain: 'codespaces',
        name: 'CODESPACE_TOKEN',
        updatedAt: '2026-10-04T00:00:00Z',
      },
    ]);
    assert.equal(JSON.stringify(data).includes('encrypted_value'), false);
  });

  it('plans creates for missing names and noops for names already present', async () => {
    const plan = await module.plan(
      context({ target: { actions: ['EXISTS'] } }),
      {
        repo: 'sample-repo',
        secrets: [
          { domain: 'actions', name: 'MISSING' },
          { domain: 'actions', name: 'EXISTS' },
          { domain: 'dependabot', name: 'DEPENDABOT_MISSING' },
        ],
      },
    );

    assert.deepEqual(
      plan.operations.map((operation) => operation.operation),
      ['create', 'noop', 'create'],
    );
    assert.equal(plan.warnings.length, 2);
    assert.equal(JSON.stringify(plan).includes('encrypted_value'), false);
  });

  it('encrypts a blank placeholder with the target public key and never sends plaintext', async () => {
    await sodium.ready;
    const keyPair = sodium.crypto_box_keypair();
    const key = sodium.to_base64(
      keyPair.publicKey,
      sodium.base64_variants.ORIGINAL,
    );
    const writes: TargetWriteOperation[] = [];
    const result = await module.apply(
      context({
        publicKeys: {
          actions: { key_id: 'public-key-id', key },
        },
        writes,
      }),
      {
        moduleId: 'repo-secrets',
        scopeLevel: 'repository',
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-secrets:sample-repo:actions:EMPTY_PLACEHOLDER',
            resourceType: 'secret',
            resourceName: 'EMPTY_PLACEHOLDER',
            operation: 'create',
            sourceState: { domain: 'actions', name: 'EMPTY_PLACEHOLDER' },
            payload: { domain: 'actions', valuePopulation: 'vault-or-blank' },
          },
        ],
      },
    );

    assert.equal(result.status, 'complete');
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.method, 'PUT');
    assert.equal(
      writes[0]?.path,
      '/repos/{owner}/{repo}/actions/secrets/{secret_name}',
    );
    const body = writes[0]?.body as { encrypted_value: string; key_id: string };
    assert.equal(body.key_id, 'public-key-id');
    assert.notEqual(body.encrypted_value, '');
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL),
      keyPair.publicKey,
      keyPair.privateKey,
    );
    assert.equal(sodium.to_string(opened), '');
  });

  it('reports target secret names missing during verification', async () => {
    const verification = await module.verify(
      context({ target: { actions: ['PRESENT'] } }),
      {
        moduleId: 'repo-secrets',
        scopeLevel: 'repository',
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-secrets:sample-repo:codespaces:MISSING',
            resourceType: 'secret',
            resourceName: 'MISSING',
            operation: 'create',
            sourceState: { domain: 'codespaces', name: 'MISSING' },
          },
        ],
      },
    );

    assert.equal(verification.verified, false);
    assert.equal(
      verification.discrepancies[0]?.resourceName,
      'codespaces:MISSING',
    );
  });

  it('uses a client vault value only during apply', async () => {
    await sodium.ready;
    const keyPair = sodium.crypto_box_keypair();
    const writes: TargetWriteOperation[] = [];
    let vaultCalls = 0;
    await module.apply(
      context({
        publicKeys: {
          dependabot: {
            key_id: 'dependabot-key',
            key: sodium.to_base64(
              keyPair.publicKey,
              sodium.base64_variants.ORIGINAL,
            ),
          },
        },
        writes,
        secretValueProvider: {
          async getSecretValue(input) {
            vaultCalls++;
            assert.equal(input.domain, 'dependabot');
            return String.fromCharCode(0);
          },
        },
      }),
      {
        moduleId: 'repo-secrets',
        scopeLevel: 'repository',
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-secrets:sample-repo:dependabot:VAULTED',
            resourceType: 'secret',
            resourceName: 'VAULTED',
            operation: 'create',
            sourceState: { domain: 'dependabot', name: 'VAULTED' },
          },
        ],
      },
    );

    const body = writes[0]?.body as { encrypted_value: string };
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL),
      keyPair.publicKey,
      keyPair.privateKey,
    );
    assert.equal(vaultCalls, 1);
    assert.equal(opened.length, 1);
  });
});
