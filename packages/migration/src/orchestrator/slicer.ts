import {
  stronglyConnectedComponents,
  weaklyConnectedComponents,
} from '@ghec/analysis';
import {
  ORCHESTRATOR_SCHEMA_VERSION,
  type MigrationScope,
  type SlicerCohortItem,
  type SlicerMatrix,
  type SlicerTier,
} from '@ghec/contracts';
import type {
  AggregatedMigrationSummary,
  CohortExecutionResult,
  GitHubActionsMatrix,
  MatrixCohort,
  ScopeMatrixOptions,
} from './matrix.js';
import type { RepositorySizingProfile } from './sizing.js';

export class ScopeMatrixSlicer {
  /**
   * Partitions a MigrationScope into parallel cohorts suitable for a GitHub Actions job matrix.
   * If a DependencyGraph is provided, repositories participating in cycles or tightly coupled
   * clusters are kept in the same cohort to preserve atomic inter-repository dependencies.
   */
  static slice(
    scope: MigrationScope,
    options: ScopeMatrixOptions,
  ): GitHubActionsMatrix {
    const namingPrefix = options.namingPrefix?.trim() || 'cohort';
    const repositories = scope.repositories ?? [];

    if (repositories.length === 0) {
      if (scope.organizations && scope.organizations.length > 0) {
        const cohortId = `${namingPrefix}-org`;
        return {
          include: [
            {
              cohortId,
              wave: 1,
              repoCount: 0,
              repositories: [],
              scopeJson: JSON.stringify(scope),
              scope,
              rationale: 'Organization-level resources migration cohort.',
            },
          ],
        };
      }
      return { include: [] };
    }

    // Runner-aware capacity orchestration:
    // If capacity is 1, a single cohort is generated, forcing sequential execution.
    if (options.runnerCapacity === 1) {
      const cohortId = `${namingPrefix}-1`;
      return {
        include: [
          {
            cohortId,
            wave: 1,
            repoCount: repositories.length,
            repositories: repositories.map(
              (r) => `${r.sourceOrg}/${r.sourceRepo}`,
            ),
            scopeJson: JSON.stringify(scope),
            scope,
            rationale:
              'Single runner allocation forces sequential execution across all repositories.',
          },
        ],
      };
    }

    const batchSize =
      options.runnerCapacity !== undefined && options.runnerCapacity > 0
        ? Math.max(1, Math.ceil(repositories.length / options.runnerCapacity))
        : Math.max(
            1,
            isNaN(Math.floor(options.batchSize ?? 10))
              ? 10
              : Math.floor(options.batchSize ?? 10),
          );

    // Map repositories by multiple identifiers (fullName "org/repo" and "repo")
    const repoByKey = new Map<string, MigrationScope['repositories'][number]>();
    const repoByShortName = new Map<
      string,
      MigrationScope['repositories'][number]
    >();
    for (const r of repositories) {
      const full = `${r.sourceOrg}/${r.sourceRepo}`;
      repoByKey.set(full, r);
      repoByShortName.set(r.sourceRepo, r);
    }

    const assigned = new Set<string>();
    const cohortGroups: Array<{
      repos: MigrationScope['repositories'];
      rationale?: string;
    }> = [];

    // Helper to resolve graph node ID to scope repo mapping
    const resolveRepo = (
      nodeId: string,
    ): MigrationScope['repositories'][number] | undefined => {
      return repoByKey.get(nodeId) ?? repoByShortName.get(nodeId);
    };

    if (options.dependencyGraph) {
      // 1. Strongly Connected Components (cycles) take highest priority
      const cycles = stronglyConnectedComponents(
        options.dependencyGraph,
      ).filter((cycle) => cycle.length > 1);

      for (const cycle of cycles) {
        const cycleRepos: MigrationScope['repositories'] = [];
        for (const nodeId of cycle) {
          const repo = resolveRepo(nodeId);
          if (repo) {
            const key = `${repo.sourceOrg}/${repo.sourceRepo}`;
            if (!assigned.has(key)) {
              assigned.add(key);
              cycleRepos.push(repo);
            }
          }
        }

        if (cycleRepos.length > 0) {
          cohortGroups.push({
            repos: cycleRepos,
            rationale: `Cycle of ${cycleRepos.length} repositories must migrate together.`,
          });
        }
      }

      // 2. Weakly Connected Components (dependency clusters)
      const weakComponents = weaklyConnectedComponents(options.dependencyGraph);
      for (const component of weakComponents) {
        const componentRepos: MigrationScope['repositories'] = [];
        for (const nodeId of component) {
          const repo = resolveRepo(nodeId);
          if (repo) {
            const key = `${repo.sourceOrg}/${repo.sourceRepo}`;
            if (!assigned.has(key)) {
              assigned.add(key);
              componentRepos.push(repo);
            }
          }
        }

        if (componentRepos.length > 0) {
          // If component fits in batchSize, keep it together
          if (componentRepos.length <= batchSize) {
            cohortGroups.push({
              repos: componentRepos,
              rationale: `Connected component of ${componentRepos.length} repositories grouped to minimize boundary risk.`,
            });
          } else {
            // Split into sub-chunks of size <= batchSize
            for (let i = 0; i < componentRepos.length; i += batchSize) {
              const chunk = componentRepos.slice(i, i + batchSize);
              cohortGroups.push({
                repos: chunk,
                rationale: `Partition of connected cluster (${chunk.length} repos).`,
              });
            }
          }
        }
      }
    }

    // 3. Any remaining repositories (or all repositories if no graph provided)
    const remainingRepos: MigrationScope['repositories'] = [];
    for (const r of repositories) {
      const key = `${r.sourceOrg}/${r.sourceRepo}`;
      if (!assigned.has(key)) {
        assigned.add(key);
        remainingRepos.push(r);
      }
    }

    // Group remaining into chunks of batchSize
    for (let i = 0; i < remainingRepos.length; i += batchSize) {
      const chunk = remainingRepos.slice(i, i + batchSize);
      cohortGroups.push({
        repos: chunk,
        rationale: `Balanced partition of ${chunk.length} independent repositories.`,
      });
    }

    // Pack smaller non-cycle cohorts together if they can fit in batchSize
    const consolidatedCohorts: Array<{
      repos: MigrationScope['repositories'];
      rationale?: string;
    }> = [];

    let currentAccumulator: MigrationScope['repositories'] = [];
    for (const group of cohortGroups) {
      // If group is an explicit cycle or is already >= batchSize, don't combine
      if (
        group.rationale?.includes('Cycle') ||
        group.repos.length >= batchSize
      ) {
        if (currentAccumulator.length > 0) {
          consolidatedCohorts.push({
            repos: currentAccumulator,
            rationale: `Combined cohort of ${currentAccumulator.length} repositories.`,
          });
          currentAccumulator = [];
        }
        consolidatedCohorts.push(group);
      } else {
        if (currentAccumulator.length + group.repos.length <= batchSize) {
          currentAccumulator.push(...group.repos);
        } else {
          if (currentAccumulator.length > 0) {
            consolidatedCohorts.push({
              repos: currentAccumulator,
              rationale: `Combined cohort of ${currentAccumulator.length} repositories.`,
            });
          }
          currentAccumulator = [...group.repos];
        }
      }
    }

    if (currentAccumulator.length > 0) {
      consolidatedCohorts.push({
        repos: currentAccumulator,
        rationale: `Combined cohort of ${currentAccumulator.length} repositories.`,
      });
    }

    // If runnerCapacity was specified, ensure no more than runnerCapacity cohorts are produced
    if (
      options.runnerCapacity !== undefined &&
      options.runnerCapacity > 0 &&
      consolidatedCohorts.length > options.runnerCapacity
    ) {
      while (consolidatedCohorts.length > options.runnerCapacity) {
        let minIndex = -1;
        let minSize = Infinity;
        for (let i = 0; i < consolidatedCohorts.length; i++) {
          const c = consolidatedCohorts[i]!;
          if (!c.rationale?.includes('Cycle') && c.repos.length < minSize) {
            minSize = c.repos.length;
            minIndex = i;
          }
        }
        if (minIndex === -1) {
          minIndex = consolidatedCohorts.length - 1;
        }
        const targetIndex = minIndex === 0 ? 1 : minIndex - 1;
        const [removed] = consolidatedCohorts.splice(minIndex, 1);
        if (removed && consolidatedCohorts[targetIndex]) {
          consolidatedCohorts[targetIndex]!.repos.push(...removed.repos);
          consolidatedCohorts[targetIndex]!.rationale =
            `Merged cohort (${consolidatedCohorts[targetIndex]!.repos.length} repos) to respect runner capacity (${options.runnerCapacity}).`;
        }
      }
    }

    // Build MatrixCohort items
    const include: MatrixCohort[] = consolidatedCohorts.map((group, index) => {
      const cohortId = `${namingPrefix}-${index + 1}`;
      const cohortScope: MigrationScope = {
        ...scope,
        name: `${scope.name}-${cohortId}`,
        repositories: group.repos,
      };

      const scopeJson = JSON.stringify(cohortScope);
      const repoIdentifiers = group.repos.map(
        (r) => `${r.sourceOrg}/${r.sourceRepo}`,
      );

      return {
        cohortId,
        wave: index + 1,
        repoCount: group.repos.length,
        repositories: repoIdentifiers,
        scopeJson,
        scope: cohortScope,
        ...(group.rationale ? { rationale: group.rationale } : {}),
      };
    });

    return { include };
  }

