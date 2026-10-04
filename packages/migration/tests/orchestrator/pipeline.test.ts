import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIGRATION_SCHEMA_VERSION, type MigrationScope } from '@ghec/contracts';
import type {
  GitHubReadAdapter,
  GraphQLResponse,
  ReadOperation,
  ReadPage,
} from '@ghec/github-client';
import {
  createDefaultModuleRegistry,
  MigrationCheckpointManager,
  MigrationOrchestrator,
  RepositoryMigrationPipeline,
  type GeiCommandRunner,
  type ReleaseTransport,
  type TargetRelease,
  type TargetWriteClient,
  type TargetWriteOperation,
} from '../../src/index.js';

class MockReadAdapter implements GitHubReadAdapter {
  readonly isMock = true;
  private readonly config: {
    repoSizeKiB?: number;
    releaseAssetBytes?: number;
    hasLfs?: boolean;
    hasExemptRulesetBypass?: boolean;
    targetRepoExists?: boolean;
  };

  constructor(
    config: {
      repoSizeKiB?: number;
      releaseAssetBytes?: number;
      hasLfs?: boolean;
      hasExemptRulesetBypass?: boolean;
      targetRepoExists?: boolean;
    } = {},
  ) {
    this.config = {
      repoSizeKiB: 1024,
      releaseAssetBytes: 1024,
      hasLfs: false,
      hasExemptRulesetBypass: true,
      targetRepoExists: false,
      ...config,
    };
  }

