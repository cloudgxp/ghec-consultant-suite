import React, { useMemo, useState } from 'react';
import type { DiscoveryBundle, OrgModuleResultSummary } from '@ghec/contracts';
import type { DashboardView } from '../navigation.js';
import type { EvaluatedInsights } from '@ghec/analysis';
import { Button, Dialog, Flash, Label, TextInput } from '@primer/react';
import {
  ArrowRightIcon,
  ChecklistIcon,
  DownloadIcon,
  LinkExternalIcon,
  LockIcon,
  SearchIcon,
} from '@primer/octicons-react';
import {
  formatBytes,
  formatTimestamp,
  formatDuration,
} from '../lib/formatters.js';
import { generateExecutiveSummaryCsv, downloadCsv } from '../lib/export-csv.js';
import { downloadPdfReport } from '../lib/export-pdf.js';
import { EnterpriseMatrix } from './EnterpriseMatrix.js';
import {
  DataTableFrame,
  MetricCard,
  PageHeader,
  StatusBadge,
  SurfaceCard,
} from '../components/ui/index.js';
import type {
  HydratedOperationRow,
  ResultsHydrationData,
} from '../lib/importer.js';

interface OverviewTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgIds: readonly string[];
  onSelectOrganization: (organizationId: string) => void;
  onNavigateTab: (tabId: DashboardView) => void;
  resultsHydration?: ResultsHydrationData | undefined;
}

