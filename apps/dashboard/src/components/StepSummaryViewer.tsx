import React, { useMemo, useState } from 'react';
import { Button, Dialog, Flash, Label } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  ReportIcon,
  ShieldCheckIcon,
} from '@primer/octicons-react';
import {
  aggregateOperationsBreakdown,
  parseStepSummaryMarkdown,
  type AggregateReportsInput,
  type ModuleOperationSummary,
} from '../lib/step-summary.js';
import { OperationsBreakdownTable } from './OperationsBreakdownTable.js';

export interface UnpackedArtifactsData {
  plan?: Record<string, unknown> | undefined;
  verification?: Record<string, unknown> | undefined;
  preflight?: Record<string, unknown> | undefined;
  cohorts?:
    | Array<{
        id: string;
        name?: string;
        modules?: Record<string, unknown>;
        operations?: {
          created?: number;
          updated?: number;
          noop?: number;
          failed?: number;
        };
      }>
    | undefined;
  rawFiles?: Record<string, unknown> | undefined;
}

export interface StepSummaryViewerProps {
  markdownSummary?: string | undefined;
  artifacts?: UnpackedArtifactsData | undefined;
  runId?: number | string | undefined;
  sourceOrg?: string | undefined;
  targetOrg?: string | undefined;
  onNavigateToModule?: ((moduleId: string) => void) | undefined;
}

