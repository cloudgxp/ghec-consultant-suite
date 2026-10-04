import {
  stronglyConnectedComponents,
  weaklyConnectedComponents,
} from '@ghec/analysis';
import type { MigrationScope } from '@ghec/contracts';
import type {
  AggregatedMigrationSummary,
  CohortExecutionResult,
  GitHubActionsMatrix,
  MatrixCohort,
  ScopeMatrixOptions,
} from './matrix.js';

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
    const rawBatchSize = Math.floor(options.batchSize ?? 10);
    const batchSize = Math.max(1, isNaN(rawBatchSize) ? 10 : rawBatchSize);
    const namingPrefix = options.namingPrefix?.trim() || 'cohort';
    const repositories = scope.repositories ?? [];

    if (repositories.length === 0) {
      return { include: [] };
    }

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
