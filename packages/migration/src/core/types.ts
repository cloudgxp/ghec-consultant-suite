import type {
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';

export type MigrationScopeLevel = 'organization' | 'repository';

export interface StructuredLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
}

export interface MigrationScopeTarget {
  readonly level: MigrationScopeLevel;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly sourceRepo?: string;
  readonly targetRepo?: string;
}

export interface MigrationContext {
  readonly runId: string;
  readonly scope: MigrationScopeTarget;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly signal: AbortSignal;
  readonly dryRun: boolean;
  readonly continueOnError: boolean;
  readonly logger: StructuredLogger;
}

export type OperationType = 'create' | 'update' | 'noop' | 'skip' | 'warn';

export type {
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
};