export const StepSummaryViewer: React.FC<StepSummaryViewerProps> = ({
  markdownSummary = '',
  artifacts,
  runId,
  sourceOrg,
  targetOrg,
  onNavigateToModule,
}) => {
  const [activeTab, setActiveTab] = useState<
    'summary' | 'breakdown' | 'artifacts'
  >('summary');
  const [selectedArtifactForModal, setSelectedArtifactForModal] = useState<{
    name: string;
    content: unknown;
  } | null>(null);
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  const parsedSummary = useMemo(() => {
    return parseStepSummaryMarkdown(markdownSummary);
  }, [markdownSummary]);

  const operationsBreakdown: ModuleOperationSummary[] = useMemo(() => {
    const input: AggregateReportsInput = {
      plan: artifacts?.plan as AggregateReportsInput['plan'],
      verification:
        artifacts?.verification as AggregateReportsInput['verification'],
      cohorts: artifacts?.cohorts as AggregateReportsInput['cohorts'],
    };
    return aggregateOperationsBreakdown(input);
  }, [artifacts]);

  // Construct artifact files list from available unpacked artifacts
  const artifactFiles = useMemo(() => {
    const list: Array<{
      name: string;
      type: string;
      size: string;
      content: unknown;
    }> = [];

    if (artifacts?.plan) {
      const contentStr = JSON.stringify(artifacts.plan, null, 2);
      list.push({
        name: 'migration-plan.json',
        type: 'Migration Plan',
        size: `${Math.round(contentStr.length / 1024)} KB`,
        content: artifacts.plan,
      });
    }

    if (artifacts?.verification) {
      const contentStr = JSON.stringify(artifacts.verification, null, 2);
      list.push({
        name: 'verification-report.json',
        type: 'Verification Report',
        size: `${Math.round(contentStr.length / 1024)} KB`,
        content: artifacts.verification,
      });
    }

    if (artifacts?.preflight) {
      const contentStr = JSON.stringify(artifacts.preflight, null, 2);
      list.push({
        name: 'preflight-report.json',
        type: 'Preflight Report',
        size: `${Math.round(contentStr.length / 1024)} KB`,
        content: artifacts.preflight,
      });
    }

    if (artifacts?.cohorts && artifacts.cohorts.length > 0) {
      artifacts.cohorts.forEach((cohort) => {
        const contentStr = JSON.stringify(cohort, null, 2);
        list.push({
          name: `cohort-report-${cohort.id}.json`,
          type: `Cohort Report (${cohort.name || cohort.id})`,
          size: `${Math.round(contentStr.length / 1024)} KB`,
          content: cohort,
        });
      });
    }

    if (artifacts?.rawFiles) {
      Object.entries(artifacts.rawFiles).forEach(([name, content]) => {
        if (!list.some((item) => item.name === name)) {
          const contentStr = JSON.stringify(content, null, 2);
          list.push({
            name,
            type: 'Unpacked File',
            size: `${Math.round(contentStr.length / 1024)} KB`,
            content,
          });
        }
      });
    }

    return list;
  }, [artifacts]);

  const handleDownload = (filename: string, content: unknown) => {
    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = (content: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopiedStatus('Copied JSON to clipboard');
    setTimeout(() => setCopiedStatus(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-4 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[var(--fgColor-default)] m-0">
              {parsedSummary.title || 'Step Summary & Execution Artifacts'}
            </h3>
            {runId && (
              <Label variant="secondary" className="font-mono text-xs">
                Run #{runId}
              </Label>
            )}
          </div>
          <div className="text-xs text-[var(--fgColor-muted)] mt-1 flex flex-wrap items-center gap-3">
            {sourceOrg && (
              <span>
                Source:{' '}
                <span className="font-mono font-medium text-[var(--fgColor-default)]">
                  {sourceOrg}
                </span>
              </span>
            )}
            {targetOrg && (
              <span>
                Target:{' '}
                <span className="font-mono font-medium text-[var(--fgColor-default)]">
                  {targetOrg}
                </span>
              </span>
            )}
            {parsedSummary.duration && (
              <span className="flex items-center gap-1">
                <ClockIcon size={12} /> {parsedSummary.duration}
              </span>
            )}
            {parsedSummary.mode && (
              <span>
                Mode:{' '}
                <span className="font-medium text-[var(--fgColor-default)]">
                  {parsedSummary.mode}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex rounded border border-[var(--borderColor-default)] overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'summary'
                ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)]'
                : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
            }`}
          >
            <ReportIcon size={14} /> Markdown Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('breakdown')}
            className={`px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'breakdown'
                ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)]'
                : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
            }`}
          >
            <ShieldCheckIcon size={14} /> Operations Breakdown (
            {operationsBreakdown.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('artifacts')}
            className={`px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'artifacts'
                ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)]'
                : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
            }`}
          >
            <FileCodeIcon size={14} /> Artifact Reports ({artifactFiles.length})
          </button>
        </div>
      </div>

      {copiedStatus && (
        <Flash variant="success">
          <CheckCircleIcon size={16} /> {copiedStatus}
        </Flash>
      )}

      {/* 1. Markdown Summary View */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Render Parsed Alerts */}
          {parsedSummary.alerts.map((alert, idx) => (
            <Flash
              key={idx}
              variant={
                alert.type === 'caution'
                  ? 'danger'
                  : alert.type === 'warning'
                    ? 'warning'
                    : 'default'
              }
            >
              <div className="flex items-start gap-2">
                <AlertIcon size={16} className="mt-0.5" />
                <div>
                  <div className="font-semibold text-xs mb-1">
                    {alert.title}
                  </div>
                  {alert.items.length > 0 && (
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {alert.items.map((item, itemIdx) => (
                        <li key={itemIdx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Flash>
          ))}

          {/* Raw / Rendered Markdown Box */}
          <div className="p-4 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)]">
            <div className="text-xs font-semibold text-[var(--fgColor-muted)] uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Actions Step Summary Payload</span>
              <Button
                size="small"
                leadingVisual={CopyIcon}
                onClick={() => {
                  navigator.clipboard.writeText(markdownSummary);
                  setCopiedStatus('Copied Markdown summary to clipboard');
                  setTimeout(() => setCopiedStatus(null), 2500);
                }}
              >
                Copy Markdown
              </Button>
            </div>
            <pre className="p-3 rounded bg-[var(--canvas-subtle)] text-xs font-mono text-[var(--fgColor-default)] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[500px]">
              {markdownSummary ||
                'No Step Summary content available for this run.'}
            </pre>
          </div>
        </div>
      )}

      {/* 2. Operations Breakdown View */}
      {activeTab === 'breakdown' && (
        <OperationsBreakdownTable
          operations={operationsBreakdown}
          onSelectModule={onNavigateToModule}
        />
      )}

      {/* 3. Artifact Reports View */}
      {activeTab === 'artifacts' && (
        <div className="space-y-4">
          <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] text-xs text-[var(--fgColor-muted)]">
            These JSON reports were decompressed from the GitHub Actions run
            artifact bundle. You can inspect them in-browser or download them
            for offline compliance auditing.
          </div>

          <div className="rounded border border-[var(--borderColor-default)] overflow-hidden bg-[var(--canvas-default)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] font-semibold">
                  <th className="py-2.5 px-4">Artifact File</th>
                  <th className="py-2.5 px-4">Report Type</th>
                  <th className="py-2.5 px-4">Size</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--borderColor-muted)]">
                {artifactFiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-[var(--fgColor-muted)]"
                    >
                      No unpacked artifacts discovered for this run.
                    </td>
                  </tr>
                ) : (
                  artifactFiles.map((artifact) => (
                    <tr
                      key={artifact.name}
                      className="hover:bg-[var(--canvas-subtle)] transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-[var(--fgColor-default)] flex items-center gap-2">
                        <FileCodeIcon
                          size={14}
                          className="text-[var(--fgColor-accent)]"
                        />
                        {artifact.name}
                      </td>
                      <td className="py-2.5 px-4 text-[var(--fgColor-muted)]">
                        {artifact.type}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[var(--fgColor-muted)]">
                        {artifact.size}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="small"
                            leadingVisual={EyeIcon}
                            onClick={() =>
                              setSelectedArtifactForModal({
                                name: artifact.name,
                                content: artifact.content,
                              })
                            }
                          >
                            Inspect
                          </Button>
                          <Button
                            size="small"
                            leadingVisual={DownloadIcon}
                            onClick={() =>
                              handleDownload(artifact.name, artifact.content)
                            }
                          >
                            Download
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JSON Inspector Modal */}
      {selectedArtifactForModal && (
        <Dialog
          title={`Artifact Inspector: ${selectedArtifactForModal.name}`}
          onClose={() => setSelectedArtifactForModal(null)}
          className="w-full max-w-4xl"
        >
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-[var(--fgColor-muted)]">
              <span>JSON Payload Viewer</span>
              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  leadingVisual={CopyIcon}
                  onClick={() =>
                    handleCopyJson(selectedArtifactForModal.content)
                  }
                >
                  Copy JSON
                </Button>
                <Button
                  size="small"
                  leadingVisual={DownloadIcon}
                  onClick={() =>
                    handleDownload(
                      selectedArtifactForModal.name,
                      selectedArtifactForModal.content,
                    )
                  }
                >
                  Download
                </Button>
              </div>
            </div>

            <pre className="p-3 rounded bg-[var(--canvas-subtle)] text-xs font-mono text-[var(--fgColor-default)] overflow-x-auto max-h-[500px] border border-[var(--borderColor-default)]">
              {JSON.stringify(selectedArtifactForModal.content, null, 2)}
            </pre>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedArtifactForModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
