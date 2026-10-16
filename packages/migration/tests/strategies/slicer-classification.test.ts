import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyRepository,
  sliceScaleAdaptiveMatrix,
  FORTY_GIB,
  TEN_GIB,
} from '../../src/orchestrator/slicer.js';
import type { RepositorySizingProfile } from '../../src/orchestrator/sizing.js';

describe('Scale-Adaptive Repository Sizing & Strategy Classification', () => {
  it('classifies standard repository (<10 GiB) to standard GEI on ubuntu-latest', () => {
    const profile: RepositorySizingProfile = {
      repositoryName: 'standard-repo',
      gitDiskUsageBytes: 500 * 1024 * 1024, // 500 MiB
      gitLfsObjectCount: 0,
      gitLfsTotalBytes: 0,
      releaseCount: 2,
      releaseAssetsTotalBytes: 50 * 1024 * 1024, // 50 MiB
      estimatedScratchBytes: 800 * 1024 * 1024,
      sourceVisibility: 'public',
    };

    const strategy = classifyRepository(profile);

    assert.equal(strategy.tier, 'standard');
    assert.equal(strategy.useGei, true);
    assert.equal(strategy.skipReleases, false);
    assert.equal(strategy.useReleaseFallback, false);
    assert.equal(strategy.useLfsStreamer, false);
    assert.equal(strategy.useMirrorPush, false);
    assert.equal(strategy.requiresHeadroomCheck, false);
    assert.deepEqual(strategy.assignedRunnerLabels, ['ubuntu-latest']);
  });

  it('classifies large release repo (>10 GiB releases) to GEI with skip-releases and fallback streamer', () => {
    const profile: RepositorySizingProfile = {
      repositoryName: 'large-release-repo',
      gitDiskUsageBytes: 2 * 1024 * 1024 * 1024, // 2 GiB
      gitLfsObjectCount: 0,
      gitLfsTotalBytes: 0,
      releaseCount: 15,
      releaseAssetsTotalBytes: TEN_GIB + 1024 * 1024, // 10 GiB + 1 MiB
      estimatedScratchBytes: 3 * 1024 * 1024 * 1024,
      sourceVisibility: 'private',
    };

    const strategy = classifyRepository(profile);

    assert.equal(strategy.tier, 'large-releases');
    assert.equal(strategy.useGei, true);
    assert.equal(strategy.skipReleases, true);
    assert.equal(strategy.useReleaseFallback, true);
    assert.equal(strategy.useMirrorPush, false);
    assert.deepEqual(strategy.assignedRunnerLabels, ['ubuntu-latest']);
  });

  it('classifies Git LFS repo to dual-remote streamer', () => {
    const profile: RepositorySizingProfile = {
      repositoryName: 'lfs-repo',
      gitDiskUsageBytes: 1 * 1024 * 1024 * 1024,
      gitLfsObjectCount: 150,
      gitLfsTotalBytes: 5 * 1024 * 1024 * 1024,
      releaseCount: 1,
      releaseAssetsTotalBytes: 10 * 1024 * 1024,
      estimatedScratchBytes: 2 * 1024 * 1024 * 1024,
      sourceVisibility: 'internal',
    };

    const strategy = classifyRepository(profile);

    assert.equal(strategy.tier, 'git-lfs');
    assert.equal(strategy.useGei, true);
    assert.equal(strategy.useLfsStreamer, true);
    assert.equal(strategy.useMirrorPush, false);
  });

  it('classifies massive repo (>40 GiB) to GEI bypass, mirror-push, and high-disk runners', () => {
    const profile: RepositorySizingProfile = {
      repositoryName: 'massive-monorepo',
      gitDiskUsageBytes: FORTY_GIB + 5 * 1024 * 1024 * 1024, // 45 GiB
      gitLfsObjectCount: 20,
      gitLfsTotalBytes: 1 * 1024 * 1024 * 1024,
      releaseCount: 10,
      releaseAssetsTotalBytes: 15 * 1024 * 1024 * 1024, // 15 GiB
      estimatedScratchBytes: 70 * 1024 * 1024 * 1024,
      sourceVisibility: 'internal',
    };

    const strategy = classifyRepository(profile, {
      largeRepoRunnerLabels: ['self-hosted', 'high-disk'],
    });

    assert.equal(strategy.tier, 'massive-mirror');
    assert.equal(strategy.useGei, false);
    assert.equal(strategy.skipReleases, true);
    assert.equal(strategy.useReleaseFallback, true);
    assert.equal(strategy.useLfsStreamer, true);
    assert.equal(strategy.useMirrorPush, true);
    assert.equal(strategy.requiresHeadroomCheck, true);
    assert.deepEqual(strategy.assignedRunnerLabels, [
      'self-hosted',
      'high-disk',
    ]);
  });

  it('partitions multiple repositories into scale-adaptive cohorts', () => {
    const profiles: RepositorySizingProfile[] = [
      {
        repositoryName: 'repo-std-1',
        gitDiskUsageBytes: 100 * 1024 * 1024,
        gitLfsObjectCount: 0,
        gitLfsTotalBytes: 0,
        releaseCount: 0,
        releaseAssetsTotalBytes: 0,
        estimatedScratchBytes: 150 * 1024 * 1024,
        sourceVisibility: 'public',
      },
      {
        repositoryName: 'repo-std-2',
        gitDiskUsageBytes: 200 * 1024 * 1024,
        gitLfsObjectCount: 0,
        gitLfsTotalBytes: 0,
        releaseCount: 0,
        releaseAssetsTotalBytes: 0,
        estimatedScratchBytes: 300 * 1024 * 1024,
        sourceVisibility: 'public',
      },
      {
        repositoryName: 'repo-massive-1',
        gitDiskUsageBytes: 45 * 1024 * 1024 * 1024,
        gitLfsObjectCount: 0,
        gitLfsTotalBytes: 0,
        releaseCount: 0,
        releaseAssetsTotalBytes: 0,
        estimatedScratchBytes: 70 * 1024 * 1024 * 1024,
        sourceVisibility: 'private',
      },
    ];

    const matrix = sliceScaleAdaptiveMatrix(profiles, {
      batchSize: 2,
      massiveBatchSize: 1,
      defaultRunnerLabels: ['ubuntu-latest'],
      largeRepoRunnerLabels: ['self-hosted', 'high-disk'],
    });

    assert.equal(matrix.cohortCount, 2);
    assert.equal(matrix.matrix.include.length, 2);

    const standardCohort = matrix.matrix.include.find(
      (c) => c.tier === 'standard',
    );
    assert.ok(standardCohort);
    assert.deepEqual(standardCohort.runnerLabels, ['ubuntu-latest']);
    assert.deepEqual(standardCohort.repositories, ['repo-std-1', 'repo-std-2']);
    assert.equal(standardCohort.useGei, true);
    assert.equal(standardCohort.useMirrorPush, false);

    const massiveCohort = matrix.matrix.include.find(
      (c) => c.tier === 'massive-mirror',
    );
    assert.ok(massiveCohort);
    assert.deepEqual(massiveCohort.runnerLabels, ['self-hosted', 'high-disk']);
    assert.deepEqual(massiveCohort.repositories, ['repo-massive-1']);
    assert.equal(massiveCohort.useGei, false);
    assert.equal(massiveCohort.useMirrorPush, true);
    assert.equal(massiveCohort.requiresHeadroomCheck, true);
  });

  it('isolates large-releases repositories into separate cohorts from standard repositories so skipReleases does not leak', () => {
    const profiles: RepositorySizingProfile[] = [
      {
        repositoryName: 'test-packages',
        gitDiskUsageBytes: 100 * 1024 * 1024,
        gitLfsObjectCount: 0,
        gitLfsTotalBytes: 0,
        releaseCount: 2,
        releaseAssetsTotalBytes: 10 * 1024 * 1024,
        estimatedScratchBytes: 160 * 1024 * 1024,
        sourceVisibility: 'private',
      },
      {
        repositoryName: 'release-heavy-benchmark',
        gitDiskUsageBytes: 500 * 1024 * 1024,
        gitLfsObjectCount: 0,
        gitLfsTotalBytes: 0,
        releaseCount: 12,
        releaseAssetsTotalBytes: TEN_GIB + 500 * 1024 * 1024,
        estimatedScratchBytes: 750 * 1024 * 1024,
        sourceVisibility: 'private',
      },
    ];

    const matrix = sliceScaleAdaptiveMatrix(profiles, {
      batchSize: 5,
      defaultRunnerLabels: ['ubuntu-latest'],
    });

    assert.equal(matrix.cohortCount, 2);
    const stdCohort = matrix.matrix.include.find((c) =>
      c.repositories.includes('test-packages'),
    );
    const largeRelCohort = matrix.matrix.include.find((c) =>
      c.repositories.includes('release-heavy-benchmark'),
    );
    assert.ok(stdCohort);
    assert.ok(largeRelCohort);
    assert.equal(stdCohort.tier, 'standard');
    assert.equal(stdCohort.skipReleases, false);
    assert.equal(largeRelCohort.tier, 'large-releases');
    assert.equal(largeRelCohort.skipReleases, true);
    assert.equal(largeRelCohort.useReleaseFallback, true);
  });

  it('assessRepositorySizing paginates all releases via fetchAll and computes >10 GiB total assets', async () => {
    const { assessRepositorySizing } =
      await import('../../src/orchestrator/sizing.js');
    const ONE_GIB = 1024 * 1024 * 1024;
    const simulatedReleases = Array.from({ length: 42 }, (_, idx) => ({
      assets:
        idx < 11 ? [{ size: ONE_GIB }, { size: 128 }] : [{ size: 1024 * 1024 }],
    }));

    let fetchAllCalled = false;
    const mockClient = {
      async fetchAll<T>(descriptor: {
        id: string;
        queryParams?: Record<string, unknown>;
      }) {
        if (descriptor.id === 'rest.repos.list-releases') {
          fetchAllCalled = true;
          assert.equal(descriptor.queryParams?.per_page, 100);
          return {
            items: simulatedReleases as unknown as readonly T[],
            pageCount: 1,
            rateLimitRemaining: 4999,
          };
        }
        return {
          items: [] as readonly T[],
          pageCount: 0,
          rateLimitRemaining: 4999,
        };
      },
      async readSingle<T>(descriptor: { id: string }) {
        if (descriptor.id === 'rest.repos.get') {
          return {
            status: 200,
            headers: {},
            data: {
              size: 2048,
              visibility: 'public',
              private: false,
            } as unknown as T,
          };
        }
        return {
          status: 404,
          headers: {},
          data: {} as unknown as T,
        };
      },
    };

    const profile = await assessRepositorySizing(
      mockClient as unknown as Parameters<typeof assessRepositorySizing>[0],
      'demogxp',
      'release-heavy-benchmark',
    );

    assert.equal(fetchAllCalled, true);
    assert.equal(profile.repositoryName, 'release-heavy-benchmark');
    assert.equal(profile.releaseCount, 42);
    assert.ok(profile.releaseAssetsTotalBytes > TEN_GIB);

    const classified = classifyRepository(profile);
    assert.equal(classified.tier, 'large-releases');
    assert.equal(classified.useGei, true);
    assert.equal(classified.skipReleases, true);
    assert.equal(classified.useReleaseFallback, true);
  });
});
