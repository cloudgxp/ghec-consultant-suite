import type {
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  RepositoryOptions,
  VerificationDiscrepancy,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { SecretValueProvider } from '../modules/repo-secrets/types.js';

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
  readonly options?: RepositoryOptions | undefined;
}

export interface TargetWriteOperation {
  readonly id: string;
  readonly method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly pathParams?: Readonly<Record<string, string>> | undefined;
  readonly body?: unknown | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface TargetWriteClient {
  mutate<T = unknown>(
    operation: TargetWriteOperation,
    signal: AbortSignal,
  ): Promise<{ status: number; data?: T | undefined }>;
}

export interface MigrationContext {
  readonly runId: string;
  readonly scope: MigrationScopeTarget;
  readonly sourceClient: GitHubReadAdapter;
  readonly targetClient: GitHubReadAdapter;
  readonly targetWriteClient?: TargetWriteClient | undefined;
  readonly secretValueProvider?: SecretValueProvider | undefined;
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
