import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import { collector as usersCollector } from '../src/collectors/users.js';
import type { CollectorContext } from '../src/collectors/types.js';

class MockUserCollectorAdapter implements GitHubReadAdapter {
  readonly isMock = true;

  constructor(
    private readonly members: Array<{
      id: number;
      login: string;
      role?: string;
    }>,
    private readonly outsideCollaborators: Array<{ id: number; login: string }>,
  ) {}

  async fetchAll<T>(
    operation: ReadOperation,
  ): Promise<{ items: readonly T[]; observedAt: string; complete: boolean }> {
    const observedAt = new Date().toISOString();
    if (operation.path.includes('/outside_collaborators')) {
      return {
        items: this.outsideCollaborators as unknown as readonly T[],
        observedAt,
        complete: true,
      };
    }
    return {
      items: this.members as unknown as readonly T[],
      observedAt,
      complete: true,
    };
  }

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    return { data: {} as T, status: 200, observedAt: new Date().toISOString() };
  }

  async readPage<T>(): Promise<{
    items: readonly T[];
    nextCursor: string | null;
    status: number;
    observedAt: string;
  }> {
    return {
      items: [],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async queryGraphQL<T>(): Promise<{ data: T; observedAt: string }> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: {} as T, status: 200 };
  }
}

test('users collector inventories org members and outside collaborators with outsideCollaborator flag', async () => {
  const members = [
    { id: 1, login: 'alice', role: 'admin' },
    { id: 2, login: 'bob', role: 'member' },
  ];
  const outsideCollaborators = [{ id: 3, login: 'charlie-contractor' }];

  const adapter = new MockUserCollectorAdapter(members, outsideCollaborators);
  const context: CollectorContext = {
    organizationId: 'acme-corp',
    executionId: 'exec-1',
    adapter,
    signal: new AbortController().signal,
    salt: 'test-salt',
  };

  const result = await usersCollector.collect(context);
  assert.equal(result.execution.status, 'complete');
  assert.equal(result.entities.length, 3);

  const memberEntities = result.entities.filter(
    (e) => e.kind === 'identity' && e.outsideCollaborator === false,
  );
  assert.equal(memberEntities.length, 2);

  const outsideEntities = result.entities.filter(
    (e) => e.kind === 'identity' && e.outsideCollaborator === true,
  );
  assert.equal(outsideEntities.length, 1);
  assert.equal(outsideEntities[0]?.membership, 'outside');
  assert.equal(
    outsideEntities[0]?.provenance?.operation,
    'rest.orgs.list-outside-collaborators',
  );
});
