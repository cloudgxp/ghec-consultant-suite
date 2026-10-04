import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';

/**
 * Information regarding an installed GitHub App on the source organization.
 */
export interface GitHubAppInstallationInfo {
  readonly id: number;
  readonly appId: number;
  readonly slug: string;
  readonly name: string;
  readonly targetType: string;
  readonly repositorySelection: 'all' | 'selected' | string;
  readonly permissions: Readonly<Record<string, string>>;
  readonly events: readonly string[];
  readonly htmlUrl: string;
  readonly destinationInstallUrl: string;
}

/**
 * Information regarding packages hosted in GitHub Packages on the source organization.
 */
export interface PackageCutoverItem {
  readonly id?: string | undefined;
  readonly name: string;
  readonly ecosystem:
    'container' | 'npm' | 'maven' | 'nuget' | 'rubygems' | 'unknown';
  readonly visibility: 'public' | 'private' | 'internal' | 'unknown';
  readonly versionCount: number;
  readonly sizeBytes: number | null;
  readonly repositoryName?: string | null | undefined;
  readonly cutoverCommands: readonly string[];
}

/**
 * Specification of an Actions self-hosted runner and runner group topology.
 */
export interface RunnerTopologySpec {
  readonly id?: number | string | undefined;
  readonly name: string;
  readonly runnerType: 'hosted' | 'self-hosted' | 'unknown';
  readonly os: string | null;
  readonly status: 'online' | 'offline' | 'unknown';
  readonly busy?: boolean | null | undefined;
  readonly labels: readonly string[];
  readonly runnerGroupName?: string | undefined;
  readonly runnerGroupId?: number | string | null | undefined;
}

export interface RunnerGroupSpec {
  readonly id?: number | string | undefined;
  readonly name: string;
  readonly visibility: 'all' | 'selected' | 'private' | 'unknown';
  readonly runnerCount: number;
  readonly selectedRepositories?: readonly string[] | undefined;
}

/**
 * Categories of resources explicitly not migrated by GEI.
 */
export type UnsupportedItemCategory =
  | 'fork_relationships'
  | 'discussions'
  | 'projects_v2'
  | 'run_history_and_artifacts'
  | 'audit_logs'
  | 'stars_and_watchers'
  | 'user_keys_and_profiles'
  | 'secret_scanning_remediation';

export interface UnsupportedItemDetail {
  readonly category: UnsupportedItemCategory;
  readonly title: string;
  readonly impactedEntitiesCount: number;
  readonly impactedEntities: readonly string[];
  readonly limitationDescription: string;
  readonly recommendedAction: string;
}

/**
 * Consolidated migration advisory report.
 */
export interface MigrationAdvisoryReport {
  readonly reportVersion: '1.0.0';
  readonly generatedAt: string;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly apps: readonly GitHubAppInstallationInfo[];
  readonly packages: readonly PackageCutoverItem[];
  readonly runners: {
    readonly runners: readonly RunnerTopologySpec[];
    readonly groups: readonly RunnerGroupSpec[];
  };
  readonly unsupportedItems: readonly UnsupportedItemDetail[];
  readonly summary: {
    readonly appCount: number;
    readonly packageCount: number;
    readonly runnerCount: number;
    readonly runnerGroupCount: number;
    readonly unsupportedCategoryCount: number;
  };
}

/**
 * Options for running the migration advisory planner.
 */
export interface AdvisoryPlannerOptions {
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly adapter?: GitHubReadAdapter | undefined;
  readonly discoveryBundle?: DiscoveryBundle | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Rendered artifacts output by the advisory planner.
 */
export interface AdvisoryArtifacts {
  readonly reportJson: string;
  readonly reportMarkdown: string;
  readonly appsMatrixCsv: string;
  readonly packagesGuideMarkdown: string;
  readonly runnerInfrastructureSpecMarkdown: string;
}
