import React from 'react';
import { Label } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  DotFillIcon,
  SyncIcon,
} from '@primer/octicons-react';
import {
  CANONICAL_LINEAR_STAGES,
  mergePipelineStages,
  type PipelineStageInfo,
} from '../lib/execution-console.js';

export { CANONICAL_LINEAR_STAGES, type PipelineStageInfo };

export interface LinearPipelineTimelineProps {
  stages?: PipelineStageInfo[] | undefined;
  activeStageId?: string | undefined;
  overallStatus?: string | undefined;
}

export const LinearPipelineTimeline: React.FC<LinearPipelineTimelineProps> = ({
  stages,
  activeStageId,
}) => {
  const mergedStages = mergePipelineStages(stages, activeStageId);

  const getStatusBadge = (status: PipelineStageInfo['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--fgColor-success)]">
            <CheckCircleIcon size={14} /> Completed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--fgColor-accent)] animate-pulse">
            <SyncIcon size={14} className="animate-spin" /> In Progress
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--fgColor-danger)]">
            <AlertIcon size={14} /> Failed
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fgColor-muted)]">
            <DotFillIcon size={14} /> Skipped
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fgColor-muted)]">
            <ClockIcon size={14} /> Pending
          </span>
        );
    }
  };

  const getCardBorder = (status: PipelineStageInfo['status']) => {
    switch (status) {
      case 'completed':
        return 'border-[var(--borderColor-success-emphasis)] bg-[var(--canvas-subtle)]';
      case 'in_progress':
        return 'border-[var(--borderColor-accent-emphasis)] bg-[var(--canvas-subtle)] ring-1 ring-[var(--borderColor-accent-emphasis)]';
      case 'failed':
        return 'border-[var(--borderColor-danger-emphasis)] bg-[var(--canvas-subtle)] ring-1 ring-[var(--borderColor-danger-emphasis)]';
      default:
        return 'border-[var(--borderColor-default)] bg-[var(--canvas-default)] opacity-75';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--fgColor-default)] uppercase tracking-wide">
            Linear Runner Pipeline (7 Sequential Stages)
          </h3>
          <p className="text-xs text-[var(--fgColor-muted)]">
            Deterministic step sequence executed by a single GitHub Actions
            runner.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
        {mergedStages.map((stage, idx) => (
          <div
            key={stage.id}
            data-testid={`stage-${stage.id}`}
            className={`p-3 rounded-md border flex flex-col justify-between transition-all ${getCardBorder(
              stage.status,
            )}`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono text-[var(--fgColor-muted)] uppercase">
                  Stage {idx + 1}
                </span>
                <Label
                  size="small"
                  variant={
                    stage.status === 'completed'
                      ? 'success'
                      : stage.status === 'in_progress'
                        ? 'accent'
                        : stage.status === 'failed'
                          ? 'danger'
                          : 'secondary'
                  }
                >
                  {stage.status.replace('_', ' ')}
                </Label>
              </div>

              <h4 className="text-xs font-bold text-[var(--fgColor-default)] mb-1 leading-snug">
                {stage.name}
              </h4>

              {stage.summary && (
                <p className="text-[11px] text-[var(--fgColor-muted)] line-clamp-2 mt-1">
                  {stage.summary}
                </p>
              )}

              {stage.error && (
                <div className="mt-1.5 p-1.5 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-danger-emphasis)] text-[11px] text-[var(--fgColor-danger)]">
                  {stage.error}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-[var(--borderColor-muted)] flex items-center justify-between text-[11px] text-[var(--fgColor-muted)]">
              <div>{getStatusBadge(stage.status)}</div>
              {stage.durationSeconds !== undefined && (
                <span className="font-mono text-[10px]">
                  {stage.durationSeconds}s
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
