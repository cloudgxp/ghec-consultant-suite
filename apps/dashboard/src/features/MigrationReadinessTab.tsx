import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import { Button, Label } from '@primer/react';
import { DownloadIcon } from '@primer/octicons-react';
import { resolveOrgName } from '../lib/formatters.js';
import {
  generateMigrationReadinessCsv,
  downloadCsv,
} from '../lib/export-csv.js';
import {
  ActiveFilters,
  EmptyState,
  FilterToolbar,
  PageHeader,
  SeverityBadge,
  SurfaceCard,
} from '../components/ui/index.js';

interface MigrationReadinessTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgIds: readonly string[];
}

export const MigrationReadinessTab: React.FC<MigrationReadinessTabProps> = ({
  bundle,
  insights,
  selectedOrgIds,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedDimension, setSelectedDimension] = useState<string>('all');

  const handleExportCsv = () => {
    const csv = generateMigrationReadinessCsv(
      bundle,
      insights,
      selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
    );
    downloadCsv(`migration-readiness-${bundle.scan.id}.csv`, csv);
  };

  // Filter findings
  const filteredFindings = insights.findings.filter((f) => {
    if (selectedOrgIds.length > 0 && !selectedOrgIds.includes(f.organizationId))
      return false;
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (selectedDimension !== 'all' && f.ruleId !== selectedDimension)
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Migration Readiness & Advisory Analysis"
        description={
          <>
            Evaluating {insights.dimensions.length} analytical dimensions
            against collected evidence.
            {selectedOrgIds.length > 0 && (
              <span className="font-semibold text-[var(--fgColor-accent)] ml-1">
                Scoped to {selectedOrgIds.length} organization(s)
              </span>
            )}
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={handleExportCsv}
          >
            Export Findings (CSV)
          </Button>
        }
      />

      {/* Dimension Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {insights.dimensions.map((dim) => {
          const isSelected = selectedDimension === dim.ruleId;
          const dimFindings = dim.findings.filter(
            (f) =>
              selectedOrgIds.length === 0 ||
              selectedOrgIds.includes(f.organizationId),
          );

          return (
            <div
              key={dim.id}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedDimension(isSelected ? 'all' : dim.ruleId);
                }
              }}
              onClick={() =>
                setSelectedDimension(isSelected ? 'all' : dim.ruleId)
              }
              className={`rounded-lg p-4 border cursor-pointer transition-all ${
                isSelected
                  ? 'border-[var(--borderColor-accent-emphasis)] ring-2 ring-[var(--focus-outlineColor)] bg-[var(--bgColor-accent-muted)]/20'
                  : 'border-[var(--borderColor-default)] bg-[var(--bgColor-default)] hover:border-[var(--borderColor-accent-emphasis)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="font-bold text-sm text-[var(--fgColor-default)]">
                  {dim.name}
                </span>
                <Label
                  variant={
                    dim.status === 'review_required'
                      ? 'attention'
                      : dim.status === 'unknown'
                        ? 'secondary'
                        : 'success'
                  }
                  size="small"
                >
                  {dim.statusLabel}
                </Label>
              </div>
              <div className="text-xs text-[var(--fgColor-muted)] mt-1 font-mono">
                {dim.ruleId} · module: {dim.requiredModule}
              </div>
              <p className="text-xs text-[var(--fgColor-muted)] mt-2 line-clamp-2">
                {dim.summary}
              </p>
              <div className="mt-3 pt-2 border-t border-[var(--borderColor-muted)] flex justify-between items-center text-xs">
                <span className="font-semibold text-[var(--fgColor-muted)]">
                  {dimFindings.length} advisory finding(s)
                </span>
                <span className="text-[var(--fgColor-accent)] text-[11px] font-medium">
                  {isSelected ? 'Clear Filter' : 'Filter →'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Controls Bar */}
      <FilterToolbar>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-[var(--fgColor-muted)]">
            Severity:
          </label>
          <div className="inline-flex rounded-md shadow-xs" role="group">
            {['all', 'high', 'medium', 'low', 'info'].map((sev, idx, arr) => (
              <Button
                key={sev}
                size="small"
                variant={severityFilter === sev ? 'primary' : 'default'}
                className={`capitalize ${idx === 0 ? 'rounded-r-none' : idx === arr.length - 1 ? 'rounded-l-none' : 'rounded-none'}`}
                onClick={() => setSeverityFilter(sev)}
              >
                {sev}
              </Button>
            ))}
          </div>
        </div>

        {selectedDimension !== 'all' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--fgColor-muted)]">
              Filtered by: <strong>{selectedDimension}</strong>
            </span>
            <Button
              variant="invisible"
              size="small"
              onClick={() => setSelectedDimension('all')}
            >
              Reset Dimension Filter
            </Button>
          </div>
        )}
      </FilterToolbar>
      <ActiveFilters
        filters={[
          ...(severityFilter !== 'all'
            ? [
                {
                  id: 'severity',
                  label: `Severity: ${severityFilter}`,
                  onRemove: () => setSeverityFilter('all'),
                },
              ]
            : []),
          ...(selectedDimension !== 'all'
            ? [
                {
                  id: 'dimension',
                  label: `Dimension: ${selectedDimension}`,
                  onRemove: () => setSelectedDimension('all'),
                },
              ]
            : []),
        ]}
        onClearAll={() => {
          setSeverityFilter('all');
          setSelectedDimension('all');
        }}
      />

      {/* Findings List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--fgColor-default)]">
            Documented Findings & Advisories ({filteredFindings.length})
          </h3>
        </div>

        {filteredFindings.length === 0 ? (
          <EmptyState
            title="No matching findings"
            message="No findings match your current filters."
          />
        ) : (
          <div className="space-y-3">
            {filteredFindings.map((finding) => (
              <SurfaceCard
                key={finding.id}
                id={`entity-${finding.id}`}
                tabIndex={-1}
                className="p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={finding.severity} />
                    <Label
                      variant="secondary"
                      size="small"
                      className="font-mono"
                    >
                      {finding.ruleId} v{finding.ruleVersion}
                    </Label>
                    <Label variant="secondary" size="small">
                      {finding.classification}
                    </Label>
                    <Label variant="secondary" size="small">
                      Confidence: {finding.confidence}
                    </Label>
                  </div>
                  <div className="text-xs text-[var(--fgColor-muted)] font-semibold">
                    Org: {resolveOrgName(bundle, finding.organizationId)}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-base text-[var(--fgColor-default)]">
                    {finding.title}
                  </h4>
                  <p className="text-sm text-[var(--fgColor-muted)] mt-1">
                    {finding.description}
                  </p>
                </div>

                {finding.entityIds.length > 0 && (
                  <div className="text-xs bg-[var(--bgColor-muted)]/50 p-2.5 rounded-md font-mono text-[var(--fgColor-muted)]">
                    <span className="font-sans font-semibold text-[var(--fgColor-default)] block mb-1">
                      Target Entities ({finding.entityIds.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {finding.entityIds.map((id) => (
                        <Label key={id} variant="default" size="small">
                          {id}
                        </Label>
                      ))}
                    </div>
                  </div>
                )}

                {finding.limitations.length > 0 && (
                  <div className="text-xs text-[var(--fgColor-attention)] italic">
                    <strong>Caveats & Limitations:</strong>{' '}
                    {finding.limitations.join(' ')}
                  </div>
                )}
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
