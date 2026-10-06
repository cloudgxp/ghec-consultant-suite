import React from 'react';
import { Label, ProgressBar } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  CpuIcon,
  RepoIcon,
  SyncIcon,
} from '@primer/octicons-react';
import type { MatrixCohortJob } from '../lib/execution-console.js';

export { type MatrixCohortJob };

export interface JobMatrixGridProps {
  slicerStatus?: 'pending' | 'in_progress' | 'completed' | 'failed' | undefined;
  slicerSummary?: string | undefined;
  cohorts?: MatrixCohortJob[] | undefined;
  aggregateStatus?:
    'pending' | 'in_progress' | 'completed' | 'failed' | undefined;
  aggregateSummary?: string | undefined;
}

export const JobMatrixGrid: React.FC<JobMatrixGridProps> = ({
  slicerStatus = 'completed',
  slicerSummary = 'Scope partitioned into independent execution cohorts',
  cohorts = [],
  aggregateStatus = 'pending',
  aggregateSummary = 'Fan-in discrepancy validation across all completed cohorts',
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <CheckCircleIcon
            size={14}
            className="text-[var(--fgColor-success)]"
          />
        );
      case 'in_progress':
        return (
          <SyncIcon
            size={14}
            className="text-[var(--fgColor-accent)] animate-spin"
          />
        );
      case 'failed':
        return <AlertIcon size={14} className="text-[var(--fgColor-danger)]" />;
      default:
        return <ClockIcon size={14} className="text-[var(--fgColor-muted)]" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'accent';
      case 'failed':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--fgColor-default)] uppercase tracking-wide">
            Parallel Matrix Topology (Fan-Out / Fan-In)
          </h3>
          <p className="text-xs text-[var(--fgColor-muted)]">
            Autonomous multi-runner cohort matrix processing repository slices
            concurrently.
          </p>
        </div>
      </div>

      {/* Phase 1: Slicer */}
      <div className="p-3.5 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <CpuIcon size={18} className="text-[var(--fgColor-accent)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--fgColor-default)]">
                Phase 1: Scope Slicer & DAG Planner
              </span>
              <Label size="small" variant={getStatusVariant(slicerStatus)}>
                {slicerStatus}
              </Label>
            </div>
            <p className="text-xs text-[var(--fgColor-muted)] mt-0.5">
              {slicerSummary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--fgColor-muted)] font-mono">
          {getStatusIcon(slicerStatus)}
        </div>
      </div>

      {/* Phase 2: Dynamic Matrix Cohorts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--fgColor-default)] uppercase tracking-wider">
            Phase 2: Active Matrix Cohorts ({cohorts.length} Runners)
          </span>
          <span className="text-xs text-[var(--fgColor-muted)]">
            Dynamic fan-out matrix
          </span>
        </div>

        {cohorts.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-[var(--borderColor-default)] text-center text-xs text-[var(--fgColor-muted)]">
            No active matrix cohorts running. Cohorts will appear here when a
            matrix wave is dispatched.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {cohorts.map((cohort) => {
              const pct = Math.min(
                100,
                Math.max(0, cohort.progressPercent ?? 0),
              );
              return (
                <div
                  key={cohort.id}
                  data-testid={`cohort-${cohort.id}`}
                  className={`p-4 rounded-lg border transition-all flex flex-col justify-between ${
                    cohort.status === 'in_progress'
                      ? 'border-[var(--borderColor-accent-emphasis)] bg-[var(--canvas-subtle)] ring-1 ring-[var(--borderColor-accent-emphasis)]'
                      : cohort.status === 'failed'
                        ? 'border-[var(--borderColor-danger-emphasis)] bg-[var(--canvas-subtle)]'
                        : 'border-[var(--borderColor-default)] bg-[var(--canvas-default)]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="text-sm font-bold text-[var(--fgColor-default)] flex items-center gap-1.5">
                          <span>{cohort.name}</span>
                          <span className="text-[11px] font-normal text-[var(--fgColor-muted)]">
                            ({cohort.id})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--fgColor-muted)]">
                          <span className="flex items-center gap-1">
                            <RepoIcon size={12} /> {cohort.repositoryCount}{' '}
                            repos
                          </span>
                          {cohort.elapsedSeconds !== undefined && (
                            <span>• {cohort.elapsedSeconds}s elapsed</span>
                          )}
                        </div>
                      </div>
                      <Label
                        size="small"
                        variant={getStatusVariant(cohort.status)}
                      >
                        {cohort.status.replace('_', ' ')}
                      </Label>
                    </div>

                    {cohort.currentStep && (
                      <div className="mb-3 text-xs text-[var(--fgColor-default)] flex items-center gap-1.5">
                        <span className="text-[var(--fgColor-muted)]">
                          Step:
                        </span>
                        <code className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--canvas-inset)] text-[var(--fgColor-accent)] font-mono">
                          {cohort.currentStep}
                        </code>
                      </div>
                    )}

                    {/* Progress Bar */}
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between text-[11px] text-[var(--fgColor-muted)]">
                        <span>Progress</span>
                        <span className="font-mono font-medium">{pct}%</span>
                      </div>
                      <ProgressBar
                        progress={pct}
                        aria-label={`${cohort.name} progress: ${pct}%`}
                      />
                    </div>

                    {/* Operations Stats */}
                    {cohort.operations && (
                      <div className="grid grid-cols-4 gap-1 text-center py-1.5 px-2 rounded bg-[var(--canvas-inset)] text-[10px] font-mono">
                        <div>
                          <div className="text-[var(--fgColor-success)] font-bold">
                            {cohort.operations.created ?? 0}
                          </div>
                          <div className="text-[var(--fgColor-muted)]">add</div>
                        </div>
                        <div>
                          <div className="text-[var(--fgColor-accent)] font-bold">
                            {cohort.operations.updated ?? 0}
                          </div>
                          <div className="text-[var(--fgColor-muted)]">upd</div>
                        </div>
                        <div>
                          <div className="text-[var(--fgColor-muted)] font-bold">
                            {cohort.operations.noop ?? 0}
                          </div>
                          <div className="text-[var(--fgColor-muted)]">
                            noop
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--fgColor-danger)] font-bold">
                            {cohort.operations.failed ?? 0}
                          </div>
                          <div className="text-[var(--fgColor-muted)]">err</div>
                        </div>
                      </div>
                    )}

                    {cohort.error && (
                      <div className="mt-2 p-2 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-danger-emphasis)] text-xs text-[var(--fgColor-danger)]">
                        {cohort.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Phase 3: Fan-In Aggregate & Verify */}
      <div className="p-3.5 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <CheckCircleIcon
              size={18}
              className="text-[var(--fgColor-success)]"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--fgColor-default)]">
                Phase 3: Aggregate Verification & Reporting
              </span>
              <Label size="small" variant={getStatusVariant(aggregateStatus)}>
                {aggregateStatus}
              </Label>
            </div>
            <p className="text-xs text-[var(--fgColor-muted)] mt-0.5">
              {aggregateSummary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--fgColor-muted)] font-mono">
          {getStatusIcon(aggregateStatus)}
        </div>
      </div>
    </div>
  );
};
