import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OrgCustomPropertiesMigrationModule,
  RepoCustomPropertiesMigrationModule,
  createDefaultModuleRegistry,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadPage,
} from '@ghec/github-client';

class MockReadAdapter implements GitHubReadAdapter {
  constructor(
    private readonly responseData: unknown = {},
    private readonly status = 200,
  ) {}

  async readSingle<T>(): Promise<{
    data: T;
    status: number;
    observedAt: string;
  }> {
    if (this.status >= 400) {
      throw new Error(`HTTP ${this.status}`);
    }
    return {
      data: this.responseData as T,
      status: this.status,
      observedAt: new Date().toISOString(),
    };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    return {
      items: [],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(): Promise<{
    items: readonly T[];
    observedAt: string;
    complete: boolean;
  }> {
    return { items: [], observedAt: new Date().toISOString(), complete: true };
  }

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  constructor(
    private readonly statusSequence: number[] = [200],
    private readonly responseData: unknown = {},
  ) {}

  async mutate<T = unknown>(
    operation: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(operation);
    const status = this.statusSequence.shift() ?? 200;
    return { status, data: this.responseData as T };
  }
}

function createMockContext(
  options: {
    sourceData?: unknown;
    targetData?: unknown;
    writeClient?: TargetWriteClient;
    level?: 'organization' | 'repository';
    dryRun?: boolean;
  } = {},
): MigrationContext {
  return {
    runId: 'run-custom-props-123',
    scope: {
      level: options.level ?? 'organization',
      sourceOrg: 'source-org',
      targetOrg: 'target-org',
      sourceRepo: 'sample-repo',
      targetRepo: 'sample-repo',
    },
    sourceClient: new MockReadAdapter(options.sourceData),
    targetClient: new MockReadAdapter(options.targetData),
    targetWriteClient: options.writeClient ?? new MockWriteClient(),
    signal: new AbortController().signal,
    dryRun: options.dryRun ?? false,
    continueOnError: true,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

describe('Custom Properties Migration Modules (Task 026)', () => {
  describe('OrgCustomPropertiesMigrationModule', () => {
    it('discovers custom property schemas from source organization', async () => {
      const mockSchemas = {
        properties: [
          {
            property_name: 'environment',
            value_type: 'single_select',
            required: true,
            default_value: 'production',
            allowed_values: ['production', 'staging', 'development'],
          },
        ],
      };

      const ctx = createMockContext({
        sourceData: mockSchemas,
        level: 'organization',
      });
      const module = new OrgCustomPropertiesMigrationModule();
      const discovered = await module.discover(ctx);

      assert.equal(discovered.organization, 'source-org');
      assert.equal(discovered.definitions.length, 1);
      assert.equal(discovered.definitions[0]?.propertyName, 'environment');
      assert.equal(discovered.definitions[0]?.valueType, 'single_select');
      assert.equal(discovered.definitions[0]?.required, true);
    });

    it('plans create and noop operations based on target schema state', async () => {
      const sourceData = {
        organization: 'source-org',
        definitions: [
          {
            propertyName: 'service-tier',
            valueType: 'string' as const,
            required: false,
            allowedValues: [],
          },
          {
            propertyName: 'compliance',
            valueType: 'true_false' as const,
            required: true,
            allowedValues: [],
          },
        ],
      };

      const targetData = {
        properties: [
          {
            property_name: 'compliance',
            value_type: 'true_false',
            required: true,
            allowed_values: [],
          },
        ],
      };

      const ctx = createMockContext({ targetData, level: 'organization' });
      const module = new OrgCustomPropertiesMigrationModule();
      const plan = await module.plan(ctx, sourceData);

      assert.equal(plan.moduleId, 'org-custom-properties');
      assert.equal(plan.operations.length, 2);
      const createOp = plan.operations.find(
        (op) => op.resourceName === 'service-tier',
      );
      const noopOp = plan.operations.find(
        (op) => op.resourceName === 'compliance',
      );
      assert.equal(createOp?.operation, 'create');
      assert.equal(noopOp?.operation, 'noop');
    });

    it('applies schema mutations via PUT against target organization', async () => {
      const writeClient = new MockWriteClient([200]);
      const ctx = createMockContext({ writeClient, level: 'organization' });
      const module = new OrgCustomPropertiesMigrationModule();

      const plan = {
        moduleId: 'org-custom-properties',
        scopeLevel: 'organization' as const,
        targetIdentifier: 'target-org',
        warnings: [],
        operations: [
          {
            id: 'op-prop-create',
            resourceType: 'custom-property-schema',
            resourceName: 'cost-center',
            operation: 'create' as const,
            payload: {
              propertyName: 'cost-center',
              valueType: 'string',
              required: false,
            },
          },
        ],
      };

      const result = await module.apply(ctx, plan);
      assert.equal(result.status, 'complete');
      assert.equal(writeClient.calls.length, 1);
      assert.equal(writeClient.calls[0]?.method, 'PUT');
      assert.equal(writeClient.calls[0]?.path, '/orgs/{org}/properties/schema');
    });

    it('verifies custom property schemas against planned state', async () => {
      const targetData = {
        properties: [
          {
            property_name: 'cost-center',
            value_type: 'string',
            required: false,
            allowed_values: [],
          },
        ],
      };

      const ctx = createMockContext({ targetData, level: 'organization' });
      const module = new OrgCustomPropertiesMigrationModule();

      const plan = {
        moduleId: 'org-custom-properties',
        scopeLevel: 'organization' as const,
        targetIdentifier: 'target-org',
        warnings: [],
        operations: [
          {
            id: 'op-prop-create',
            resourceType: 'custom-property-schema',
            resourceName: 'cost-center',
            operation: 'create' as const,
            sourceState: {
              propertyName: 'cost-center',
              valueType: 'string',
              required: false,
              allowedValues: [],
            },
            payload: {
              propertyName: 'cost-center',
              valueType: 'string',
              required: false,
              allowedValues: [],
            },
          },
        ],
      };

      const verification = await module.verify(ctx, plan);
      assert.equal(verification.verified, true);
      assert.equal(verification.discrepancies.length, 0);
    });
  });

  describe('RepoCustomPropertiesMigrationModule', () => {
    it('discovers custom property values from source repository', async () => {
      const mockValues = {
        properties: [
          { property_name: 'environment', value: 'production' },
          { property_name: 'cost-center', value: 'finance-101' },
        ],
      };

      const ctx = createMockContext({
        sourceData: mockValues,
        level: 'repository',
      });
      const module = new RepoCustomPropertiesMigrationModule();
      const discovered = await module.discover(ctx);

      assert.equal(discovered.repository, 'sample-repo');
      assert.equal(discovered.values.length, 2);
      assert.equal(discovered.values[0]?.propertyName, 'environment');
      assert.equal(discovered.values[0]?.value, 'production');
    });

    it('plans batch update operation for modified custom property values', async () => {
      const sourceData = {
        repository: 'sample-repo',
        values: [
          { propertyName: 'environment', value: 'production' },
          { propertyName: 'team', value: 'backend' },
        ],
      };

      const targetData = {
        properties: [
          { property_name: 'environment', value: 'production' },
          // 'team' is missing or different
        ],
      };

      const ctx = createMockContext({ targetData, level: 'repository' });
      const module = new RepoCustomPropertiesMigrationModule();
      const plan = await module.plan(ctx, sourceData);

      assert.equal(plan.moduleId, 'repo-custom-properties');
      assert.equal(plan.operations.length, 1);
      assert.equal(plan.operations[0]?.operation, 'update');
      const payload = plan.operations[0]?.payload as {
        repository_names: string[];
        properties: Array<{ property_name: string; value: unknown }>;
      };
      assert.deepEqual(payload.repository_names, ['sample-repo']);
      assert.equal(payload.properties.length, 1);
      assert.equal(payload.properties[0]?.property_name, 'team');
    });

    it('applies batch repository property values via PATCH against organization', async () => {
      const writeClient = new MockWriteClient([200]);
      const ctx = createMockContext({ writeClient, level: 'repository' });
      const module = new RepoCustomPropertiesMigrationModule();

      const plan = {
        moduleId: 'repo-custom-properties',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-custom-properties:sample-repo',
            resourceType: 'custom-property-values',
            resourceName: 'sample-repo',
            operation: 'update' as const,
            payload: {
              repository_names: ['sample-repo'],
              properties: [{ property_name: 'tier', value: 'gold' }],
            },
          },
        ],
      };

      const result = await module.apply(ctx, plan);
      assert.equal(result.status, 'complete');
      assert.equal(writeClient.calls.length, 1);
      assert.equal(writeClient.calls[0]?.method, 'PATCH');
      assert.equal(writeClient.calls[0]?.path, '/orgs/{org}/properties/values');
    });

    it('verifies repository custom property values against planned state', async () => {
      const targetData = {
        properties: [{ property_name: 'tier', value: 'gold' }],
      };

      const ctx = createMockContext({ targetData, level: 'repository' });
      const module = new RepoCustomPropertiesMigrationModule();

      const plan = {
        moduleId: 'repo-custom-properties',
        scopeLevel: 'repository' as const,
        targetIdentifier: 'target-org/sample-repo',
        warnings: [],
        operations: [
          {
            id: 'repo-custom-properties:sample-repo',
            resourceType: 'custom-property-values',
            resourceName: 'sample-repo',
            operation: 'update' as const,
            payload: {
              repository_names: ['sample-repo'],
              properties: [{ property_name: 'tier', value: 'gold' }],
            },
          },
        ],
      };

      const verification = await module.verify(ctx, plan);
      assert.equal(verification.verified, true);
      assert.equal(verification.discrepancies.length, 0);
    });
  });

  describe('Registry Integration', () => {
    it('registers both modules in default ModuleRegistry with expected dependencies', () => {
      const registry = createDefaultModuleRegistry();
      const orgMod = registry.get('org-custom-properties');
      const repoMod = registry.get('repo-custom-properties');

      assert.ok(orgMod);
      assert.equal(orgMod?.scopeLevel, 'organization');
      assert.deepEqual(orgMod?.dependencies, []);

      assert.ok(repoMod);
      assert.equal(repoMod?.scopeLevel, 'repository');
      assert.deepEqual(repoMod?.dependencies, [
        'gei-repo',
        'org-custom-properties',
      ]);
    });
  });
});
