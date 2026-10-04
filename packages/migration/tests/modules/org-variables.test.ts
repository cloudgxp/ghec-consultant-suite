import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import {
  OrgVariablesMigrationModule,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';

type Variable = {
  name: string;
  value: string;
  visibility: 'all' | 'private' | 'selected';
  selected?: readonly number[];
};

function readClient(variables: readonly Variable[]): GitHubReadAdapter {
  return {
    async readSingle<T>(operation: ReadOperation) {
      const name = operation.pathParams?.name;
      if (operation.path.endsWith('/repositories') && name) {
        const selected =
          variables.find((variable) => variable.name === name)?.selected ?? [];
        return {
          data: { repositories: selected.map((id) => ({ id })) } as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      return {
        data: {
          variables: variables.map((variable) => ({
            name: variable.name,
            value: variable.value,
            visibility: variable.visibility,
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
  source: readonly Variable[],
  target: readonly Variable[],
  writes: TargetWriteOperation[] = [],
): MigrationContext {
  const writeClient: TargetWriteClient = {
    async mutate(operation) {
      writes.push(operation);
      return { status: 201 };
    },
  };
  return {
    runId: 'org-variables-test',
    scope: {
      level: 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
    },
    sourceClient: readClient(source),
    targetClient: readClient(target),
    targetWriteClient: writeClient,
    signal: new AbortController().signal,
    dryRun: false,
    continueOnError: false,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

describe('OrgVariablesMigrationModule', () => {
  it('discovers all visibility modes and selected source repository IDs', async () => {
    const data = await new OrgVariablesMigrationModule().discover(
      context(
        [
          { name: 'ALL', value: 'a', visibility: 'all' },
          { name: 'PRIVATE', value: 'b', visibility: 'private' },
          {
            name: 'SELECTED',
            value: 'c',
            visibility: 'selected',
            selected: [10, 11],
          },
        ],
        [],
      ),
    );
    assert.deepEqual(
      data.variables.map((variable) => [
        variable.name,
        variable.visibility,
        variable.selectedRepositoryIds,
      ]),
      [
        ['ALL', 'all', []],
        ['PRIVATE', 'private', []],
        ['SELECTED', 'selected', ['10', '11']],
      ],
    );
  });

  it('maps selected repository IDs to target IDs and plans create, update, and noop', async () => {
    const module = new OrgVariablesMigrationModule({
      repositoryIdMap: { '10': 1010, '11': 1011 },
    });
    const ctx = context(
      [],
      [
        { name: 'PRIVATE', value: 'old', visibility: 'private' },
        { name: 'UNCHANGED', value: 'same', visibility: 'all' },
      ],
    );
    const plan = await module.plan(ctx, {
      organization: 'source-org',
      variables: [
        {
          name: 'SELECTED',
          value: 'x',
          visibility: 'selected',
          selectedRepositoryIds: ['10', '11'],
        },
        {
          name: 'PRIVATE',
          value: 'new',
          visibility: 'private',
          selectedRepositoryIds: [],
        },
        {
          name: 'UNCHANGED',
          value: 'same',
          visibility: 'all',
          selectedRepositoryIds: [],
        },
      ],
    });
    assert.deepEqual(
      plan.operations.map((operation) => operation.operation),
      ['create', 'update', 'noop'],
    );
    assert.deepEqual(plan.operations[0]?.payload, {
      name: 'SELECTED',
      value: 'x',
      visibility: 'selected',
      selected_repository_ids: [1010, 1011],
    });
    assert.equal(plan.warnings.length, 0);
  });

  it('warns instead of sending a source repository ID to the target', async () => {
    const plan = await new OrgVariablesMigrationModule().plan(context([], []), {
      organization: 'source-org',
      variables: [
        {
          name: 'SELECTED',
          value: 'x',
          visibility: 'selected',
          selectedRepositoryIds: ['10'],
        },
      ],
    });
    assert.deepEqual(plan.operations[0]?.payload, {
      name: 'SELECTED',
      value: 'x',
      visibility: 'selected',
      selected_repository_ids: [],
    });
    assert.match(plan.warnings[0] ?? '', /no target repository ID mapping/);
  });

  it('uses POST and PATCH for planned target mutations', async () => {
    const writes: TargetWriteOperation[] = [];
    const module = new OrgVariablesMigrationModule();
    const result = await module.apply(context([], [], writes), {
      moduleId: 'org-variables',
      scopeLevel: 'organization',
      targetIdentifier: 'target-org',
      warnings: [],
      operations: [
        {
          id: 'create',
          resourceType: 'organization-variable',
          resourceName: 'NEW',
          operation: 'create',
          payload: { name: 'NEW', value: '', visibility: 'all' },
        },
        {
          id: 'update',
          resourceType: 'organization-variable',
          resourceName: 'EXISTING',
          operation: 'update',
          payload: { value: '', visibility: 'private' },
        },
      ],
    });
    assert.equal(result.status, 'complete');
    assert.deepEqual(
      writes.map((write) => write.method),
      ['POST', 'PATCH'],
    );
  });
});
