import React, { useState } from 'react';
import { Button, Label } from '@primer/react';
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  DiffIcon,
  SyncIcon,
} from '@primer/octicons-react';
import type {
  ClassifiedDiscrepancy,
  DiscrepancySeverity,
} from '../lib/verification-diff.js';

export interface DiscrepancyCardProps {
  discrepancy: ClassifiedDiscrepancy;
  onReverify?: ((discrepancy: ClassifiedDiscrepancy) => void) | undefined;
}

const severityLabelVariant: Record<
  DiscrepancySeverity,
  'danger' | 'attention' | 'severe' | 'accent'
> = {
  critical: 'danger',
  high: 'severe',
  medium: 'attention',
  low: 'accent',
};

export const DiscrepancyCard: React.FC<DiscrepancyCardProps> = ({
  discrepancy,
  onReverify,
}) => {
  const [copied, setCopied] = useState(false);
  const [reverifying, setReverifying] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(discrepancy.remediationCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false);
    }
  };

  const handleReverify = () => {
    setReverifying(true);
    onReverify?.(discrepancy);
    setTimeout(() => setReverifying(false), 1200);
  };

  return (
    <div className="p-4 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-default)] shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--borderColor-muted)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label
            variant={severityLabelVariant[discrepancy.severity]}
            size="small"
            className="uppercase font-bold tracking-wider"
          >
            {discrepancy.severity}
          </Label>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] border border-[var(--borderColor-muted)]">
            {discrepancy.moduleId}
          </span>
          <span className="font-bold text-sm text-[var(--fgColor-default)] break-all">
            {discrepancy.resourceName}
          </span>
        </div>
        <div className="text-xs text-[var(--fgColor-muted)] font-mono">
          ID: {discrepancy.id}
        </div>
      </div>

      {/* Discrepancy Message */}
      <div className="flex items-start gap-2.5 p-3 rounded-md bg-[var(--canvas-subtle)] border-l-4 border-[var(--borderColor-danger-emphasis)] text-sm">
        <AlertIcon
          size={16}
          className="text-[var(--fgColor-danger)] mt-0.5 shrink-0"
        />
        <div className="text-[var(--fgColor-default)] font-medium">
          {discrepancy.message}
        </div>
      </div>

      {/* Side-by-Side Diff Comparison */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fgColor-muted)]">
          <DiffIcon size={14} />
          <span>Expected Planned State vs. Actual Observed State</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Expected / Planned */}
          <div className="p-3 rounded border border-[var(--borderColor-success-emphasis)] bg-[var(--canvas-subtle)]">
            <div className="text-xs font-bold text-[var(--fgColor-success)] mb-1.5 flex items-center gap-1">
              <span>Expected (Planned Migration Target)</span>
            </div>
            <pre className="font-mono text-xs text-[var(--fgColor-default)] whitespace-pre-wrap break-all overflow-x-auto max-h-48 p-2 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-muted)]">
              {discrepancy.expectedFormatted}
            </pre>
          </div>

          {/* Actual / Observed */}
          <div className="p-3 rounded border border-[var(--borderColor-danger-emphasis)] bg-[var(--canvas-subtle)]">
            <div className="text-xs font-bold text-[var(--fgColor-danger)] mb-1.5 flex items-center gap-1">
              <span>Actual (Observed Drift on Destination)</span>
            </div>
            <pre className="font-mono text-xs text-[var(--fgColor-default)] whitespace-pre-wrap break-all overflow-x-auto max-h-48 p-2 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-muted)]">
              {discrepancy.actualFormatted}
            </pre>
          </div>
        </div>
      </div>

      {/* Actionable Remediation Box */}
      <div className="p-3 rounded-md bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[var(--fgColor-default)]">
            Actionable Remediation Guidance:
          </div>
          <div className="text-xs text-[var(--fgColor-muted)] italic">
            {discrepancy.remediationRationale}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <pre className="flex-1 font-mono text-xs p-2 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-muted)] text-[var(--fgColor-default)] overflow-x-auto whitespace-pre">
            {discrepancy.remediationCommand}
          </pre>
          <Button
            size="small"
            leadingVisual={copied ? CheckIcon : CopyIcon}
            onClick={handleCopy}
            aria-label="Copy remediation command to clipboard"
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {onReverify && (
            <Button
              size="small"
              leadingVisual={SyncIcon}
              onClick={handleReverify}
              disabled={reverifying}
              aria-label="Re-verify resource against target"
            >
              {reverifying ? 'Checking...' : 'Re-verify'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
