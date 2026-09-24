import React from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import {
  formatBytes,
  formatTimestamp,
  formatDuration,
} from '../lib/formatters.js';
import { generateExecutiveSummaryCsv, downloadCsv } from '../lib/export-csv.js';

interface OverviewTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  onNavigateTab: (tabId: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  bundle,
  insights,
  onNavigateTab,
}) => {
  // Calculate total observed repo storage
  const repos = bundle.entities.filter((e) => e.kind === 'repository');
  let observedRepoBytes = 0;
  let hasUnknownRepoSize = false;
  for (const r of repos) {
    if (r.kind === 'repository') {
      if (r.size.availability === 'observed' && r.size.value !== null) {
        observedRepoBytes += r.size.value;
      } else {
        hasUnknownRepoSize = true;
      }
    }
  }

  // Count findings by severity
  const highFindings = insights.findings.filter((f) => f.severity === 'high');
  const medFindings = insights.findings.filter((f) => f.severity === 'medium');
  const lowFindings = insights.findings.filter((f) => f.severity === 'low');

  const handleExportSummary = () => {
    const csv = generateExecutiveSummaryCsv(bundle, insights);
    downloadCsv(`executive-assessment-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-base-content">
              Executive Assessment Overview
            </h2>
            <span
              className={`badge ${
                bundle.scan.status === 'complete'
                  ? 'badge-success'
                  : 'badge-warning'
              }`}
            >
              Scan: {bundle.scan.status}
            </span>
          </div>
          <p className="text-sm text-base-content/70 mt-1">
            Target Scope:{' '}
            <strong className="text-base-content">
              {bundle.scope.kind === 'enterprise'
                ? `Enterprise '${bundle.scope.slug}'`
                : `Organization '${bundle.scope.organizationId}'`}
            </strong>{' '}
            · Scan ID: <code>{bundle.scan.id}</code> · Executed in{' '}
            {formatDuration(bundle.scan.startedAt, bundle.scan.completedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportSummary}
          className="btn btn-primary btn-sm gap-2 shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export Summary (CSV)
        </button>
      </div>

      {/* Scope Warnings / Limitations */}
      {insights.scopeLimitations.length > 0 && (
        <div
          role="region"
          aria-label="Scope caveats"
          className="alert alert-warning shadow-xs border border-warning/30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <h3 className="font-bold">Scope Limitations & Caveats</h3>
            <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
              {insights.scopeLimitations.map((limitation, idx) => (
                <li key={idx}>{limitation}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs">
          <div className="text-xs font-semibold text-base-content/60 uppercase">
            Organizations
          </div>
          <div className="text-2xl font-black text-base-content mt-1">
            {bundle.summary.organizationCount}
          </div>
          <div className="text-[11px] text-base-content/60 mt-1">
            {bundle.scope.kind === 'enterprise'
              ? `Enumeration: ${bundle.scope.enumeration}`
              : 'Direct organization scan'}
          </div>
        </div>

        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs">
          <div className="text-xs font-semibold text-base-content/60 uppercase">
            Repositories
          </div>
          <div className="text-2xl font-black text-base-content mt-1">
            {bundle.summary.repositoryCount}
          </div>
          <div className="text-[11px] text-base-content/60 mt-1">
            Across {bundle.summary.organizationCount} org(s)
          </div>
        </div>

        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs">
          <div className="text-xs font-semibold text-base-content/60 uppercase">
            Observed Storage
          </div>
          <div className="text-2xl font-black text-base-content mt-1">
            {formatBytes(observedRepoBytes)}
          </div>
          <div className="text-[11px] text-base-content/60 mt-1">
            {hasUnknownRepoSize
              ? 'Excludes unmeasurable repos'
              : 'All repos measured'}
          </div>
        </div>

        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs">
          <div className="text-xs font-semibold text-base-content/60 uppercase">
            Collector Health
          </div>
          <div className="text-2xl font-black text-base-content mt-1">
            {insights.collectorSummary.complete} /{' '}
            {insights.collectorSummary.total}
          </div>
          <div className="text-[11px] mt-1">
            {insights.collectorSummary.failed > 0 ? (
              <span className="text-error font-semibold">
                {insights.collectorSummary.failed} collector failed
              </span>
            ) : insights.collectorSummary.partial > 0 ? (
              <span className="text-warning font-semibold">
                {insights.collectorSummary.partial} partial coverage
              </span>
            ) : (
              <span className="text-success font-semibold">100% complete</span>
            )}
          </div>
        </div>

        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs col-span-2 lg:col-span-1">
          <div className="text-xs font-semibold text-base-content/60 uppercase">
            Advisories & Gaps
          </div>
          <div className="text-2xl font-black text-base-content mt-1">
            {insights.findings.length}
          </div>
          <div className="flex gap-1.5 mt-1">
            {highFindings.length > 0 && (
              <span className="badge badge-error badge-xs font-bold">
                {highFindings.length} High
              </span>
            )}
            {medFindings.length > 0 && (
              <span className="badge badge-warning badge-xs font-bold">
                {medFindings.length} Med
              </span>
            )}
            {lowFindings.length > 0 && (
              <span className="badge badge-info badge-xs">
                {lowFindings.length} Low
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Priority Action Items & Friction Points */}
      <div className="card bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-base-content">
              Priority Migration Friction & Readiness Highlights
            </h3>
            <p className="text-xs text-base-content/70">
              Deterministic insights generated from CLI evidence requiring
              customer consultation
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('readiness')}
            className="btn btn-sm btn-ghost text-primary text-xs"
          >
            View All Dimensions &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.dimensions.map((dim) => (
            <div
              key={dim.id}
              className={`p-4 rounded-lg border transition-colors ${
                dim.status === 'review_required'
                  ? 'border-warning/50 bg-warning/5'
                  : dim.status === 'unknown'
                    ? 'border-base-300 bg-base-200/40'
                    : 'border-success/30 bg-success/5'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-base-content">
                  {dim.name}
                </span>
                <span
                  className={`badge badge-sm ${
                    dim.status === 'review_required'
                      ? 'badge-warning font-semibold'
                      : dim.status === 'unknown'
                        ? 'badge-ghost'
                        : 'badge-success'
                  }`}
                >
                  {dim.statusLabel}
                </span>
              </div>
              <p className="text-xs text-base-content/80">{dim.summary}</p>
              {dim.findings.length > 0 && (
                <div className="mt-2 text-[11px] text-base-content/70 font-medium">
                  {dim.findings.length} finding(s) recorded ({dim.ruleId})
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Scan Provenance & CLI Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs">
          <h3 className="text-sm font-bold text-base-content mb-3 uppercase tracking-wider">
            Evidence Collection Configuration
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-base-200">
              <span className="text-base-content/60">CLI Producer:</span>
              <span className="font-mono">
                {bundle.scan.producer} v{bundle.scan.producerVersion}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-base-200">
              <span className="text-base-content/60">Schema Version:</span>
              <span className="font-mono">{bundle.schemaVersion}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-base-200">
              <span className="text-base-content/60">Redaction Profile:</span>
              <span className="badge badge-sm badge-neutral">
                {bundle.configuration.redactionProfile}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-base-200">
              <span className="text-base-content/60">Continue on Error:</span>
              <span>
                {bundle.configuration.continueOnError ? 'True' : 'False'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-base-content/60">Sensitive Metadata:</span>
              <span>
                {bundle.configuration.includeSensitiveMetadata
                  ? 'Included'
                  : 'Excluded (Safe)'}
              </span>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs">
          <h3 className="text-sm font-bold text-base-content mb-3 uppercase tracking-wider">
            Active Discovery Modules ({bundle.configuration.modules.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {bundle.configuration.modules.map((m) => (
              <span key={m} className="badge badge-outline text-xs">
                {m}
              </span>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-base-200 text-xs text-base-content/70">
            Scan started at{' '}
            <strong>{formatTimestamp(bundle.scan.startedAt)}</strong> and
            completed at{' '}
            <strong>{formatTimestamp(bundle.scan.completedAt)}</strong>.
          </div>
        </div>
      </div>
    </div>
  );
};
