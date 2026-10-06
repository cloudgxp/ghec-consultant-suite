export interface WaveDispatchOptions {
  scope: string;
  batchSize?: number | undefined;
  modules?: string[] | undefined;
  dryRun?: boolean | undefined;
  continueOnError?: boolean | undefined;
  runnerLabels?: string[] | undefined;
  environmentGate?: string | undefined;
  ref?: string | undefined;
}

export interface TestDispatchOptions {
  scope: string;
  stage?: string | undefined;
  modules?: string[] | undefined;
  dryRun?: boolean | undefined;
  enablePreflight?: boolean | undefined;
  ref?: string | undefined;
}

export interface ResumeDispatchOptions {
  checkpointId?: string | undefined;
  ref?: string | undefined;
}

export interface RunDetails {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | string;
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required'
    | 'skipped'
    | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  runAttempt: number;
  event: string;
}

export interface JobStepDetails {
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: string | null;
  number: number;
  startedAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  durationMs?: number | null | undefined;
}

export interface JobDetails {
  id: number;
  runId: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  steps: JobStepDetails[];
  isMatrixCohort: boolean;
  cohortIdentifier?: string | null | undefined;
}

export interface ArtifactSummary {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  archiveDownloadUrl: string;
}

export interface WaveRunArtifacts {
  rawFiles: Record<string, unknown>;
  plan?: unknown | undefined;
  verification?: unknown | undefined;
  cohorts: unknown[];
  preflight?: unknown | undefined;
}