interface OrgModuleRow extends OrgModuleResultSummary {
  readonly moduleId: string;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  bundle,
  insights,
  selectedOrgIds,
  onSelectOrganization,
  onNavigateTab,
  resultsHydration,
}) => {
  const [selectedOrgModule, setSelectedOrgModule] =
    useState<OrgModuleRow | null>(null);
  const [drawerQuery, setDrawerQuery] = useState('');

  const selectedOrgId =
    selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined;
  const inScope = (organizationId: string) =>
    selectedOrgIds.length === 0 || selectedOrgIds.includes(organizationId);
  const organizationCount =
    selectedOrgIds.length || bundle.organizations.length;

  const orgModuleRows = useMemo<readonly OrgModuleRow[]>(() => {
    const map = resultsHydration?.manifest.summary.orgModulesSummary ?? {};
    return Object.entries(map).map(([moduleId, sum]) => ({
      moduleId,
      ...sum,
    }));
  }, [resultsHydration]);

  const isMigrationReport =
    resultsHydration !== undefined &&
    (resultsHydration.operationalMode === 'live' ||
      resultsHydration.operationalMode === 'dry-run' ||
      orgModuleRows.length > 0);

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
  const postCareCount = resultsHydration?.postCare.items.length ?? 0;
  const recommendedView: DashboardView =
    isMigrationReport && postCareCount > 0
      ? 'post-care'
      : highFindings.length > 0
        ? 'readiness'
        : collectionPercent < 100
          ? 'health'
          : 'export';
  const recommendedAction =
    isMigrationReport && postCareCount > 0
      ? `Complete ${postCareCount} post-care cutover items`
      : highFindings.length > 0
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

  const orgModuleOperations = useMemo<readonly HydratedOperationRow[]>(() => {
    if (!selectedOrgModule || !resultsHydration) return [];
    const needle = drawerQuery.trim().toLowerCase();
    return resultsHydration.postCare.operationRows.filter((op) => {
      if (op.moduleId !== selectedOrgModule.moduleId) return false;
      if (op.scopeLevel !== 'organization') return false;
      if (needle) {
        const hay =
          `${op.resourceName} ${op.operationType} ${op.status} ${op.notes} ${op.subDomain}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [selectedOrgModule, resultsHydration, drawerQuery]);

  const migrationSummary = resultsHydration?.manifest.summary;
  const opTotals = resultsHydration?.operationTotals;
  const verSum = resultsHydration?.verificationSummary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          resultsHydration?.operationalMode === 'live'
            ? 'Live Migration Executive Summary'
            : resultsHydration?.operationalMode === 'dry-run'
              ? 'Dry-Run Migration Plan Summary'
              : 'Executive Assessment Overview'
        }
        status={
          <StatusBadge
            tone={bundle.scan.status === 'complete' ? 'success' : 'warning'}
          >
            {resultsHydration?.operationalMode === 'live'
              ? 'Live Execution'
              : resultsHydration?.operationalMode === 'dry-run'
                ? 'Dry-Run Simulation'
                : `Scan: ${bundle.scan.status}`}
          </StatusBadge>
        }
        description={
          <>
            {resultsHydration ? (
              <>
                Migration Scope:{' '}
                <strong className="text-[var(--fgColor-default)]">
                  {resultsHydration.manifest.sourceOrg} ➔{' '}
                  {resultsHydration.manifest.targetOrg}
                </strong>{' '}
                · Run ID: <code>{resultsHydration.manifest.runId}</code> ·
                Executed in{' '}
                {formatDuration(bundle.scan.startedAt, bundle.scan.completedAt)}
              </>
            ) : (
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
            )}
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
            {isMigrationReport && (
              <Button
                variant="default"
                size="small"
                leadingVisual={ChecklistIcon}
                onClick={() => onNavigateTab('post-care')}
              >
                Open Post-Care Checklist ({postCareCount})
              </Button>
            )}
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

      {/* Tier 1: Executive Migration & Post-Care Summary (when hydrated from Dry-Run or Live Migration) */}
      {isMigrationReport && resultsHydration && migrationSummary && (
        <section
          aria-labelledby="migration-execution-summary-title"
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="migration-execution-summary-title"
              className="text-sm font-bold uppercase tracking-wide text-[var(--fgColor-muted)] m-0"
            >
              Tier 1 · Executive Migration & Verification Telemetry
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {resultsHydration.transferStrategies.largeReleases && (
                <Label size="small" variant="secondary">
                  Large Releases:{' '}
                  {
                    resultsHydration.transferStrategies.largeReleases
                      .assetsStreamed
                  }{' '}
                  assets (
                  {formatBytes(
                    resultsHydration.transferStrategies.largeReleases
                      .bytesStreamed,
                  )}
                  )
                </Label>
              )}
              {resultsHydration.transferStrategies.lfs && (
                <Label size="small" variant="secondary">
                  Git LFS:{' '}
                  {resultsHydration.transferStrategies.lfs.objectsTransferred}{' '}
                  objects (
                  {formatBytes(
                    resultsHydration.transferStrategies.lfs.bytesTransferred,
                  )}
                  )
                </Label>
              )}
              {resultsHydration.transferStrategies.mirrorPushRepos &&
                resultsHydration.transferStrategies.mirrorPushRepos.length >
                  0 && (
                  <Label size="small" variant="secondary">
                    Mirror Push:{' '}
                    {resultsHydration.transferStrategies.mirrorPushRepos.length}{' '}
                    repos
                  </Label>
                )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Repositories Migrated"
              value={`${migrationSummary.succeededCount} / ${migrationSummary.totalRepositories}`}
              detail={`${migrationSummary.failedCount} failed · ${resultsHydration.postCare.skippedArchivedRows.length} archived skipped`}
              tone={migrationSummary.failedCount > 0 ? 'error' : 'success'}
            />
            <MetricCard
              label="Module Operations"
              value={`${opTotals?.mutated ?? opTotals?.succeeded ?? 0} mutated`}
              detail={`${opTotals?.noop ?? 0} no-op · ${opTotals?.skipped ?? 0} skipped · ${opTotals?.failed ?? 0} failed`}
              tone={(opTotals?.failed ?? 0) > 0 ? 'warning' : 'primary'}
            />
            <MetricCard
              label="Parity Verification"
              value={`${verSum?.verifiedModuleCount ?? 0} verified`}
              detail={`${verSum?.discrepancyCount ?? 0} discrepancies detected`}
              tone={(verSum?.discrepancyCount ?? 0) > 0 ? 'warning' : 'success'}
            />
            <MetricCard
              label="Post-Care Action Items"
              value={postCareCount}
              detail={`${resultsHydration.postCare.summary.secretCount} [SEALED] secrets · ${resultsHydration.postCare.summary.webhookCount} webhooks`}
              tone={postCareCount > 0 ? 'warning' : 'success'}
            />
          </div>

          {/* Tier 2: Organization-Level Modules Table */}
          {orgModuleRows.length > 0 && (
            <div className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[var(--fgColor-default)] m-0">
                    Tier 2 · Organization-Level Modules ({orgModuleRows.length})
                  </h3>
                  <p className="text-xs text-[var(--fgColor-muted)] m-0 mt-0.5">
                    Click any organization module to inspect granular
                    operations, sealed secret placeholders, and direct GitHub
                    Settings links.
                  </p>
                </div>
                <Button
                  size="small"
                  leadingVisual={ChecklistIcon}
                  onClick={() => onNavigateTab('post-care')}
                >
                  View Post-Care Checklist
                </Button>
              </div>

              <DataTableFrame caption="Organization-level migration modules">
                <table
                  className="w-full text-left border-collapse text-sm"
                  aria-label="Organization-level migration modules"
                >
                  <thead className="bg-[var(--bgColor-muted)] text-xs text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">
                        Organization Module
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Succeeded / Total
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Skipped
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Failed
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Discrepancies
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Duration
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Drill-Down
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgModuleRows.map((mod) => (
                      <tr
                        key={mod.moduleId}
                        className="border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)]/50 odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerQuery('');
                              setSelectedOrgModule(mod);
                            }}
                            className="text-left font-mono font-bold text-xs text-[var(--fgColor-accent)] hover:underline cursor-pointer"
                          >
                            {mod.moduleId}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <Label
                            size="small"
                            variant={
                              mod.status === 'complete'
                                ? 'success'
                                : mod.status === 'failed'
                                  ? 'danger'
                                  : 'attention'
                            }
                            className="capitalize"
                          >
                            {mod.status}
                          </Label>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--fgColor-default)]">
                          {mod.succeededOperations} / {mod.totalOperations}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--fgColor-muted)]">
                          {mod.skippedOperations}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--fgColor-default)]">
                          {mod.failedOperations > 0 ? (
                            <span className="font-bold text-[var(--fgColor-danger)]">
                              {mod.failedOperations}
                            </span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Label
                            size="small"
                            variant={
                              (mod.discrepancyCount ?? 0) === 0
                                ? 'success'
                                : 'attention'
                            }
                          >
                            {(mod.discrepancyCount ?? 0) === 0
                              ? 'Verified'
                              : `${mod.discrepancyCount} Discrepancies`}
                          </Label>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--fgColor-muted)]">
                          {mod.durationMs ?? 0}ms
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            size="small"
                            onClick={() => {
                              setDrawerQuery('');
                              setSelectedOrgModule(mod);
                            }}
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableFrame>
            </div>
          )}
        </section>
      )}

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

      {/* Organization Module Drill-Down Drawer (replaces organization/<module>.md) */}
      {selectedOrgModule && resultsHydration && (
        <Dialog
          title={`Organization Module: ${selectedOrgModule.moduleId}`}
          subtitle={`${resultsHydration.manifest.sourceOrg} ➔ ${resultsHydration.manifest.targetOrg}`}
          position="right"
          width="large"
          onClose={() => setSelectedOrgModule(null)}
        >
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label
                variant={
                  selectedOrgModule.status === 'complete'
                    ? 'success'
                    : selectedOrgModule.status === 'failed'
                      ? 'danger'
                      : 'attention'
                }
                className="capitalize"
              >
                Status: {selectedOrgModule.status}
              </Label>
              <Label
                variant={
                  (selectedOrgModule.discrepancyCount ?? 0) === 0
                    ? 'success'
                    : 'attention'
                }
              >
                {(selectedOrgModule.discrepancyCount ?? 0) === 0
                  ? 'Parity Verified'
                  : `${selectedOrgModule.discrepancyCount} Discrepancies`}
              </Label>
              <Label variant="secondary" className="font-mono">
                {selectedOrgModule.succeededOperations} succeeded ·{' '}
                {selectedOrgModule.skippedOperations} skipped ·{' '}
                {selectedOrgModule.failedOperations} failed
              </Label>
            </div>

            {selectedOrgModule.moduleId.includes('secret') && (
              <Flash variant="warning">
                <span className="text-xs">
                  <strong>Zero-Exposure Secret Boundary (DEC-004):</strong>{' '}
                  Organization secrets were initialized as empty{' '}
                  <code>[SEALED]</code> placeholders (<code>&quot;&quot;</code>
                  ). Populate real values using the GitHub Settings links below.
                </span>
              </Flash>
            )}

            <TextInput
              leadingVisual={SearchIcon}
              type="search"
              aria-label="Filter organization module operations"
              placeholder="Filter operations by resource, status, or notes…"
              size="small"
              block
              value={drawerQuery}
              onChange={(e) => setDrawerQuery(e.target.value)}
            />

            <DataTableFrame caption="Granular organization module operations">
              <table
                className="w-full text-left border-collapse text-xs"
                aria-label="Granular organization module operations"
              >
                <thead className="bg-[var(--bgColor-muted)] text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
                  <tr>
                    <th scope="col" className="px-2.5 py-2">
                      Resource Name
                    </th>
                    <th scope="col" className="px-2.5 py-2">
                      Operation & Status
                    </th>
                    <th scope="col" className="px-2.5 py-2">
                      Verification
                    </th>
                    <th scope="col" className="px-2.5 py-2">
                      Notes & Settings Link
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orgModuleOperations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-6 text-[var(--fgColor-muted)]"
                      >
                        No granular operations recorded for this module.
                      </td>
                    </tr>
                  ) : (
                    orgModuleOperations.map((op, idx) => (
                      <tr
                        key={`${op.resourceName}-${idx}`}
                        className="border-b border-[var(--borderColor-muted)] odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                      >
                        <td className="px-2.5 py-2 font-mono font-bold text-[var(--fgColor-default)]">
                          <div className="flex flex-wrap items-center gap-1">
                            <span>{op.resourceName}</span>
                            {op.isSecret && (
                              <Label size="small" variant="attention">
                                <LockIcon size={10} className="mr-1" />
                                [SEALED]
                              </Label>
                            )}
                          </div>
                          {op.subDomain && (
                            <div className="text-[10px] text-[var(--fgColor-muted)]">
                              {op.subDomain}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <Label
                              size="small"
                              variant={
                                op.status === 'succeeded' ||
                                op.status === 'mutated'
                                  ? 'success'
                                  : op.status === 'failed'
                                    ? 'danger'
                                    : 'secondary'
                              }
                            >
                              {op.status}
                            </Label>
                            <span className="font-mono text-[10px] text-[var(--fgColor-muted)]">
                              ({op.operationType})
                            </span>
                          </div>
                        </td>
                        <td className="px-2.5 py-2">
                          <Label
                            size="small"
                            variant={
                              op.verificationStatus === 'verified'
                                ? 'success'
                                : op.verificationStatus === 'discrepancy'
                                  ? 'attention'
                                  : 'secondary'
                            }
                          >
                            {op.verificationStatus}
                          </Label>
                        </td>
                        <td className="px-2.5 py-2 space-y-1">
                          <div className="text-[var(--fgColor-default)]">
                            {op.notes}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {op.settingsUrl && (
                              <a
                                href={op.settingsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-[var(--fgColor-accent)] hover:underline"
                              >
                                <span>
                                  {op.settingsLinkLabel ?? 'Open Settings'}
                                </span>
                                <LinkExternalIcon size={11} />
                              </a>
                            )}
                            {op.secondaryUrl && (
                              <a
                                href={op.secondaryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--fgColor-muted)] hover:underline"
                              >
                                <span>
                                  {op.secondaryLinkLabel ?? 'Secondary Link'}
                                </span>
                                <LinkExternalIcon size={11} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </DataTableFrame>
          </div>
        </Dialog>
      )}
    </div>
  );
};
