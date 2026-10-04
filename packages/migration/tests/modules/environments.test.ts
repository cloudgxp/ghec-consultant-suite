import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sodium from 'libsodium-wrappers';
import type { GitHubReadAdapter, ReadOperation } from '@ghec/github-client';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  EnvironmentsMigrationModule,
  createDefaultModuleRegistry,
  IdentityMappingEngine,
  type MigrationContext,
  type TargetWriteClient,
  type TargetWriteOperation,
  type SecretValueProvider,
  type EnvironmentDefinition,
} from '../../src/index.js';

interface MockEnvStore {
  environments: Array<{
    name: string;
    wait_timer?: number;
    prevent_self_review?: boolean;
    reviewers?: Array<{
      type: 'User' | 'Team';
      reviewer: { id: number; login?: string; slug?: string };
    }>;
    deployment_branch_policy?: {
      protected_branches: boolean;
      custom_branch_policies: boolean;
    } | null;
  }>;
  branchPolicies?: Record<
    string,
    Array<{ id: number; name: string; type?: 'branch' | 'tag' }>
  >;
  variables?: Record<string, Array<{ name: string; value: string }>>;
  secrets?: Record<string, Array<{ name: string }>>;
  publicKeys?: Record<string, { key_id: string; key: string }>;
}

function createMockReadClient(store: MockEnvStore): GitHubReadAdapter {
  return {
    async readSingle<T>(operation: ReadOperation) {
      const path = operation.path;
      const envName =
        (operation.pathParams?.environment_name as string | undefined) ?? '';

      // 1. GET /repos/{owner}/{repo}/environments/{env}/secrets/public-key
      if (path.includes('/secrets/public-key')) {
        const pk = store.publicKeys?.[envName] ?? {
          key_id: `key-${envName}`,
          key: 'fake-base64-key',
        };
        return {
          data: pk as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }

      // 2. GET /repos/{owner}/{repo}/environments/{env}/secrets
      if (path.endsWith('/secrets')) {
        const secs = store.secrets?.[envName] ?? [];
        return {
          data: { total_count: secs.length, secrets: secs } as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }

      // 3. GET /repos/{owner}/{repo}/environments/{env}/variables
      if (path.endsWith('/variables')) {
        const vars = store.variables?.[envName] ?? [];
        return {
          data: { total_count: vars.length, variables: vars } as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }

      // 4. GET /repos/{owner}/{repo}/environments/{env}/deployment-branch-policies
      if (path.endsWith('/deployment-branch-policies')) {
        const bps = store.branchPolicies?.[envName] ?? [];
        return {
          data: { total_count: bps.length, branch_policies: bps } as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }

      // 5. GET /repos/{owner}/{repo}/environments
      if (path.endsWith('/environments')) {
        const formatted = store.environments.map((e, idx) => ({
          id: idx + 1,
          name: e.name,
          protection_rules: [
            ...(e.wait_timer !== undefined
              ? [
                  {
                    id: idx * 10 + 1,
                    type: 'wait_timer',
                    wait_timer: e.wait_timer,
                  },
                ]
              : []),
            ...(e.reviewers || e.prevent_self_review !== undefined
              ? [
                  {
                    id: idx * 10 + 2,
                    type: 'required_reviewers',
                    prevent_self_review: e.prevent_self_review ?? false,
                    reviewers: e.reviewers ?? [],
                  },
                ]
              : []),
          ],
          deployment_branch_policy: e.deployment_branch_policy,
        }));
        return {
          data: { total_count: formatted.length, environments: formatted } as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }

      return {
        data: {} as T,
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

function createTestContext(options: {
  sourceStore?: MockEnvStore;
  targetStore?: MockEnvStore;
  writes?: TargetWriteOperation[];
  mutateHandler?: (
    op: TargetWriteOperation,
  ) => Promise<{ status: number; data?: unknown }>;
  secretValueProvider?: SecretValueProvider;
  dryRun?: boolean;
  continueOnError?: boolean;
}): MigrationContext {
  const writes = options.writes ?? [];
  const writeClient: TargetWriteClient = {
    async mutate(op) {
      writes.push(op);
      if (options.mutateHandler) {
        return options.mutateHandler(op);
      }
      return { status: 200, data: {} };
    },
  };

  return {
    runId: 'environments-test-run',
    scope: {
      level: 'repository',
      sourceOrg: 'source-corp',
      targetOrg: 'target-corp',
      sourceRepo: 'app-service',
      targetRepo: 'app-service',
    },
    sourceClient: createMockReadClient(
      options.sourceStore ?? { environments: [] },
    ),
    targetClient: createMockReadClient(
      options.targetStore ?? { environments: [] },
    ),
    targetWriteClient: writeClient,
    secretValueProvider: options.secretValueProvider,
    signal: new AbortController().signal,
    dryRun: options.dryRun ?? false,
    continueOnError: options.continueOnError ?? true,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

describe('EnvironmentsMigrationModule', () => {
  it('registers in ModuleRegistry and preserves topological execution dependencies', () => {
    const registry = createDefaultModuleRegistry();
    assert.equal(registry.has('environments'), true);

    const mod = registry.getOrThrow('environments');
    assert.equal(mod.id, 'environments');
    assert.equal(
      mod.displayName,
      'Deployment Environments, Variables & Protection Rules',
    );
    assert.equal(mod.scopeLevel, 'repository');
    assert.deepEqual(mod.dependencies, ['gei-repo']);

    const executionPlan = registry.resolveExecutionPlan(['environments']);
    const ids = executionPlan.map((m) => m.id);
    assert.ok(ids.indexOf('gei-repo') < ids.indexOf('environments'));
  });

  it('discovers environments, protection rules, variables, and secrets in live mode', async () => {
    const module = new EnvironmentsMigrationModule();
    const sourceStore: MockEnvStore = {
      environments: [
        {
          name: 'production',
          wait_timer: 15,
          prevent_self_review: true,
          reviewers: [
            {
              type: 'User',
              reviewer: { id: 101, login: 'octocat' },
            },
            {
              type: 'Team',
              reviewer: { id: 201, slug: 'release-managers' },
            },
          ],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true,
          },
        },
      ],
      branchPolicies: {
        production: [{ id: 1, name: 'main', type: 'branch' }],
      },
      variables: {
        production: [{ name: 'DEPLOY_REGION', value: 'us-east-1' }],
      },
      secrets: {
        production: [{ name: 'API_KEY' }],
      },
    };

    const ctx = createTestContext({ sourceStore });
    const discovered = await module.discover(ctx);

    assert.equal(discovered.repo, 'app-service');
    assert.equal(discovered.environments.length, 1);
    const env = discovered.environments[0]!;
    assert.equal(env.name, 'production');
    assert.equal(env.waitTimer, 15);
    assert.equal(env.preventSelfReview, true);
    assert.equal(env.reviewers?.length, 2);
    assert.equal(env.customBranchPolicies?.length, 1);
    assert.equal(env.customBranchPolicies[0]?.name, 'main');
    assert.equal(env.variables?.length, 1);
    assert.equal(env.variables[0]?.name, 'DEPLOY_REGION');
    assert.equal(env.variables[0]?.value, 'us-east-1');
    assert.equal(env.secrets?.length, 1);
    assert.equal(env.secrets[0]?.name, 'API_KEY');
  });

  it('discovers environments from cached DiscoveryBundle without network calls', async () => {
    const module = new EnvironmentsMigrationModule();
    const bundle: DiscoveryBundle = {
      schemaVersion: '1.0.0',
      generatedAt: '2026-10-04T00:00:00Z',
      producer: { name: 'ghec-discovery', version: '0.1.0' },
      entities: [
        {
          id: 'repo-10',
          kind: 'repository',
          name: 'app-service',
          description: null,
          url: 'https://github.com/source-corp/app-service',
          visibility: 'private',
          isFork: false,
          isArchived: false,
          defaultBranch: 'main',
          primaryLanguage: 'TypeScript',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          pushedAt: '2026-01-01T00:00:00Z',
          sizeInKb: 100,
          stargazerCount: 0,
          watcherCount: 0,
          forkCount: 0,
          openIssueCount: 0,
          openPullRequestCount: 0,
        },
        {
          id: 'env-prod',
          kind: 'action-environment',
          name: 'production',
          repositoryId: 'repo-10',
          protectionRuleCount: 1,
          reviewerCount: 2,
          deploymentBranchPolicy: 'protected',
        },
        {
          id: 'var-1',
          kind: 'configuration-metadata',
          domain: 'actions',
          configurationKind: 'variable',
          name: 'PORT',
          level: 'environment',
          repositoryId: 'repo-10',
          environmentName: 'production',
          parentId: null,
          accessMode: 'all_repositories',
          selectedRepositoryIds: [],
          selectedRepositoryCount: 0,
          createdAt: null,
          updatedAt: null,
        },
        {
          id: 'sec-1',
          kind: 'configuration-metadata',
          domain: 'environment',
          configurationKind: 'secret',
          name: 'PROD_TOKEN',
          level: 'environment',
          repositoryId: 'repo-10',
          environmentName: 'production',
          parentId: null,
          accessMode: 'all_repositories',
          selectedRepositoryIds: [],
          selectedRepositoryCount: 0,
          createdAt: null,
          updatedAt: null,
        },
      ],
    };

    const ctx = createTestContext({});
    const discovered = await module.discover(ctx, bundle);

    assert.equal(discovered.repo, 'app-service');
    assert.equal(discovered.environments.length, 1);
    const env = discovered.environments[0]!;
    assert.equal(env.name, 'production');
    assert.equal(env.deploymentBranchPolicy?.protected_branches, true);
    assert.equal(env.variables?.length, 1);
    assert.equal(env.variables[0]?.name, 'PORT');
    assert.equal(env.secrets?.length, 1);
    assert.equal(env.secrets[0]?.name, 'PROD_TOKEN');
  });

  it('plans create, update, noop operations and applies EMU reviewer mapping', async () => {
    const identityMapper = new IdentityMappingEngine({
      strategy: 'emu-saml',
      suffix: '_acme',
      mappings: {
        special_user: 'enterprise_lead_acme',
      },
    });

    const module = new EnvironmentsMigrationModule({ identityMapper });

    const sourceData: { repo: string; environments: EnvironmentDefinition[] } =
      {
        repo: 'app-service',
        environments: [
          {
            name: 'staging',
            waitTimer: 10,
            reviewers: [
              { type: 'User', id: 1, login: 'alice' },
              { type: 'User', id: 2, login: 'special_user' },
            ],
            variables: [
              { name: 'ENV_MODE', value: 'staging' },
              { name: 'NEW_FLAG', value: 'true' },
            ],
            secrets: [{ name: 'STAGING_KEY' }],
          },
          {
            name: 'production',
            waitTimer: 30,
            variables: [{ name: 'TIER', value: 'prod' }],
          },
        ],
      };

    const targetStore: MockEnvStore = {
      environments: [
        {
          name: 'staging',
          wait_timer: 5, // diff -> update
        },
        {
          name: 'production',
          wait_timer: 30, // matches -> noop
        },
      ],
      variables: {
        staging: [{ name: 'ENV_MODE', value: 'staging' }], // matches -> noop, NEW_FLAG -> create
        production: [{ name: 'TIER', value: 'prod' }], // matches -> noop
      },
      secrets: {
        staging: [], // STAGING_KEY -> create
      },
    };

    const ctx = createTestContext({ targetStore });
    const plan = await module.plan(ctx, sourceData);

    assert.equal(plan.moduleId, 'environments');
    assert.equal(plan.scopeLevel, 'repository');

    const stagingEnvOp = plan.operations.find(
      (op) =>
        op.resourceType === 'environment' && op.resourceName === 'staging',
    );
    assert.equal(stagingEnvOp?.operation, 'update');

    // Alice mapped to alice_acme, special_user mapped to enterprise_lead_acme
    const payload = stagingEnvOp?.payload as {
      reviewers?: Array<{ mappedLogin?: string }>;
    };
    assert.equal(payload.reviewers?.[0]?.mappedLogin, 'alice_acme');
    assert.equal(payload.reviewers?.[1]?.mappedLogin, 'enterprise_lead_acme');

    const prodEnvOp = plan.operations.find(
      (op) =>
        op.resourceType === 'environment' && op.resourceName === 'production',
    );
    assert.equal(prodEnvOp?.operation, 'noop');

    const varOp = plan.operations.find(
      (op) =>
        op.resourceType === 'environment-variable' &&
        op.resourceName === 'staging/NEW_FLAG',
    );
    assert.equal(varOp?.operation, 'create');

    const secretOp = plan.operations.find(
      (op) =>
        op.resourceType === 'environment-secret' &&
        op.resourceName === 'staging/STAGING_KEY',
    );
    assert.equal(secretOp?.operation, 'create');
  });

  it('warns when reviewer cannot be mapped to EMU identity', async () => {
    const identityMapper = new IdentityMappingEngine({
      strategy: 'manual',
      mappings: {},
    });
    const module = new EnvironmentsMigrationModule({ identityMapper });

    const sourceData = {
      repo: 'app-service',
      environments: [
        {
          name: 'qa',
          reviewers: [
            { type: 'User' as const, id: 99, login: 'external_contractor' },
          ],
        },
      ],
    };

    const ctx = createTestContext({ targetStore: { environments: [] } });
    const plan = await module.plan(ctx, sourceData);

    assert.ok(
      plan.warnings.some((w) =>
        w.includes(
          'Reviewer user "external_contractor" in environment "qa" could not be mapped',
        ),
      ),
    );
  });

  it('applies plan in dry-run mode without issuing mutations', async () => {
    const module = new EnvironmentsMigrationModule();
    const writes: TargetWriteOperation[] = [];
    const ctx = createTestContext({ writes, dryRun: true });

    const plan = {
      moduleId: 'environments',
      scopeLevel: 'repository' as const,
      targetIdentifier: 'target-corp/app-service',
      warnings: [],
      operations: [
        {
          id: 'op-1',
          resourceType: 'environment',
          resourceName: 'staging',
          operation: 'create' as const,
          payload: { name: 'staging', waitTimer: 10 },
        },
      ],
    };

    const result = await module.apply(ctx, plan);
    assert.equal(result.status, 'complete');
    assert.equal(writes.length, 0);
  });

  it('applies environment creation, variable creation, and sealed-box secret encryption', async () => {
    await sodium.ready;
    const keyPair = sodium.crypto_box_keypair();
    const publicKeyBase64 = sodium.to_base64(
      keyPair.publicKey,
      sodium.base64_variants.ORIGINAL,
    );

    const module = new EnvironmentsMigrationModule();
    const writes: TargetWriteOperation[] = [];

    const targetStore: MockEnvStore = {
      environments: [],
      publicKeys: {
        prod: {
          key_id: 'prod-key-1',
          key: publicKeyBase64,
        },
      },
    };

    const secretValueProvider: SecretValueProvider = {
      async getSecretValue(input) {
        if (input.name === 'DB_PASS' && input.environmentName === 'prod') {
          return 'super-secret-password-123';
        }
        return undefined;
      },
    };

    const ctx = createTestContext({
      targetStore,
      writes,
      secretValueProvider,
    });

    const plan = {
      moduleId: 'environments',
      scopeLevel: 'repository' as const,
      targetIdentifier: 'target-corp/app-service',
      warnings: [],
      operations: [
        {
          id: 'op-env',
          resourceType: 'environment',
          resourceName: 'prod',
          operation: 'create' as const,
          payload: {
            name: 'prod',
            waitTimer: 15,
            preventSelfReview: true,
          },
        },
        {
          id: 'op-var',
          resourceType: 'environment-variable',
          resourceName: 'prod/PORT',
          operation: 'create' as const,
          payload: {
            environmentName: 'prod',
            name: 'PORT',
            value: '8080',
          },
        },
        {
          id: 'op-sec',
          resourceType: 'environment-secret',
          resourceName: 'prod/DB_PASS',
          operation: 'create' as const,
          payload: {
            environmentName: 'prod',
            name: 'DB_PASS',
          },
        },
      ],
    };

    const result = await module.apply(ctx, plan);
    assert.equal(result.status, 'complete');
    assert.equal(writes.length, 3);

    // Verify environment PUT
    const envWrite = writes.find(
      (w) =>
        w.method === 'PUT' &&
        w.path.includes('/environments/{environment_name}') &&
        w.pathParams?.environment_name === 'prod',
    );
    assert.ok(envWrite);
    assert.deepEqual(envWrite.body, {
      wait_timer: 15,
      prevent_self_review: true,
      reviewers: undefined,
      deployment_branch_policy: undefined,
    });

    // Verify variable POST
    const varWrite = writes.find(
      (w) =>
        w.method === 'POST' &&
        w.path.includes('/variables') &&
        w.pathParams?.environment_name === 'prod',
    );
    assert.ok(varWrite);
    assert.deepEqual(varWrite.body, { name: 'PORT', value: '8080' });

    // Verify secret PUT and decrypt sealed-box value with private key
    const secWrite = writes.find(
      (w) =>
        w.method === 'PUT' &&
        w.path.includes('/secrets/{secret_name}') &&
        w.pathParams?.environment_name === 'prod' &&
        w.pathParams?.secret_name === 'DB_PASS',
    );
    assert.ok(secWrite);
    const secretBody = secWrite.body as {
      encrypted_value: string;
      key_id: string;
    };
    assert.equal(secretBody.key_id, 'prod-key-1');

    const encryptedBytes = sodium.from_base64(
      secretBody.encrypted_value,
      sodium.base64_variants.ORIGINAL,
    );
    const decryptedBytes = sodium.crypto_box_seal_open(
      encryptedBytes,
      keyPair.publicKey,
      keyPair.privateKey,
    );
    const decryptedString = sodium.to_string(decryptedBytes);
    assert.equal(decryptedString, 'super-secret-password-123');
  });

  it('verifies target compliance and detects missing environments, variables, and secrets', async () => {
    const module = new EnvironmentsMigrationModule();

    const plan = {
      moduleId: 'environments',
      scopeLevel: 'repository' as const,
      targetIdentifier: 'target-corp/app-service',
      warnings: [],
      operations: [
        {
          id: 'op-env',
          resourceType: 'environment',
          resourceName: 'prod',
          operation: 'create' as const,
          sourceState: { name: 'prod', waitTimer: 10 },
        },
        {
          id: 'op-var',
          resourceType: 'environment-variable',
          resourceName: 'prod/HOST',
          operation: 'create' as const,
          sourceState: { name: 'HOST', value: 'prod.example.com' },
        },
        {
          id: 'op-sec',
          resourceType: 'environment-secret',
          resourceName: 'prod/TOKEN',
          operation: 'create' as const,
        },
      ],
    };

    // Scenario A: Exact match
    const matchingStore: MockEnvStore = {
      environments: [{ name: 'prod', wait_timer: 10 }],
      variables: { prod: [{ name: 'HOST', value: 'prod.example.com' }] },
      secrets: { prod: [{ name: 'TOKEN' }] },
    };
    const ctxMatch = createTestContext({ targetStore: matchingStore });
    const verifyPass = await module.verify(ctxMatch, plan);
    assert.equal(verifyPass.verified, true);
    assert.equal(verifyPass.discrepancies.length, 0);

    // Scenario B: Drift detected (wait timer differs, variable value differs, secret missing)
    const driftStore: MockEnvStore = {
      environments: [{ name: 'prod', wait_timer: 5 }],
      variables: { prod: [{ name: 'HOST', value: 'dev.example.com' }] },
      secrets: { prod: [] },
    };
    const ctxDrift = createTestContext({ targetStore: driftStore });
    const verifyFail = await module.verify(ctxDrift, plan);
    assert.equal(verifyFail.verified, false);
    assert.equal(verifyFail.discrepancies.length, 3);
  });
});
