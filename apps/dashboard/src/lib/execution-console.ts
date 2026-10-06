export interface PipelineStageInfo {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  durationSeconds?: number | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  summary?: string | undefined;
  error?: string | undefined;
}

export const CANONICAL_LINEAR_STAGES: readonly {
  id: string;
  name: string;
}[] = [
  { id: 'preflight', name: '1. Preflight Validation' },
  { id: 'plan', name: '2. Migration Planning' },
  { id: 'gei-repo', name: '3. GEI Repositories' },
  { id: 'releases-lfs', name: '4. Releases & Git LFS' },
  { id: 'rulesets-keys', name: '5. Rulesets & Deploy Keys' },
  { id: 'teams-collaborators', name: '6. Teams & Collaborators' },
  { id: 'verify', name: '7. Post-Migration Verification' },
];

export interface MatrixCohortJob {
  id: string; // e.g. 'cohort-1'
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  repositoryCount: number;
  currentStep?: string | undefined;
  elapsedSeconds?: number | undefined;
  progressPercent?: number | undefined;
  operations?:
    | {
        created?: number | undefined;
        updated?: number | undefined;
        noop?: number | undefined;
        failed?: number | undefined;
      }
    | undefined;
  error?: string | undefined;
}

export function mergePipelineStages(
  runtimeStages?: PipelineStageInfo[] | undefined,
  activeStageId?: string | undefined,
): PipelineStageInfo[] {
  const stageMap = new Map<string, PipelineStageInfo>();
  if (runtimeStages) {
    for (const s of runtimeStages) {
      stageMap.set(s.id, s);
    }
  }

  return CANONICAL_LINEAR_STAGES.map((canonical) => {
    const found = stageMap.get(canonical.id);
    if (found) return found;

    const isCurrent = activeStageId === canonical.id;
    return {
      id: canonical.id,
      name: canonical.name,
      status: isCurrent ? 'in_progress' : 'pending',
    };
  });
}

export function aggregateCohortMetrics(cohorts: MatrixCohortJob[]): {
  totalRepositories: number;
  totalOperations: {
    created: number;
    updated: number;
    noop: number;
    failed: number;
  };
  overallProgressPercent: number;
} {
  const totalRepositories = cohorts.reduce(
    (acc, c) => acc + c.repositoryCount,
    0,
  );
  const totalOperations = cohorts.reduce(
    (acc, c) => {
      if (!c.operations) return acc;
      return {
        created: acc.created + (c.operations.created ?? 0),
        updated: acc.updated + (c.operations.updated ?? 0),
        noop: acc.noop + (c.operations.noop ?? 0),
        failed: acc.failed + (c.operations.failed ?? 0),
      };
    },
    { created: 0, updated: 0, noop: 0, failed: 0 },
  );

  const overallProgressPercent = cohorts.length
    ? Math.round(
        cohorts.reduce((acc, c) => acc + (c.progressPercent ?? 0), 0) /
          cohorts.length,
      )
    : 0;

  return {
    totalRepositories,
    totalOperations,
    overallProgressPercent,
  };
}

export function detectTopology(
  run: {
    topology?: string | undefined;
    cohorts?: MatrixCohortJob[] | undefined;
  },
  viewPreference: 'auto' | 'linear' | 'matrix' = 'auto',
): 'linear' | 'matrix' {
  if (viewPreference !== 'auto') return viewPreference;
  if (run.cohorts && run.cohorts.length > 0) return 'matrix';
  if (run.topology === 'linear') return 'linear';
  return 'matrix';
}

export function formatResumeDispatchPayload(options: {
  sourceOrg: string;
  resumeRef?: string | undefined;
  runnerLabels?: string | undefined;
}): {
  owner: string;
  repo: string;
  ref: string;
  inputs: {
    resume_ref: string;
    runner_labels: string;
  };
} {
  return {
    owner: options.sourceOrg,
    repo: 'ghec-consultant-suite',
    ref: 'main',
    inputs: {
      resume_ref: options.resumeRef || 'latest',
      runner_labels: options.runnerLabels || 'ubuntu-latest',
    },
  };
}

export function formatCancelRunUrl(options: {
  runId: number | string;
  owner: string;
  repo?: string | undefined;
}): string {
  const repo = options.repo || 'ghec-consultant-suite';
  return `/api/actions/runs/${options.runId}/cancel?owner=${encodeURIComponent(options.owner)}&repo=${encodeURIComponent(repo)}`;
}
