import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sodium from 'libsodium-wrappers';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  OrgSecretsMigrationModule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';

type Secret = {
  domain: 'actions' | 'dependabot' | 'codespaces';
  name: string;
  visibility: 'all' | 'private' | 'selected';
  selected?: readonly number[];
};

function client(
  secrets: readonly Secret[],
  publicKeys: Record<string, { key_id: string; key: string }> = {},
): GitHubReadAdapter {
  return {
    async readSingle<T>(operation: ReadOperation) {
      const domain = ['actions', 'dependabot', 'codespaces'].find((item) =>
        operation.path.includes(`/${item}/secrets`),
      );
      if (domain && operation.path.endsWith('/public-key')) {
        return {
          data: publicKeys[domain] as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      const name = operation.pathParams?.secret_name;
      if (domain && operation.path.endsWith('/repositories') && name) {
        const selected =
          secrets.find(
            (secret) => secret.domain === domain && secret.name === name,
          )?.selected ?? [];
        return {
          data: { repositories: selected.map((id) => ({ id })) } as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      return {
        data: {
          secrets: secrets
            .filter((secret) => secret.domain === domain)
            .map((secret) => ({
              domain: secret.domain,
              name: secret.name,
              visibility: secret.visibility,
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

function context(
  source: readonly Secret[],
  target: readonly Secret[],
  writes: TargetWriteOperation[] = [],
  publicKeys: Record<string, { key_id: string; key: string }> = {},
): MigrationContext {
  const writeClient: TargetWriteClient = {
    async mutate(operation) {
      writes.push(operation);
      return { status: 201 };
    },
  };
  return {
    runId: 'org-secrets-test',
    scope: {
      level: 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
    },
    sourceClient: client(source),
    targetClient: client(target, publicKeys),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

describe('OrgSecretsMigrationModule', () => {
  it('discovers all three secret domains and organization visibility modes', async () => {
    const data = await new OrgSecretsMigrationModule().discover(
      context(
        [
          { domain: 'actions', name: 'ALL', visibility: 'all' },
          { domain: 'dependabot', name: 'PRIVATE', visibility: 'private' },
          {
            domain: 'codespaces',
            name: 'SELECTED',
            visibility: 'selected',
            selected: [10],
          },
        ],
        [],
      ),
    );
    assert.deepEqual(
      data.secrets.map((secret) => [
        secret.domain,
        secret.name,
        secret.visibility,
        secret.selectedRepositoryIds,
      ]),
      [
        ['actions', 'ALL', 'all', []],
        ['dependabot', 'PRIVATE', 'private', []],
        ['codespaces', 'SELECTED', 'selected', ['10']],
      ],
    );
  });

  it('maps selected source IDs and diffs target secret scopes', async () => {
    const module = new OrgSecretsMigrationModule({
      repositoryIdMap: { '10': 1010 },
    });
    const plan = await module.plan(
      context(
        [],
        [{ domain: 'dependabot', name: 'EXISTS', visibility: 'private' }],
      ),
      {
        organization: 'source-org',
        secrets: [
          {
            domain: 'actions',
            name: 'ALL',
            visibility: 'all',
            selectedRepositoryIds: [],
          },
          {
            domain: 'codespaces',
            name: 'SELECTED',
            visibility: 'selected',
            selectedRepositoryIds: ['10'],
          },
          {
            domain: 'dependabot',
            name: 'EXISTS',
            visibility: 'private',
            selectedRepositoryIds: [],
          },
        ],
      },
    );
    assert.deepEqual(
      plan.operations.map((operation) => operation.operation),
      ['create', 'create', 'noop'],
    );
    assert.deepEqual(plan.operations[1]?.payload, {
      domain: 'codespaces',
      visibility: 'selected',
      selected_repository_ids: [1010],
      valuePopulation: 'vault-or-blank',
    });
  });

  it('encrypts a blank placeholder with the target organization public key', async () => {
    await sodium.ready;
    const pair = sodium.crypto_box_keypair();
    const writes: TargetWriteOperation[] = [];
    const result = await new OrgSecretsMigrationModule().apply(
      context([], [], writes, {
        actions: {
          key_id: 'key-id',
          key: sodium.to_base64(
            pair.publicKey,
            sodium.base64_variants.ORIGINAL,
          ),
        },
      }),
      {
        moduleId: 'org-secrets',
        scopeLevel: 'organization',
        targetIdentifier: 'target-org',
        warnings: [],
        operations: [
          {
            id: 'actions-secret',
            resourceType: 'organization-secret',
            resourceName: 'EMPTY',
            operation: 'create',
            sourceState: {
              domain: 'actions',
              name: 'EMPTY',
              visibility: 'all',
              selectedRepositoryIds: [],
            },
          },
        ],
      },
    );
    assert.equal(result.status, 'complete');
    assert.equal(writes[0]?.method, 'PUT');
    const body = writes[0]?.body as { encrypted_value: string; key_id: string };
    assert.equal(body.key_id, 'key-id');
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL),
      pair.publicKey,
      pair.privateKey,
    );
    assert.equal(sodium.to_string(opened), '');
  });
});