  /**
   * Aggregates execution results and verification outcomes from parallel worker jobs
   * into a consolidated summary.
   */
  static aggregateCohortResults(
    results: readonly CohortExecutionResult[],
  ): AggregatedMigrationSummary {
    let completedCohorts = 0;
    let failedCohorts = 0;
    let totalRepositories = 0;
    let completedRepositories = 0;
    let failedRepositories = 0;
    let totalDiscrepancies = 0;
    let durationMs = 0;
    const errors: string[] = [];

    const cohortSummaries = results.map((cohort) => {
      const repoCount = cohort.repositoryCount;
      const completedCount = cohort.completedRepositories.length;
      let failedCount = cohort.failedRepositories?.length ?? 0;

      if (cohort.status === 'failed') {
        failedCohorts++;
        if (failedCount === 0 && completedCount < repoCount) {
          failedCount = repoCount - completedCount;
        }
      } else if (cohort.status === 'complete') {
        completedCohorts++;
      }

      totalRepositories += repoCount;
      completedRepositories += completedCount;
      failedRepositories += failedCount;

      const cohortDiscrepancies =
        cohort.discrepancies?.length ??
        cohort.verificationReport?.summary.discrepancyCount ??
        0;
      totalDiscrepancies += cohortDiscrepancies;

      if (cohort.durationMs && cohort.durationMs > durationMs) {
        durationMs = cohort.durationMs;
      }

      if (cohort.error) {
        errors.push(`Cohort ${cohort.cohortId}: ${cohort.error}`);
      }

      return {
        cohortId: cohort.cohortId,
        status: cohort.status,
        repositoryCount: repoCount,
        failedCount,
        ...(cohort.error ? { error: cohort.error } : {}),
      };
    });

    let overallStatus: AggregatedMigrationSummary['status'];
    if (
      failedCohorts === 0 &&
      errors.length === 0 &&
      totalDiscrepancies === 0
    ) {
      overallStatus = 'complete';
    } else if (
      completedRepositories === 0 &&
      (failedCohorts > 0 || errors.length > 0)
    ) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'partial';
    }

