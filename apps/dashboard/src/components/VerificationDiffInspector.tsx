import React, { useMemo, useState } from 'react';
import { Button, TextInput } from '@primer/react';
import {
  CheckCircleIcon,
  DownloadIcon,
  FileCodeIcon,
  SearchIcon,
  ShieldCheckIcon,
  UploadIcon,
  XCircleIcon,
  XIcon,
} from '@primer/octicons-react';
import type { VerificationReport } from '@ghec/contracts';
import {
  classifyReportDiscrepancies,
  computeVerificationStats,
  generateRemediationScopeJson,
  generateVerificationCsv,
  sampleCleanVerificationReport,
  sampleDiscrepantVerificationReport,
} from '../lib/verification-diff.js';
import { DiscrepancyCard } from './DiscrepancyCard.js';

export interface VerificationDiffInspectorProps {
  initialReport?: VerificationReport | undefined;
  onNavigateToModule?: ((moduleId: string) => void) | undefined;
}

export const VerificationDiffInspector: React.FC<
  VerificationDiffInspectorProps
> = ({ initialReport }) => {
  const [report, setReport] = useState<VerificationReport>(
    initialReport ?? sampleDiscrepantVerificationReport,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const classified = useMemo(
    () => classifyReportDiscrepancies(report),
    [report],
  );

  const stats = useMemo(
    () => computeVerificationStats(report, classified),
    [report, classified],
  );

  // Available modules for filter dropdown
  const availableModules = useMemo(() => {
    const set = new Set<string>();
    for (const c of classified) {
      set.add(c.moduleId);
    }
    return Array.from(set).sort();
  }, [classified]);

  // Filtered discrepancies
  const filteredDiscrepancies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return classified.filter((d) => {
      if (selectedModule !== 'all' && d.moduleId !== selectedModule) {
        return false;
      }
      if (selectedSeverity !== 'all' && d.severity !== selectedSeverity) {
        return false;
      }
      if (q) {
        const hay =
          `${d.resourceName} ${d.message} ${d.moduleId} ${d.remediationCommand} ${d.remediationRationale}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classified, searchQuery, selectedModule, selectedSeverity]);

  // CSV Export handler
  const handleExportCsv = () => {
    const csvContent = generateVerificationCsv(report, classified);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-compliance-${report.reportId || 'report'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Remediation Scope JSON Export handler
  const handleExportScope = () => {
    const scopeObj = generateRemediationScopeJson(report, classified);
    const blob = new Blob([JSON.stringify(scopeObj, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remediation-scope-${report.scopeName || 'remediation'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Custom Report File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.schemaVersion && Array.isArray(parsed.modules)) {
          setReport(parsed as VerificationReport);
        } else {
          alert('Invalid VerificationReport JSON structure.');
        }
      } catch {
        alert('Failed to parse verification report JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Overall Verification Compliance Header */}
      <div className="p-5 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {stats.discrepancyCount === 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--canvas-default)] border border-[var(--borderColor-success-emphasis)] text-[var(--fgColor-success)] font-bold text-sm">
                <CheckCircleIcon size={18} />
                <span>Verified (0 Discrepancies)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--canvas-default)] border border-[var(--borderColor-danger-emphasis)] text-[var(--fgColor-danger)] font-bold text-sm">
                <XCircleIcon size={18} />
                <span>Discrepancies Detected ({stats.discrepancyCount})</span>
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-[var(--fgColor-default)]">
                Post-Migration Verification Compliance
              </h2>
              <p className="text-xs text-[var(--fgColor-muted)]">
                Scope: <span className="font-mono">{report.scopeName}</span> |
                Target: <span className="font-mono">{report.targetOrg}</span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="small"
              leadingVisual={DownloadIcon}
              onClick={handleExportCsv}
              aria-label="Export CSV Compliance Report"
            >
              Export CSV Report
            </Button>
            <Button
              size="small"
              leadingVisual={FileCodeIcon}
              onClick={handleExportScope}
              disabled={classified.length === 0}
              aria-label="Download Remediation Scope JSON"
            >
              Remediation Scope JSON
            </Button>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md border border-[var(--borderColor-default)] bg-[var(--canvas-default)] hover:bg-[var(--canvas-subtle)] text-[var(--fgColor-default)]">
              <UploadIcon size={14} />
              <span>Upload Report</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            <Button
              size="small"
              onClick={() =>
                setReport(
                  report === sampleCleanVerificationReport
                    ? sampleDiscrepantVerificationReport
                    : sampleCleanVerificationReport,
                )
              }
            >
              {report === sampleCleanVerificationReport
                ? 'Simulate Drift'
                : 'Simulate Clean'}
            </Button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--borderColor-muted)]">
          <div className="p-3 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <div className="text-xs text-[var(--fgColor-muted)] font-medium">
              Verified Modules
            </div>
            <div className="text-xl font-bold text-[var(--fgColor-default)] mt-1">
              {stats.verifiedModuleCount} / {stats.totalModules}
            </div>
            <div className="text-xs text-[var(--fgColor-muted)] mt-0.5">
              {stats.compliancePercentage}% Compliance
            </div>
          </div>

          <div className="p-3 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <div className="text-xs text-[var(--fgColor-muted)] font-medium">
              Total Discrepancies
            </div>
            <div className="text-xl font-bold text-[var(--fgColor-danger)] mt-1">
              {stats.discrepancyCount}
            </div>
            <div className="text-xs text-[var(--fgColor-muted)] mt-0.5">
              Across {stats.unverifiedModuleCount} unverified modules
            </div>
          </div>

          <div className="p-3 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <div className="text-xs text-[var(--fgColor-muted)] font-medium">
              Critical Severity
            </div>
            <div className="text-xl font-bold text-[var(--fgColor-danger)] mt-1">
              {stats.criticalCount}
            </div>
            <div className="text-xs text-[var(--fgColor-muted)] mt-0.5">
              Security / Ruleset blockers
            </div>
          </div>

          <div className="p-3 rounded bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <div className="text-xs text-[var(--fgColor-muted)] font-medium">
              High / Medium Severity
            </div>
            <div className="text-xl font-bold text-[var(--fgColor-attention)] mt-1">
              {stats.highCount + stats.mediumCount}
            </div>
            <div className="text-xs text-[var(--fgColor-muted)] mt-0.5">
              Releases, LFS, Collaborators
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[260px] max-w-md">
          <TextInput
            leadingVisual={SearchIcon}
            placeholder="Search by resource, message, or command..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search discrepancies"
            {...(searchQuery
              ? {
                  trailingAction: (
                    <TextInput.Action
                      icon={XIcon}
                      aria-label="Clear search"
                      onClick={() => setSearchQuery('')}
                    />
                  ),
                }
              : {})}
            block
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Module Selector */}
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="px-2.5 py-1 text-xs rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)] text-[var(--fgColor-default)] focus:outline-none"
            aria-label="Filter by module"
          >
            <option value="all">All Modules ({stats.totalModules})</option>
            {availableModules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Severity Selector */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-2.5 py-1 text-xs rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)] text-[var(--fgColor-default)] focus:outline-none"
            aria-label="Filter by severity"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical ({stats.criticalCount})</option>
            <option value="high">High ({stats.highCount})</option>
            <option value="medium">Medium ({stats.mediumCount})</option>
            <option value="low">Low ({stats.lowCount})</option>
          </select>

          {(selectedModule !== 'all' ||
            selectedSeverity !== 'all' ||
            searchQuery.length > 0) && (
            <Button
              size="small"
              onClick={() => {
                setSelectedModule('all');
                setSelectedSeverity('all');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Discrepancies or Clean Banner */}
      {stats.discrepancyCount === 0 ? (
        <div className="p-8 rounded-lg border border-[var(--borderColor-success-emphasis)] bg-[var(--canvas-subtle)] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--canvas-default)] border border-[var(--borderColor-success-emphasis)] text-[var(--fgColor-success)] flex items-center justify-center mx-auto">
            <ShieldCheckIcon size={28} />
          </div>
          <h3 className="text-lg font-bold text-[var(--fgColor-default)]">
            Full Target Compliance Verified
          </h3>
          <p className="text-sm text-[var(--fgColor-muted)] max-w-xl mx-auto">
            All {stats.totalModules} modules evaluated against target
            organization{' '}
            <span className="font-mono text-[var(--fgColor-default)]">
              {report.targetOrg}
            </span>{' '}
            match the planned migration state with zero discrepancies.
          </p>
        </div>
      ) : filteredDiscrepancies.length === 0 ? (
        <div className="p-8 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] text-center space-y-2">
          <div className="text-sm font-semibold text-[var(--fgColor-default)]">
            No discrepancies match the active filters
          </div>
          <p className="text-xs text-[var(--fgColor-muted)]">
            Try adjusting your search query, module selection, or severity
            level.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-[var(--fgColor-muted)] font-medium">
            Showing {filteredDiscrepancies.length} of {stats.discrepancyCount}{' '}
            discrepancies
          </div>
          {filteredDiscrepancies.map((disc) => (
            <DiscrepancyCard key={disc.id} discrepancy={disc} />
          ))}
        </div>
      )}
    </div>
  );
};
