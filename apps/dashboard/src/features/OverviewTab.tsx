import React from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { DashboardView } from '../navigation.js';
import type { EvaluatedInsights } from '@ghec/analysis';
import { Button, Label } from '@primer/react';
import { ArrowRightIcon, DownloadIcon } from '@primer/octicons-react';
import {
  formatBytes,
  formatTimestamp,
  formatDuration,
} from '../lib/formatters.js';
import { generateExecutiveSummaryCsv, downloadCsv } from '../lib/export-csv.js';
import { downloadPdfReport } from '../lib/export-pdf.js';
import { EnterpriseMatrix } from './EnterpriseMatrix.js';
import {
  MetricCard,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '../components/ui/index.js';

interface OverviewTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgIds: readonly string[];
  onSelectOrganization: (organizationId: string) => void;
  onNavigateTab: (tabId: DashboardView) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  bundle,
  insights,
  selectedOrgIds,
  onSelectOrganization,
  onNavigateTab,
}) => {
  const selectedOrgId =
    selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined;
  const inScope = (organizationId: string) =>
    selectedOrgIds.length === 0 || selectedOrgIds.includes(organizationId);
  const organizationCount =
    selectedOrgIds.length || bundle.organizations.length;
  // Calculate total observed repo storage
  const repos = bundle.entities.filter(
    (e) => e.kind === 'repository' && inScope(e.organizationId),
  );
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
  const scopedFindings = insights.findings.filter((f) =>
    inScope(f.organizationId),
  );
  const scopedCollectors = bundle.collectors.filter((collector) =>
    inScope(collector.organizationId),
  );
  const highFindings = scopedFindings.filter((f) => f.severity === 'high');
  const completeCollectors = scopedCollectors.filter(
    (collector) => collector.status === 'complete',
  ).length;
  const collectionPercent = scopedCollectors.length
    ? Math.round((completeCollectors / scopedCollectors.length) * 100)
    : 0;
  const reviewDimensions = insights.dimensions.filter(
    (dimension) => dimension.status === 'review_required',
  ).length;
  const recommendedView: DashboardView =
    highFindings.length > 0
      ? 'readiness'
      : collectionPercent < 100
        ? 'health'
        : 'export';
  const recommendedAction =
    highFindings.length > 0
      ? 'Review critical migration blockers'
      : collectionPercent < 100
        ? 'Resolve collection coverage gaps'
        : 'Generate the customer deliverable';
  const dimensionView = (ruleId: string): DashboardView => {
    if (/LFS|SIZE/.test(ruleId)) return 'repositories';
    if (/ACTIONS|CONFIG/.test(ruleId)) return 'actions';
    if (/POLICY|SECURITY|INTEGRATION/.test(ruleId)) return 'security';
    if (/IDENTIT/.test(ruleId)) return 'teams';
    return 'readiness';
  };

  const handleExportSummary = () => {
    const csv = generateExecutiveSummaryCsv(bundle, insights);
    downloadCsv(`executive-assessment-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Assessment Overview"
        status={
          <StatusBadge
            tone={bundle.scan.status === 'complete' ? 'success' : 'warning'}
          >
            Scan: {bundle.scan.status}
          </StatusBadge>
        }
        description={
          <>
            Target Scope:{' '}
            <strong className="text-[var(--fgColor-default)]">
              {bundle.scope.kind === 'enterprise'
                ? `Enterprise '${bundle.scope.slug}'`
                : `Organization '${bundle.scope.organizationId}'`}
            </strong>{' '}
            · Scan ID: <code>{bundle.scan.id}</code> · Executed in{' '}
            {formatDuration(bundle.scan.startedAt, bundle.scan.completedAt)}
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadPdfReport(
                'executive',
                bundle,
                insights,
                selectedOrgId || undefined,
              )
            }
          >
            Download Executive PDF
          </Button>
        }
        secondaryActions={
          <>
            <Button
              variant="default"
              size="small"
              leadingVisual={DownloadIcon}
              onClick={() =>
                downloadPdfReport(
                  'technical',
                  bundle,
                  insights,
                  selectedOrgId || undefined,
                )
              }
            >
              Download Technical PDF
            </Button>
            <Button
              variant="invisible"
              size="small"
              onClick={handleExportSummary}
            >
              Export Summary (CSV)
            </Button>
          </>
        }
      />

      <section
        aria-labelledby="decision-summary-title"
        className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr]"
      >
        <h3 id="decision-summary-title" className="sr-only">
          Migration decision summary
        </h3>
        <MetricCard
          label="Migration readiness"
          value={
            reviewDimensions === 0 ? 'Ready' : `${reviewDimensions} to review`
          }
          detail={`${insights.dimensions.length} assessed dimensions`}
          tone={reviewDimensions === 0 ? 'success' : 'warning'}
        />
        <MetricCard
          label="Critical blockers"
          value={highFindings.length}
          detail={
            highFindings.length
              ? 'High-severity findings need decisions'
              : 'No high-severity findings observed'
          }
          tone={highFindings.length ? 'error' : 'success'}
        />
        <MetricCard
          label="Collection complete"
          value={`${collectionPercent}%`}
          detail={`${completeCollectors} of ${scopedCollectors.length} collectors complete`}
          tone={collectionPercent === 100 ? 'success' : 'warning'}
        />
        <SurfaceCard className="border-[var(--borderColor-accent-emphasis)]/30 bg-[var(--bgColor-accent-muted)]/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fgColor-accent)]">
            Recommended next action
          </p>
          <p className="mt-2 text-lg font-bold">{recommendedAction}</p>
          <p className="mt-1 text-xs text-[var(--fgColor-muted)]">
            Based on the highest-priority evidence currently in scope.
          </p>
          <Button
            variant="primary"
            size="small"
            className="mt-4"
            trailingVisual={ArrowRightIcon}
            onClick={() => onNavigateTab(recommendedView)}
          >
            Continue
          </Button>
        </SurfaceCard>
      </section>

      {/* Scope Warnings / Limitations */}
      {insights.scopeLimitations.length > 0 && (
        <details className="rounded-lg border border-[var(--borderColor-attention-muted)] bg-[var(--bgColor-attention-muted)]/20 p-4">
          <summary className="cursor-pointer font-bold text-sm text-[var(--fgColor-attention)] select-none">
            <span aria-hidden="true">! </span>Scope limitations and caveats (
            {insights.scopeLimitations.length})
          </summary>
          <div className="mt-2">
            <ul className="list-disc list-inside text-xs space-y-0.5 text-[var(--fgColor-default)]">
              {insights.scopeLimitations.map((limitation, idx) => (
                <li key={idx}>{limitation}</li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {/* KPI Metric Cards */}
      <section aria-labelledby="inventory-summary-title">
        <h3
          id="inventory-summary-title"
          className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--fgColor-muted)]"
        >
          Supporting inventory
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SurfaceCard className="p-5">
            <div className="text-xs font-semibold text-[var(--fgColor-muted)] uppercase">
              Organizations
            </div>
            <div className="text-2xl font-black text-[var(--fgColor-default)] mt-1">
              {organizationCount}
            </div>
            <div className="text-[11px] text-[var(--fgColor-muted)] mt-1">
              {bundle.scope.kind === 'enterprise'
                ? `Enumeration: ${bundle.scope.enumeration}`
                : 'Direct organization scan'}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <div className="text-xs font-semibold text-[var(--fgColor-muted)] uppercase">
              Repositories
            </div>
            <div className="text-2xl font-black text-[var(--fgColor-default)] mt-1">
              {repos.length}
            </div>
            <div className="text-[11px] text-[var(--fgColor-muted)] mt-1">
              Across {organizationCount} org(s)
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <div className="text-xs font-semibold text-[var(--fgColor-muted)] uppercase">
              Observed Storage
            </div>
            <div className="text-2xl font-black text-[var(--fgColor-default)] mt-1">
              {formatBytes(observedRepoBytes)}
            </div>
            <div className="text-[11px] text-[var(--fgColor-muted)] mt-1">
              {hasUnknownRepoSize
                ? 'Excludes unmeasurable repos'
                : 'All repos measured'}
            </div>
          </SurfaceCard>
        </div>
      </section>

      {/* Priority Action Items & Friction Points */}
      {bundle.scope.kind === 'enterprise' && (
        <EnterpriseMatrix
          bundle={bundle}
          insights={insights}
          selectedOrgIds={selectedOrgIds}
          onSelectOrganization={onSelectOrganization}
        />
      )}

      {/* Priority Action Items & Friction Points */}
      <div className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--fgColor-default)]">
              Priority Migration Friction & Readiness Highlights
            </h3>
            <p className="text-xs text-[var(--fgColor-muted)]">
              Deterministic insights generated from CLI evidence requiring
              customer consultation
            </p>
          </div>
          <Button
            variant="invisible"
            size="small"
            trailingVisual={ArrowRightIcon}
            onClick={() => onNavigateTab('readiness')}
          >
            View All Dimensions
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.dimensions.map((dim) => (
            <button
              type="button"
              onClick={() => onNavigateTab(dimensionView(dim.ruleId))}
              key={dim.id}
              className={`p-4 rounded-lg border text-left transition-colors hover:border-[var(--borderColor-accent-emphasis)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-outlineColor)] ${
                dim.status === 'review_required'
                  ? 'border-[var(--borderColor-attention-muted)] bg-[var(--bgColor-attention-muted)]/20'
                  : dim.status === 'unknown'
                    ? 'border-[var(--borderColor-default)] bg-[var(--bgColor-muted)]/40'
                    : 'border-[var(--borderColor-success-muted)] bg-[var(--bgColor-success-muted)]/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
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
              <p className="text-xs text-[var(--fgColor-muted)]">
                {dim.summary}
              </p>
              {dim.findings.filter((finding) => inScope(finding.organizationId))
                .length > 0 && (
                <div className="mt-2 text-[11px] text-[var(--fgColor-muted)] font-medium">
                  {
                    dim.findings.filter((finding) =>
                      inScope(finding.organizationId),
                    ).length
                  }{' '}
                  finding(s) recorded ({dim.ruleId})
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Scan Provenance & CLI Configuration */}
      <details className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-4 shadow-xs">
        <summary className="cursor-pointer font-bold text-sm text-[var(--fgColor-default)] select-none">
          Evidence provenance and collection configuration
        </summary>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)]/30 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--fgColor-default)] mb-3 uppercase tracking-wider">
              Evidence Collection Configuration
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[var(--borderColor-muted)]">
                <span className="text-[var(--fgColor-muted)]">
                  CLI Producer:
                </span>
                <span className="font-mono text-[var(--fgColor-default)]">
                  {bundle.scan.producer} v{bundle.scan.producerVersion}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--borderColor-muted)]">
                <span className="text-[var(--fgColor-muted)]">
                  Schema Version:
                </span>
                <span className="font-mono text-[var(--fgColor-default)]">
                  {bundle.schemaVersion}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--borderColor-muted)]">
                <span className="text-[var(--fgColor-muted)]">
                  Redaction Profile:
                </span>
                <Label variant="default" size="small">
                  {bundle.configuration.redactionProfile}
                </Label>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--borderColor-muted)]">
                <span className="text-[var(--fgColor-muted)]">
                  Continue on Error:
                </span>
                <span className="text-[var(--fgColor-default)]">
                  {bundle.configuration.continueOnError ? 'True' : 'False'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--fgColor-muted)]">
                  Sensitive Metadata:
                </span>
                <span className="text-[var(--fgColor-default)]">
                  {bundle.configuration.includeSensitiveMetadata
                    ? 'Included'
                    : 'Excluded (Safe)'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)]/30 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--fgColor-default)] mb-3 uppercase tracking-wider">
              Active Discovery Modules ({bundle.configuration.modules.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {bundle.configuration.modules.map((m) => (
                <Label key={m} variant="secondary" size="small">
                  {m}
                </Label>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--borderColor-muted)] text-xs text-[var(--fgColor-muted)]">
              Scan started at{' '}
              <strong className="text-[var(--fgColor-default)]">
                {formatTimestamp(bundle.scan.startedAt)}
              </strong>{' '}
              and completed at{' '}
              <strong className="text-[var(--fgColor-default)]">
                {formatTimestamp(bundle.scan.completedAt)}
              </strong>
              .
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};
