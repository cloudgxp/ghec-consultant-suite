import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import {
  getSeverityBadgeClass,
  getDimensionStatusBadgeClass,
  resolveOrgName,
} from '../lib/formatters.js';
import {
  generateMigrationReadinessCsv,
  downloadCsv,
} from '../lib/export-csv.js';

interface MigrationReadinessTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgId: string;
}

export const MigrationReadinessTab: React.FC<MigrationReadinessTabProps> = ({
  bundle,
  insights,
  selectedOrgId,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedDimension, setSelectedDimension] = useState<string>('all');

  const handleExportCsv = () => {
    const csv = generateMigrationReadinessCsv(
      bundle,
      insights,
      selectedOrgId || undefined,
    );
    downloadCsv(`migration-readiness-${bundle.scan.id}.csv`, csv);
  };

  // Filter findings
  const filteredFindings = insights.findings.filter((f) => {
    if (selectedOrgId && f.organizationId !== selectedOrgId) return false;
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (selectedDimension !== 'all' && f.ruleId !== selectedDimension)
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-base-content">
            Migration Readiness & Advisory Analysis
          </h2>
          <p className="text-sm text-base-content/70 mt-1">
            Evaluating {insights.dimensions.length} analytical dimensions
            against collected evidence.
            {selectedOrgId && (
              <span className="font-semibold text-primary ml-1">
                Scoped to {resolveOrgName(bundle, selectedOrgId)}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
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
          Export Findings (CSV)
        </button>
      </div>

      {/* Dimension Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {insights.dimensions.map((dim) => {
          const isSelected = selectedDimension === dim.ruleId;
          const dimFindings = dim.findings.filter(
            (f) => !selectedOrgId || f.organizationId === selectedOrgId,
          );

          return (
            <div
              key={dim.id}
              onClick={() =>
                setSelectedDimension(isSelected ? 'all' : dim.ruleId)
              }
              className={`card p-4 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'border-base-300 bg-base-100 hover:border-primary/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="font-bold text-sm text-base-content">
                  {dim.name}
                </span>
                <span
                  className={`badge badge-sm ${getDimensionStatusBadgeClass(
                    dim.status,
                  )}`}
                >
                  {dim.statusLabel}
                </span>
              </div>
              <div className="text-xs text-base-content/60 mt-1 font-mono">
                {dim.ruleId} · module: {dim.requiredModule}
              </div>
              <p className="text-xs text-base-content/80 mt-2 line-clamp-2">
                {dim.summary}
              </p>
              <div className="mt-3 pt-2 border-t border-base-200 flex justify-between items-center text-xs">
                <span className="font-semibold text-base-content/70">
                  {dimFindings.length} advisory finding(s)
                </span>
                <span className="text-primary text-[11px] font-medium">
                  {isSelected ? 'Clear Filter' : 'Filter &rarr;'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-base-100 rounded-xl border border-base-300 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-base-content/70">
            Severity:
          </label>
          <div className="join">
            {['all', 'high', 'medium', 'low', 'info'].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`join-item btn btn-xs capitalize ${
                  severityFilter === sev ? 'btn-primary' : 'btn-ghost'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {selectedDimension !== 'all' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-base-content/70">
              Filtered by: <strong>{selectedDimension}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDimension('all')}
              className="btn btn-xs btn-ghost text-error"
            >
              Reset Dimension Filter
            </button>
          </div>
        )}
      </div>

      {/* Findings List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-base-content">
            Documented Findings & Advisories ({filteredFindings.length})
          </h3>
        </div>

        {filteredFindings.length === 0 ? (
          <div className="text-center py-12 bg-base-100 rounded-xl border border-base-300">
            <p className="text-base-content/60 text-sm">
              No findings match your current filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFindings.map((finding) => (
              <div
                key={finding.id}
                className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge badge-sm ${getSeverityBadgeClass(
                        finding.severity,
                      )}`}
                    >
                      {finding.severity.toUpperCase()}
                    </span>
                    <span className="badge badge-sm badge-outline font-mono">
                      {finding.ruleId} v{finding.ruleVersion}
                    </span>
                    <span className="badge badge-sm badge-ghost text-xs">
                      {finding.classification}
                    </span>
                    <span className="badge badge-sm badge-ghost text-xs">
                      Confidence: {finding.confidence}
                    </span>
                  </div>
                  <div className="text-xs text-base-content/60 font-semibold">
                    Org: {resolveOrgName(bundle, finding.organizationId)}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-base text-base-content">
                    {finding.title}
                  </h4>
                  <p className="text-sm text-base-content/80 mt-1">
                    {finding.description}
                  </p>
                </div>

                {finding.entityIds.length > 0 && (
                  <div className="text-xs bg-base-200/50 p-2.5 rounded-md font-mono text-base-content/70">
                    <span className="font-sans font-semibold text-base-content/90 block mb-1">
                      Target Entities ({finding.entityIds.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {finding.entityIds.map((id) => (
                        <span key={id} className="badge badge-xs badge-neutral">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {finding.limitations.length > 0 && (
                  <div className="text-xs text-warning/90 italic">
                    <strong>Caveats & Limitations:</strong>{' '}
                    {finding.limitations.join(' ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