    return {
      status: overallStatus,
      totalCohorts: results.length,
      completedCohorts,
      failedCohorts,
      totalRepositories,
      completedRepositories,
      failedRepositories,
      totalDiscrepancies,
      durationMs,
      errors,
      cohortSummaries,
    };
  }
}

export const TEN_GIB = 10 * 1024 * 1024 * 1024;
export const FORTY_GIB = 40 * 1024 * 1024 * 1024;

export interface ClassifiedRepositoryStrategy {
  readonly repositoryName: string;
  readonly tier: SlicerTier;
  readonly useGei: boolean;
  readonly skipReleases: boolean;
  readonly useReleaseFallback: boolean;
  readonly useLfsStreamer: boolean;
  readonly useMirrorPush: boolean;
  readonly requiresHeadroomCheck: boolean;
  readonly assignedRunnerLabels: readonly string[];
  readonly estimatedScratchBytes: number;
}

export interface SlicerOptions {
  readonly defaultRunnerLabels?: readonly string[];
  readonly largeRepoRunnerLabels?: readonly string[];
  readonly batchSize?: number;
  readonly massiveBatchSize?: number;
}

export function classifyRepository(
  profile: RepositorySizingProfile,
  options: SlicerOptions = {},
): ClassifiedRepositoryStrategy {
  const defaultLabels = options.defaultRunnerLabels?.length
    ? options.defaultRunnerLabels
    : ['ubuntu-latest'];
  const largeLabels = options.largeRepoRunnerLabels?.length
    ? options.largeRepoRunnerLabels
    : ['self-hosted', 'high-disk'];

  // 1. Massive Repository (>40 GiB or total metadata >40 GiB)
  if (profile.gitDiskUsageBytes > FORTY_GIB) {
    return {
      repositoryName: profile.repositoryName,
      tier: 'massive-mirror',
      useGei: false,
      skipReleases: true,
      useReleaseFallback: profile.releaseAssetsTotalBytes > 0,
      useLfsStreamer: profile.gitLfsObjectCount > 0,
      useMirrorPush: true,
      requiresHeadroomCheck: true,
      assignedRunnerLabels: largeLabels,
      estimatedScratchBytes: profile.estimatedScratchBytes,
    };
  }

  // 2. Large Releases (>10 GiB release binaries)
  if (profile.releaseAssetsTotalBytes > TEN_GIB) {
    return {
      repositoryName: profile.repositoryName,
      tier: 'large-releases',
      useGei: true,
      skipReleases: true,
      useReleaseFallback: true,
      useLfsStreamer: profile.gitLfsObjectCount > 0,
      useMirrorPush: false,
      requiresHeadroomCheck: false,
      assignedRunnerLabels: defaultLabels,
      estimatedScratchBytes: profile.estimatedScratchBytes,
    };
  }

  // 3. Git LFS Objects
  if (profile.gitLfsObjectCount > 0) {
    return {
      repositoryName: profile.repositoryName,
      tier: 'git-lfs',
      useGei: true,
      skipReleases: false,
      useReleaseFallback: false,
      useLfsStreamer: true,
      useMirrorPush: false,
      requiresHeadroomCheck: false,
      assignedRunnerLabels: defaultLabels,
      estimatedScratchBytes: profile.estimatedScratchBytes,
    };
  }

  // 4. Standard Repository
  return {
    repositoryName: profile.repositoryName,
    tier: 'standard',
    useGei: true,
    skipReleases: false,
    useReleaseFallback: false,
    useLfsStreamer: false,
    useMirrorPush: false,
    requiresHeadroomCheck: false,
    assignedRunnerLabels: defaultLabels,
    estimatedScratchBytes: profile.estimatedScratchBytes,
  };
}

