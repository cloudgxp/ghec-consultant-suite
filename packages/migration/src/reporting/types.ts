export interface PreflightSummary {
  readonly totalRepositories: number;
  readonly ready: number;
  readonly readyWithFollowUp: number;
  readonly requiresSpecialStrategy: number;
  readonly blocked: number;
  readonly rulesetBypassExempt: boolean;
}

export interface GeiStageSummary {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skippedReleases: number;
}

export interface LfsStageSummary {
  readonly repositoriesWithLfs: number;
  readonly objectsTransferred: number;
  readonly bytesTransferred: number;
}

export interface ReleasesStageSummary {
  readonly repositoriesWithLargeReleases: number;
  readonly assetsStreamed: number;
  readonly bytesStreamed: number;
}

export interface CoreTransferSummary {
  readonly gei?: GeiStageSummary | undefined;
  readonly lfs?: LfsStageSummary | undefined;
  readonly largeReleases?: ReleasesStageSummary | undefined;
}

export interface ModuleOpCounts {
  readonly planned: number;
  readonly succeeded: number;
  readonly failed: number;
}

export interface RehydrationSummary {
  readonly variables?: ModuleOpCounts | undefined;
  readonly secrets?: ModuleOpCounts | undefined;
  readonly environments?: ModuleOpCounts | undefined;
  readonly rulesets?: ModuleOpCounts | undefined;
  readonly branchProtection?: ModuleOpCounts | undefined;
  readonly teams?: ModuleOpCounts | undefined;
}

export interface PostMigrationSummary {
  readonly mannequins?:
    | {
        readonly total: number;
        readonly reclaimed: number;
        readonly unmapped: number;
      }
    | undefined;
  readonly webhooks?:
    | {
        readonly reEnabled: number;
      }
    | undefined;
}

export interface VerificationSummary {
  readonly verified: boolean;
  readonly totalDiscrepancies: number;
  readonly discrepancySummaries?: readonly string[] | undefined;
}

export interface MigrationRunSummary {
  readonly schemaVersion: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly status: 'complete' | 'partial' | 'failed' | 'skipped';
  readonly dryRun: boolean;
  readonly preflight?: PreflightSummary | undefined;
  readonly coreTransfer?: CoreTransferSummary | undefined;
  readonly rehydration?: RehydrationSummary | undefined;
  readonly postMigration?: PostMigrationSummary | undefined;
  readonly verification?: VerificationSummary | undefined;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface StepSummaryOptions {
  readonly title?: string | undefined;
  readonly sanitizeFormulas?: boolean | undefined;
  readonly includeDetails?: boolean | undefined;
}