  async readSingle<T>(
    operation: ReadOperation,
  ): Promise<{ data: T; status: number; observedAt: string }> {
    const path = operation.path;

    // Ruleset details
    if (path.includes('/rulesets/')) {
      return {
        data: {
          id: 101,
          name: 'Default Org Ruleset',
          enforcement: 'active',
          bypass_actors: this.config.hasExemptRulesetBypass
            ? [{ actor_name: 'Repository migrations', bypass_mode: 'exempt' }]
            : [
                {
                  actor_name: 'Repository migrations',
                  bypass_mode: 'always_allow',
                },
              ],
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    // Actions variables (for repo-variables module)
    if (path.includes('/actions/variables')) {
      return {
        data: {
          total_count: 0,
          variables: [],
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    // Target repo check
    if (operation.pathParams?.owner === 'dst-org') {
      if (this.config.targetRepoExists) {
        return {
          data: { id: 999, name: operation.pathParams.repo } as unknown as T,
          status: 200,
          observedAt: new Date().toISOString(),
        };
      }
      throw Object.assign(new Error('Not found'), { status: 404 });
    }

    // Source repo metadata
    if (path.startsWith('/repos/')) {
      if (path.endsWith('/contents/.gitattributes')) {
        if (this.config.hasLfs) {
          return {
            data: {
              content: Buffer.from(
                '*.bin filter=lfs diff=lfs merge=lfs -text\n',
              ).toString('base64'),
              encoding: 'base64',
            } as unknown as T,
            status: 200,
            observedAt: new Date().toISOString(),
          };
        }
        throw Object.assign(new Error('Not found'), { status: 404 });
      }

      return {
        data: {
          id: 1,
          name: operation.pathParams?.repo ?? 'repo-a',
          size: this.config.repoSizeKiB,
          default_branch: 'main',
        } as unknown as T,
        status: 200,
        observedAt: new Date().toISOString(),
      };
    }

    return { data: {} as T, status: 200, observedAt: new Date().toISOString() };
  }

  async readPage<T>(): Promise<ReadPage<T>> {
    return {
      items: [],
      nextCursor: null,
      status: 200,
      observedAt: new Date().toISOString(),
    };
  }

  async fetchAll<T>(
    operation: ReadOperation,
  ): Promise<{ items: readonly T[]; observedAt: string; complete: boolean }> {
    const path = operation.path;

    // Rulesets list
    if (path.includes('/rulesets')) {
      return {
        items: [
          { id: 101, name: 'Default Org Ruleset', enforcement: 'active' },
        ] as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }

    // Releases list
    if (path.includes('/releases')) {
      return {
        items: [
          {
            id: 1,
            name: 'v1.0.0',
            tag_name: 'v1.0.0',
            assets: [
              {
                id: 11,
                name: 'bundle.tar.gz',
                size: this.config.releaseAssetBytes ?? 1024,
              },
            ],
          },
        ] as unknown as readonly T[],
        observedAt: new Date().toISOString(),
        complete: true,
      };
    }

    return { items: [], observedAt: new Date().toISOString(), complete: true };
  }

  async queryGraphQL<T>(): Promise<GraphQLResponse<T>> {
    return { data: {} as T, observedAt: new Date().toISOString() };
  }

  async readEndpoint<T>(): Promise<{ data: T; status: number }> {
    return { data: {} as T, status: 200 };
  }
}

class MockWriteClient implements TargetWriteClient {
  readonly calls: TargetWriteOperation[] = [];

  async mutate<T = unknown>(
    op: TargetWriteOperation,
  ): Promise<{ status: number; data?: T | undefined }> {
    this.calls.push(op);
    return { status: 201, data: undefined };
  }
}

test('RepositoryMigrationPipeline executes all 7 stages sequentially', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pipe-test-'));
  try {
    const scope: MigrationScope = {
      version: MIGRATION_SCHEMA_VERSION,
      name: 'test-pipeline',
      organizations: [{ source: 'src-org', target: 'dst-org' }],
      repositories: [
        {
          sourceOrg: 'src-org',
          sourceRepo: 'repo-1',
          targetOrg: 'dst-org',
          targetRepo: 'repo-1',
          useGei: true,
          modules: ['repo-variables'],
        },
      ],
    };

    const checkpointManager = new MigrationCheckpointManager('run-001', scope, {
      rootDirectory: tmpDir,
    });

    const observedCommands: string[][] = [];
    const geiRunner: GeiCommandRunner = async (_cmd, args) => {
      observedCommands.push([...args]);
      return {
        command: 'gh',
        args,
        exitCode: 0,
        stdout: 'RM_migration_12345 completed\n',
        stderr: '',
      };
    };

    const pipeline = new RepositoryMigrationPipeline({
      registry: createDefaultModuleRegistry(),
      sourceClient: new MockReadAdapter(),
      targetClient: new MockReadAdapter(),
      targetWriteClient: new MockWriteClient(),
      checkpointManager,
      geiRunner,
    });

    const result = await pipeline.execute(scope.repositories[0]!);

    assert.equal(result.status, 'complete');
    assert.deepEqual(result.completedStages, [
      'preflight',
      'targetPrep',
      'gei',
      'specializedStrategies',
      'apiModules',
      'postMigration',
      'verification',
    ]);
    assert.equal(
      checkpointManager.isStageCompleted('src-org/repo-1', 'verification'),
      true,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RepositoryMigrationPipeline triggers --skip-releases and LargeReleasesStrategy when releases exceed 10 GiB', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pipe-lrg-'));
  try {
    const scope: MigrationScope = {
      version: MIGRATION_SCHEMA_VERSION,
      name: 'test-large-releases',
      organizations: [{ source: 'src-org', target: 'dst-org' }],
      repositories: [
        {
          sourceOrg: 'src-org',
          sourceRepo: 'large-repo',
          targetOrg: 'dst-org',
          targetRepo: 'large-repo',
          useGei: true,
          modules: ['repo-variables'],
        },
      ],
    };

    const checkpointManager = new MigrationCheckpointManager('run-001', scope, {
      rootDirectory: tmpDir,
    });

    const observedGeiArgs: string[][] = [];
    const geiRunner: GeiCommandRunner = async (_cmd, args) => {
      observedGeiArgs.push([...args]);
      return {
        command: 'gh',
        args,
        exitCode: 0,
        stdout: 'RM_lrg_001 completed\n',
        stderr: '',
      };
    };

    let releaseFallbackExecuted = false;
    const targetReleases: TargetRelease[] = [];
    const releaseTransport: ReleaseTransport = {
      listSourceReleases: async () => [
        {
          id: 1,
          tagName: 'v2.0.0',
          targetCommitish: 'main',
          draft: false,
          prerelease: false,
          createdAt: '2026-01-01T00:00:00Z',
          assets: [],
        },
      ],
      listTargetReleases: async () => targetReleases,
      createTargetRelease: async (input) => {
        releaseFallbackExecuted = true;
        const created: TargetRelease = {
          id: 2,
          tagName: input.tagName,
          assets: [],
        };
        targetReleases.push(created);
        return created;
      },
      downloadAsset: async () => new ReadableStream<Uint8Array>(),
      uploadAsset: async () => {},
    };

    const pipeline = new RepositoryMigrationPipeline({
      registry: createDefaultModuleRegistry(),
      sourceClient: new MockReadAdapter({
        releaseAssetBytes: 11 * 1024 * 1024 * 1024,
      }),
      targetClient: new MockReadAdapter(),
      targetWriteClient: new MockWriteClient(),
      checkpointManager,
      geiRunner,
      releaseTransport,
    });

    const result = await pipeline.execute(scope.repositories[0]!);

    assert.equal(result.status, 'complete');
    assert.equal(observedGeiArgs[0]?.includes('--skip-releases'), true);
    assert.equal(releaseFallbackExecuted, true);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RepositoryMigrationPipeline triggers Git LFS strategy when repo uses LFS', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pipe-lfs-'));
  try {
    const scope: MigrationScope = {
      version: MIGRATION_SCHEMA_VERSION,
      name: 'test-lfs',
      organizations: [{ source: 'src-org', target: 'dst-org' }],
      repositories: [
        {
          sourceOrg: 'src-org',
          sourceRepo: 'lfs-repo',
          targetOrg: 'dst-org',
          targetRepo: 'lfs-repo',
          useGei: true,
          lfsStrategy: 'dual-remote-stream',
          modules: ['repo-variables'],
        },
      ],
    };

    const checkpointManager = new MigrationCheckpointManager('run-001', scope, {
      rootDirectory: tmpDir,
    });

    const geiRunner: GeiCommandRunner = async (_cmd, args) => ({
      command: 'gh',
      args,
      exitCode: 0,
      stdout: 'RM_lfs_001 completed\n',
      stderr: '',
    });

    const observedLfsCommands: string[][] = [];
    const lfsRunner: GeiCommandRunner = async (_cmd, args) => {
      observedLfsCommands.push([...args]);
      return {
        command: 'git',
        args,
        exitCode: 0,
        stdout: 'LFS transfer complete\n',
        stderr: '',
      };
    };

    const pipeline = new RepositoryMigrationPipeline({
      registry: createDefaultModuleRegistry(),
      sourceClient: new MockReadAdapter({ hasLfs: true }),
      targetClient: new MockReadAdapter(),
      targetWriteClient: new MockWriteClient(),
      checkpointManager,
      geiRunner,
      lfsRunner,
    });

    const result = await pipeline.execute(scope.repositories[0]!);

    assert.equal(result.status, 'complete');
    assert.ok(observedLfsCommands.length > 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RepositoryMigrationPipeline halts on GEI failure and contains error without applying subsequent stages', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pipe-gei-err-'));
  try {
    const scope: MigrationScope = {
      version: MIGRATION_SCHEMA_VERSION,
      name: 'test-gei-fail',
      organizations: [{ source: 'src-org', target: 'dst-org' }],
      repositories: [
        {
          sourceOrg: 'src-org',
          sourceRepo: 'fail-repo',
          targetOrg: 'dst-org',
          targetRepo: 'fail-repo',
          useGei: true,
          modules: ['repo-variables'],
        },
      ],
    };

    const checkpointManager = new MigrationCheckpointManager('run-001', scope, {
      rootDirectory: tmpDir,
    });

    const failingGeiRunner: GeiCommandRunner = async () => ({
      command: 'gh',
      args: [],
      exitCode: 1,
      stdout: '',
      stderr: 'Fatal: remote network failure\n',
    });

    const writeClient = new MockWriteClient();
    const pipeline = new RepositoryMigrationPipeline({
      registry: createDefaultModuleRegistry(),
      sourceClient: new MockReadAdapter(),
      targetClient: new MockReadAdapter(),
      targetWriteClient: writeClient,
      checkpointManager,
      geiRunner: failingGeiRunner,
    });

    const result = await pipeline.execute(scope.repositories[0]!);

    assert.equal(result.status, 'failed');
    assert.deepEqual(result.completedStages, ['preflight', 'targetPrep']);
    assert.equal(writeClient.calls.length, 0); // No mutations on target
    assert.equal(
      checkpointManager.isStageCompleted('src-org/fail-repo', 'gei'),
      false,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RepositoryMigrationPipeline checkpoint resumption skips completed stages', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pipe-resume-'));
  try {
    const scope: MigrationScope = {
      version: MIGRATION_SCHEMA_VERSION,
      name: 'test-resume',
      organizations: [{ source: 'src-org', target: 'dst-org' }],
      repositories: [
        {
          sourceOrg: 'src-org',
          sourceRepo: 'resume-repo',
          targetOrg: 'dst-org',
          targetRepo: 'resume-repo',
          useGei: true,
          modules: ['repo-variables'],
        },
      ],
    };

    const checkpointManager = new MigrationCheckpointManager('run-001', scope, {
      rootDirectory: tmpDir,
    });

    // Manually mark stages 1 through 4 as completed in checkpoint
    checkpointManager.recordStageResult('src-org/resume-repo', 'preflight', {
      status: 'evaluated',
    });
    checkpointManager.recordStageResult('src-org/resume-repo', 'targetPrep', {
      status: 'completed',
    });
    checkpointManager.recordStageResult('src-org/resume-repo', 'gei', {
      status: 'completed',
      migrationId: 'RM_resumed_999',
    });
    checkpointManager.recordStageResult(
      'src-org/resume-repo',
      'specializedStrategies',
      {
        'git-lfs': { status: 'skipped' },
        'releases-fallback': { status: 'skipped' },
      },
    );

    let geiInvoked = false;
    const geiRunner: GeiCommandRunner = async () => {
      geiInvoked = true;
      return { command: 'gh', args: [], exitCode: 0, stdout: '', stderr: '' };
    };

    const pipeline = new RepositoryMigrationPipeline({
      registry: createDefaultModuleRegistry(),
      sourceClient: new MockReadAdapter(),
      targetClient: new MockReadAdapter(),
      targetWriteClient: new MockWriteClient(),
      checkpointManager,
      geiRunner,
    });

    const result = await pipeline.execute(scope.repositories[0]!);

    assert.equal(result.status, 'complete');
    assert.equal(geiInvoked, false); // GEI stage was skipped!
    assert.deepEqual(result.completedStages, [
      'preflight',
      'targetPrep',
      'gei',
      'specializedStrategies',
      'apiModules',
      'postMigration',
      'verification',
    ]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MigrationOrchestrator throttles repository pipelines to configured concurrency limit', async () => {
  const scope: MigrationScope = {
    version: MIGRATION_SCHEMA_VERSION,
    name: 'test-concurrency',
    organizations: [{ source: 'src-org', target: 'dst-org' }],
    repositories: [
      {
        sourceOrg: 'src-org',
        sourceRepo: 'repo-1',
        targetOrg: 'dst-org',
        targetRepo: 'repo-1',
        useGei: false,
      },
      {
        sourceOrg: 'src-org',
        sourceRepo: 'repo-2',
        targetOrg: 'dst-org',
        targetRepo: 'repo-2',
        useGei: false,
      },
      {
        sourceOrg: 'src-org',
        sourceRepo: 'repo-3',
        targetOrg: 'dst-org',
        targetRepo: 'repo-3',
        useGei: false,
      },
      {
        sourceOrg: 'src-org',
        sourceRepo: 'repo-4',
        targetOrg: 'dst-org',
        targetRepo: 'repo-4',
        useGei: false,
      },
    ],
  };

  let activePipelines = 0;
  let maxObservedPipelines = 0;

  class DelayedReadAdapter extends MockReadAdapter {
    override async readSingle<T>(
      op: ReadOperation,
    ): Promise<{ data: T; status: number; observedAt: string }> {
      activePipelines++;
      maxObservedPipelines = Math.max(maxObservedPipelines, activePipelines);
      await new Promise((r) => setTimeout(r, 20));
      activePipelines--;
      return super.readSingle<T>(op);
    }
  }

  const orchestrator = new MigrationOrchestrator({
    registry: createDefaultModuleRegistry(),
    sourceClient: new DelayedReadAdapter(),
    targetClient: new DelayedReadAdapter(),
    targetWriteClient: new MockWriteClient(),
    scope,
    concurrency: 2,
    dryRun: true,
  });

  const results = await orchestrator.executeRepositoryPipelines();

  assert.equal(results.length, 4);
  assert.ok(
    maxObservedPipelines <= 2,
    `Expected max concurrency <= 2, got ${maxObservedPipelines}`,
  );
  assert.ok(results.every((r) => r.status === 'complete'));
});
