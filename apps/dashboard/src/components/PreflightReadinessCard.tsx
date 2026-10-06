import React from 'react';
import { Button, Label, Spinner } from '@primer/react';
import {
  AlertIcon,
  CheckCircleFillIcon,
  ShieldCheckIcon,
  StopIcon,
  SyncIcon,
} from '@primer/octicons-react';
import type { MigrationPreflightReport } from '@ghec/contracts';

export type PreflightStatus =
  'idle' | 'checking' | 'ready' | 'warning' | 'blocked' | 'error';

export interface PreflightReadinessCardProps {
  status: PreflightStatus;
  report?: MigrationPreflightReport | null;
  blockers?: readonly string[];
  warnings?: readonly string[];
  errorMessage?: string | null;
  onRunPreflight: () => void;
  disabled?: boolean;
}

export const PreflightReadinessCard: React.FC<PreflightReadinessCardProps> = ({
  status,
  report,
  blockers = [],
  warnings = [],
  errorMessage,
  onRunPreflight,
  disabled = false,
}) => {
  const isChecking = status === 'checking';

  let borderClass = 'border-[var(--borderColor-default)]';
  let bgClass = 'bg-[var(--canvas-subtle)]';

  if (status === 'ready') {
    borderClass = 'border-[var(--color-success-emphasis)]';
    bgClass = 'bg-[var(--color-success-subtle)]';
  } else if (status === 'warning') {
    borderClass = 'border-[var(--color-attention-emphasis)]';
    bgClass = 'bg-[var(--color-attention-subtle)]';
  } else if (status === 'blocked' || status === 'error') {
    borderClass = 'border-[var(--color-danger-emphasis)]';
    bgClass = 'bg-[var(--color-danger-subtle)]';
  }

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col gap-3 ${borderClass} ${bgClass}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon size={20} />
          <h4 className="text-sm font-bold text-[var(--fgColor-default)] m-0">
            Preflight Readiness Gate
          </h4>
          {status === 'ready' && (
            <Label variant="success">Ready for Migration</Label>
          )}
          {status === 'warning' && (
            <Label variant="attention">Warnings Detected</Label>
          )}
          {status === 'blocked' && (
            <Label variant="danger">Blocked: Action Required</Label>
          )}
          {status === 'error' && (
            <Label variant="danger">Evaluation Failed</Label>
          )}
        </div>
        <Button
          size="small"
          onClick={onRunPreflight}
          disabled={disabled || isChecking}
          leadingVisual={isChecking ? Spinner : SyncIcon}
        >
          {isChecking ? 'Evaluating Readiness...' : 'Run Preflight Check'}
        </Button>
      </div>

      {status === 'idle' && (
        <p className="text-xs text-[var(--fgColor-muted)] m-0">
          Evaluate credential scopes, ruleset bypasses, name conflicts, and
          sizing limits before dispatching this migration wave.
        </p>
      )}

      {status === 'ready' && (
        <div className="flex items-center gap-2">
          <CheckCircleFillIcon size={16} fill="var(--color-success-fg)" />
          <span className="text-xs font-semibold text-[var(--fgColor-default)]">
            All preflight checks passed. Target organization and credentials are
            fully validated for live apply.
          </span>
        </div>
      )}

      {status === 'warning' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <AlertIcon size={16} fill="var(--color-attention-fg)" />
            <span className="text-xs font-semibold text-[var(--fgColor-default)]">
              Preflight advisories found:
            </span>
          </div>
          <ul className="m-0 pl-4 text-xs text-[var(--fgColor-default)] list-disc">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {(status === 'blocked' || (blockers && blockers.length > 0)) && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <StopIcon size={16} fill="var(--color-danger-fg)" />
            <span className="text-xs font-bold text-[var(--color-danger-fg)]">
              Migration dispatch blocked by the following fatal conditions:
            </span>
          </div>
          <ul className="m-0 pl-4 text-xs text-[var(--color-danger-fg)] list-disc">
            {blockers.map((b, idx) => (
              <li key={idx}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {errorMessage && (
        <div className="text-xs text-[var(--color-danger-fg)]">
          Error: {errorMessage}
        </div>
      )}

      {report && (
        <div className="flex gap-4 pt-2 border-t border-[var(--borderColor-muted)] text-xs text-[var(--fgColor-muted)]">
          <span>
            Evaluated Repositories: {report.repositoryAssessments.length}
          </span>
          <span>
            Ready:{' '}
            {
              report.repositoryAssessments.filter((r) => r.status === 'ready')
                .length
            }
          </span>
          <span>
            Ready with Follow-up:{' '}
            {
              report.repositoryAssessments.filter(
                (r) => r.status === 'ready-with-follow-up',
              ).length
            }
          </span>
          <span>
            Blocked:{' '}
            {
              report.repositoryAssessments.filter((r) => r.status === 'blocked')
                .length
            }
          </span>
        </div>
      )}
    </div>
  );
};