export function sliceScaleAdaptiveMatrix(
  profiles: readonly RepositorySizingProfile[],
  options: SlicerOptions = {},
): SlicerMatrix {
  const standardBatchSize =
    options.batchSize && options.batchSize > 0 ? options.batchSize : 5;
  const massiveBatchSize =
    options.massiveBatchSize && options.massiveBatchSize > 0
      ? options.massiveBatchSize
      : 1;

  const standardItems: ClassifiedRepositoryStrategy[] = [];
  const massiveItems: ClassifiedRepositoryStrategy[] = [];

  for (const profile of profiles) {
    const strategy = classifyRepository(profile, options);
    if (strategy.tier === 'massive-mirror') {
      massiveItems.push(strategy);
    } else {
      standardItems.push(strategy);
    }
  }

  const cohorts: SlicerCohortItem[] = [];

  // Partition standard cohorts
  for (let i = 0; i < standardItems.length; i += standardBatchSize) {
    const chunk = standardItems.slice(i, i + standardBatchSize);
    const first = chunk[0];
    if (!first) continue;
    const cohortId = `cohort-standard-${String(Math.floor(i / standardBatchSize) + 1).padStart(2, '0')}`;
    const primaryTier = chunk.some((c) => c.tier === 'large-releases')
      ? 'large-releases'
      : chunk.some((c) => c.tier === 'git-lfs')
        ? 'git-lfs'
        : 'standard';

    cohorts.push({
      cohortId,
      runnerLabels: [...first.assignedRunnerLabels],
      repositories: chunk.map((c) => c.repositoryName),
      tier: primaryTier,
      useGei: chunk.some((c) => c.useGei),
      skipReleases: chunk.some((c) => c.skipReleases),
      useReleaseFallback: chunk.some((c) => c.useReleaseFallback),
      useLfsStreamer: chunk.some((c) => c.useLfsStreamer),
      useMirrorPush: false,
      requiresHeadroomCheck: false,
      estimatedScratchBytes: chunk.reduce(
        (sum, c) => sum + c.estimatedScratchBytes,
        0,
      ),
    });
  }

  // Partition massive cohorts
  for (let i = 0; i < massiveItems.length; i += massiveBatchSize) {
    const chunk = massiveItems.slice(i, i + massiveBatchSize);
    const first = chunk[0];
    if (!first) continue;
    const cohortId = `cohort-massive-${String(Math.floor(i / massiveBatchSize) + 1).padStart(2, '0')}`;

    cohorts.push({
      cohortId,
      runnerLabels: [...first.assignedRunnerLabels],
      repositories: chunk.map((c) => c.repositoryName),
      tier: 'massive-mirror',
      useGei: false,
      skipReleases: true,
      useReleaseFallback: chunk.some((c) => c.useReleaseFallback),
      useLfsStreamer: chunk.some((c) => c.useLfsStreamer),
      useMirrorPush: true,
      requiresHeadroomCheck: true,
      estimatedScratchBytes: chunk.reduce(
        (sum, c) => sum + c.estimatedScratchBytes,
        0,
      ),
    });
  }

  return {
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    cohortCount: cohorts.length,
    matrix: {
      include: cohorts,
    },
  };
}
