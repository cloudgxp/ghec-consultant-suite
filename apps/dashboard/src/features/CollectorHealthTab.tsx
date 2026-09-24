import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  formatDuration,
  getCollectorStatusBadgeClass,
  resolveOrgName,
} from '../lib/formatters.js';
import { generateCollectorHealthCsv, downloadCsv } from '../lib/export-csv.js';

interface CollectorHealthTabProps {
  bundle: DiscoveryBundle;
  selectedOrgId: string;
}

export const CollectorHealthTab: React.FC<CollectorHealthTabProps> = ({
  bundle,
  selectedOrgId,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const collectors = bundle.collectors.filter(
    (c) => !selectedOrgId || c.organizationId === selectedOrgId,
  );

  const filteredCollectors = collectors.filter((c) => {
    if (statusFilter === 'all') return true;
    return c.status === statusFilter;
  });

  const handleExportCsv = () => {
    const csv = generateCollectorHealthCsv(bundle, selectedOrgId || undefined);
    downloadCsv(`collector-health-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-base-content">
            Collector Health & Evidence Audit
          </h2>
          <p className="text-sm text-base-content/70 mt-1">
            Terminal status, coverage verification, warnings, and error
            diagnostics for all {bundle.collectors.length} collector executions.
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
          Export Collector Audit (CSV)
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between bg-base-100 p-4 rounded-xl border border-base-300 shadow-xs">
        <div className="tabs tabs-boxed">
          {['all', 'failed', 'partial', 'complete'].map((status) => (
            <button
              key={status}
              type="button"
              className={`tab capitalize ${statusFilter === status ? 'tab-active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status} (
              {
                collectors.filter(
                  (c) => status === 'all' || c.status === status,
                ).length
              }
              )
            </button>
          ))}
        </div>
      </div>

      {/* Collectors Table */}
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
        <table
          className="table table-sm table-zebra w-full"
          aria-label="Collector executions table"
        >
          <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
            <tr>
              <th scope="col">Module</th>
              <th scope="col">Organization</th>
              <th scope="col">Terminal Status</th>
              <th scope="col">Coverage State</th>
              <th scope="col">Observed / Expected</th>
              <th scope="col">Duration</th>
              <th scope="col">Diagnostics & Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredCollectors.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-base-content/60"
                >
                  No collectors match current filters.
                </td>
              </tr>
            ) : (
              filteredCollectors.map((c) => (
                <tr key={c.id} className="hover:bg-base-200/50">
                  <td className="font-mono text-xs font-bold text-base-content">
                    {c.module}
                  </td>
                  <td className="text-xs text-base-content/70">
                    {resolveOrgName(bundle, c.organizationId)}
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm font-semibold capitalize ${getCollectorStatusBadgeClass(
                        c.status,
                      )}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-sm badge-ghost font-mono text-xs capitalize">
                      {c.coverage.state}
                    </span>
                  </td>
                  <td className="text-xs font-mono">
                    {c.coverage.observed} / {c.coverage.expected ?? '—'}
                  </td>
                  <td className="text-xs font-mono text-base-content/70">
                    {formatDuration(c.startedAt, c.completedAt)}
                  </td>
                  <td>
                    <div className="space-y-1 max-w-sm">
                      {c.coverage.reason && (
                        <div className="text-xs text-warning">
                          Coverage note: {c.coverage.reason}
                        </div>
                      )}
                      {c.errors.map((err, idx) => (
                        <div
                          key={idx}
                          className="badge badge-error badge-xs block whitespace-normal py-1"
                        >
                          [{err.code}] {err.message}
                        </div>
                      ))}
                      {c.warnings.map((warn, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-warning/90 italic"
                        >
                          Warning: {warn}
                        </div>
                      ))}
                      {c.errors.length === 0 &&
                        c.warnings.length === 0 &&
                        !c.coverage.reason && (
                          <span className="text-xs text-success font-medium">
                            Clean
                          </span>
                        )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
