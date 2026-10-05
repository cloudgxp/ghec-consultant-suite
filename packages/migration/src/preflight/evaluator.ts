import { randomUUID } from 'node:crypto';
import {
  MIGRATION_SCHEMA_VERSION,
  validatePreflightReport,
  type MigrationPreflightReport,
  type RepositoryAssessment,
  type DestinationAssessment,
} from '@ghec/contracts';
import { SourceRepositoryInspector } from './source-inspector.js';
import { DestinationBlockerInspector } from './destination-inspector.js';
import { SourceCredentialInspector } from './credential-inspector.js';
import type { PreflightEvaluatorOptions } from './types.js';

export class PreflightEvaluator {
  private readonly options: PreflightEvaluatorOptions;

  constructor(options: PreflightEvaluatorOptions) {
    this.options = options;
  }

  /**
   * Executes the full preflight assessment across all scoped repositories and the destination.
   * Returns a strictly validated MigrationPreflightReport.
   */
  async evaluate(): Promise<MigrationPreflightReport> {
    const {
      scope,
      sourceAdapter,
      targetAdapter,
      discoveryBundle,
      sizerMetricsMap,
      signal,
    } = this.options;

    // Resolve source and target orgs from scope or options
    const sourceOrg =
      this.options.sourceOrg ??
      scope.organizations[0]?.source ??
      scope.repositories[0]?.sourceOrg;

    const targetOrg =
      this.options.targetOrg ??
      scope.organizations[0]?.target ??
      scope.repositories[0]?.targetOrg;

    if (!sourceOrg || !targetOrg) {
      throw new Error(
        'Migration scope must specify at least one organization mapping or repository mapping.',
      );
    }

    // 1. Inspect source credentials & capabilities
    const credentialInspector = new SourceCredentialInspector({
      adapter: sourceAdapter,
      sourceOrg,
      signal,
    });
    const credentialAssessment = await credentialInspector.inspect();

    // 2. Inspect source repositories
    const sourceInspector = new SourceRepositoryInspector({
      adapter: sourceAdapter,
      sourceOrg,
      signal,
      discoveryBundle,
    });

    const initialRepoAssessments: RepositoryAssessment[] = [];
    for (const repoMapping of scope.repositories) {
      const sizerStats = sizerMetricsMap?.get(repoMapping.sourceRepo);
      const assessment = await sourceInspector.inspect(
        repoMapping.sourceRepo,
        sizerStats,
      );
      initialRepoAssessments.push(assessment);
    }

    // 3. Inspect destination organization
    const destinationAdapter = targetAdapter ?? sourceAdapter;
    const targetReposToCheck = scope.repositories.map((r) => r.targetRepo);

    const destinationInspector = new DestinationBlockerInspector({
      adapter: destinationAdapter,
      targetOrg,
      scopedRepos: targetReposToCheck,
      signal,
    });

    const destInspection = await destinationInspector.inspect();

    const destinationAssessment: DestinationAssessment = {
      rulesetBypassConfigured: destInspection.rulesetBypassConfigured,
      ipAllowListReachable: destInspection.ipAllowListReachable,
      ghasEnabled: destInspection.ghasEnabled,
      nameConflicts: [...destInspection.nameConflicts],
    };

    // 4. Reconcile blockers into repository assessments
    const nameConflictSet = new Set(destinationAssessment.nameConflicts);
    const repoMappingBySource = new Map(
      scope.repositories.map((r) => [r.sourceRepo, r]),
    );

    const finalRepoAssessments: RepositoryAssessment[] =
      initialRepoAssessments.map((assessment) => {
        const blockers = [...assessment.blockers];
        let status = assessment.status;
        const mapping = repoMappingBySource.get(assessment.repo);
        const targetRepoName = mapping?.targetRepo ?? assessment.repo;

        // Check source credential blockers
        if (credentialAssessment.blockers.length > 0) {
          status = 'blocked';
          blockers.push(...credentialAssessment.blockers);
        }

        // Check target name conflicts
        if (nameConflictSet.has(targetRepoName)) {
          status = 'blocked';
          blockers.push(
            `Target repository "${targetOrg}/${targetRepoName}" already exists in destination organization.`,
          );
        }

        // Check destination ruleset bypass
        if (!destinationAssessment.rulesetBypassConfigured) {
          status = 'blocked';
          if (destInspection.rulesetBypassIssues.length > 0) {
            blockers.push(...destInspection.rulesetBypassIssues);
          } else {
            blockers.push(
              `Destination organization "${targetOrg}" has active rulesets without "Repository migrations" in Exempt bypass mode.`,
            );
          }
        }

        // Check destination IP allowlist
        if (!destinationAssessment.ipAllowListReachable) {
          status = 'blocked';
          blockers.push(
            `Destination organization "${targetOrg}" is unreachable due to IP allowlist restrictions.`,
          );
        }

        // Deduplicate blockers
        const uniqueBlockers = Array.from(new Set(blockers));

        // Enforce contract invariants
        if (status === 'ready' && uniqueBlockers.length > 0) {
          status = 'blocked';
        } else if (status === 'blocked' && uniqueBlockers.length === 0) {
          uniqueBlockers.push(
            `Repository ${assessment.repo} is blocked due to unspecified preflight error.`,
          );
        }

        return {
          ...assessment,
          status,
          blockers: uniqueBlockers,
        };
      });

    // 4. Construct report
    const report: MigrationPreflightReport = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      reportId: this.options.reportId ?? `preflight-${randomUUID()}`,
      evaluatedAt: this.options.evaluatedAt ?? new Date().toISOString(),
      sourceOrg,
      targetOrg,
      repositoryAssessments: finalRepoAssessments,
      destinationAssessments: [destinationAssessment],
    };

    // 5. Validate through contract schema
    const validation = validatePreflightReport(report);
    if (!validation.success) {
      throw new Error(
        `Preflight report failed contract validation: ${JSON.stringify(validation.error.issues)}`,
      );
    }

    return validation.data;
  }
}
