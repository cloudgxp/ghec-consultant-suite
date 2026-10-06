import type { MigrationScope, ModuleExecutionResult } from '@ghec/contracts';

export const CHECKPOINT_STAGES = [
  'preflight',
  'targetPrep',
  'gei',
  'specializedStrategies',
  'apiModules',
  'postMigration',
  'verification',
] as const;

export type CheckpointStage = (typeof CHECKPOINT_STAGES)[number];
export type TerminalStageStatus = 'completed' | 'failed' | 'skipped';

export interface PreflightCheckpoint {
  status: 'pending' | 'evaluated' | 'failed';
  assessment?: unknown;
}

export interface TargetPrepCheckpoint {
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface GeiCheckpoint {
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  migrationId?: string;
  skippedReleases?: boolean;
  error?: string;
}

export interface TerminalStageCheckpoint {
  status: TerminalStageStatus;
  error?: string;
}

export type SpecializedStrategyId = 'git-lfs' | 'releases-fallback';
export type PostMigrationTaskId =
  | 'repo-visibility'
  | 'repo-settings'
  | 'webhooks'
  | 'mannequins'
  | 'codeowners'
  | 'security';

export interface VerificationCheckpoint {
  status: 'pending' | 'passed' | 'failed';
  reportUri?: string;
}

export interface RepositoryCheckpoint {
  preflight: PreflightCheckpoint;
  targetPrep: TargetPrepCheckpoint;
  gei: GeiCheckpoint;
  specializedStrategies: Partial<
    Record<SpecializedStrategyId, TerminalStageCheckpoint>
  >;
  apiModules: Record<string, TerminalStageCheckpoint>;
  postMigration: Partial<Record<PostMigrationTaskId, TerminalStageCheckpoint>>;
  verification: VerificationCheckpoint;
}

export interface MigrationCheckpointManifest {
  runId: string;
  startedAt: string;
  updatedAt: string;
  scope: MigrationScope;
  repositories: Record<string, RepositoryCheckpoint>;
}

export type StageResult =
  | PreflightCheckpoint
  | TargetPrepCheckpoint
  | GeiCheckpoint
  | RepositoryCheckpoint['specializedStrategies']
  | RepositoryCheckpoint['apiModules']
  | RepositoryCheckpoint['postMigration']
  | VerificationCheckpoint;

export type CheckpointModuleExecutionResult = ModuleExecutionResult;
