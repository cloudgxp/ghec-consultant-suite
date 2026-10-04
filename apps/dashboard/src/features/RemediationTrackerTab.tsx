import React, { useMemo, useState } from 'react';
import { Button, Label, TextInput } from '@primer/react';
import { DownloadIcon, SearchIcon } from '@primer/octicons-react';
import {
  ActiveFilters,
  FilterToolbar,
  MetricCard,
  PageHeader,
  SurfaceCard,
} from '../components/ui/index.js';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import { downloadCsv } from '../lib/export-csv.js';
import { downloadRemediationPdf } from '../lib/export-pdf.js';
import { formatBytes } from '../lib/formatters.js';
import {
  generateRemediationCsv,
  type FindingDelta,
  type FindingDeltaStatus,
  type ScanDiff,
} from '../lib/diff-engine.js';

interface Props {
  diff: ScanDiff;
}

const statusVariant: Record<
  FindingDeltaStatus,
  'success' | 'attention' | 'danger'
> = {
  resolved: 'success',
  persistent: 'attention',
  new: 'danger',
};

export const RemediationTrackerTab: React.FC<Props> = ({ diff }) => {
  const [status, setStatus] = useState<'all' | FindingDeltaStatus>('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return diff.findings.filter(
      (finding) =>
        (status === 'all' || finding.status === status) &&
        (!needle ||
          `${finding.title} ${finding.description} ${finding.ruleId} ${finding.entityIds.join(' ')}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [diff.findings, query, status]);
  const columns = useMemo<readonly VirtualizedColumn<FindingDelta>[]>(
    () => [
      {
        header: 'Status',
        width: '0.8fr',
        cell: (finding) => (
          <Label
            variant={statusVariant[finding.status]}
            size="small"
            className="capitalize"
          >
            {finding.status}
          </Label>
        ),
      },
      {
        header: 'Dimension',
        width: '1.2fr',
        className: 'text-xs font-semibold',
        cell: (finding) => finding.dimension,
      },
      {
        header: 'Rule ID',
        width: '0.9fr',
        className: 'font-mono text-xs',
        cell: (finding) => finding.ruleId,
      },
      {
        header: 'Affected Entity',
        width: '1.5fr',
        className: 'font-mono text-xs',
        cell: (finding) => finding.entityIds.join(', ') || 'Scope-wide',
      },
      {
        header: 'Resolution Details',
        width: '2fr',
        cell: (finding) => (
          <>
            <div className="font-semibold text-sm">{finding.title}</div>
            <div className="text-xs text-[var(--fgColor-muted)] mt-1">
              {finding.description}
            </div>
          </>
        ),
      },
    ],
    [],
  );
  const filename = `remediation-progress-${diff.baselineScanId}-vs-${diff.currentScanId}`;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Remediation Progress Tracker"
        description={
          <>
            Baseline <code>{diff.baselineScanId}</code> compared with{' '}
            <code>{diff.currentScanId}</code>.
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(`${filename}.csv`, generateRemediationCsv(diff))
            }
          >
            Export Remediation CSV
          </Button>
        }
        secondaryActions={
          <Button
            variant="default"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() => downloadRemediationPdf(diff)}
          >
            Export Remediation PDF
          </Button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Blockers Resolved"
          value={diff.resolved}
          detail={`${diff.reductionPercent.toFixed(1)}% blocker reduction`}
          tone="success"
        />
        <MetricCard
          label="Persistent Findings"
          value={diff.persistent}
          detail="Still require remediation"
          tone="warning"
        />
        <MetricCard
          label="New Issues"
          value={diff.new}
          detail="Introduced since baseline"
          tone="error"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-4 shadow-xs">
        <div>
          <div className="text-xs uppercase font-bold text-[var(--fgColor-muted)]">
            Storage Delta
          </div>
          <div
            className={`text-xl font-bold ${diff.metrics.storageDeltaBytes > 0 ? 'text-[var(--fgColor-danger)]' : 'text-[var(--fgColor-success)]'}`}
          >
            {diff.metrics.storageDeltaBytes > 0 ? '+' : ''}
            {formatBytes(Math.abs(diff.metrics.storageDeltaBytes))}
            {diff.metrics.storageDeltaBytes < 0 ? ' reduction' : ''}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase font-bold text-[var(--fgColor-muted)]">
            Critical Blocker Delta
          </div>
          <div className="text-xl font-bold text-[var(--fgColor-default)]">
            {diff.metrics.criticalBlockerDelta > 0 ? '+' : ''}
            {diff.metrics.criticalBlockerDelta}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase font-bold text-[var(--fgColor-muted)]">
            Protected Repository Delta
          </div>
          <div className="text-xl font-bold text-[var(--fgColor-default)]">
            {diff.metrics.protectedRepositoryDelta > 0 ? '+' : ''}
            {diff.metrics.protectedRepositoryDelta}
          </div>
        </div>
      </div>
      <FilterToolbar>
        <div className="inline-flex rounded-md shadow-xs" role="group">
          {(['all', 'resolved', 'persistent', 'new'] as const).map(
            (value, idx, arr) => (
              <Button
                key={value}
                size="small"
                variant={status === value ? 'primary' : 'default'}
                className={`capitalize ${idx === 0 ? 'rounded-r-none' : idx === arr.length - 1 ? 'rounded-l-none' : 'rounded-none'}`}
                onClick={() => setStatus(value)}
              >
                {value} (
                {value === 'all'
                  ? diff.findings.length
                  : diff.findings.filter((finding) => finding.status === value)
                      .length}
                )
              </Button>
            ),
          )}
        </div>
        <TextInput
          leadingVisual={SearchIcon}
          aria-label="Search remediation details"
          placeholder="Search remediation details…"
          size="small"
          className="w-full sm:w-80"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </FilterToolbar>
      <ActiveFilters
        filters={[
          ...(status !== 'all'
            ? [
                {
                  id: 'status',
                  label: `Status: ${status}`,
                  onRemove: () => setStatus('all'),
                },
              ]
            : []),
          ...(query
            ? [
                {
                  id: 'query',
                  label: `Search: ${query}`,
                  onRemove: () => setQuery(''),
                },
              ]
            : []),
        ]}
        onClearAll={() => {
          setStatus('all');
          setQuery('');
        }}
      />
      <VirtualizedTable
        ariaLabel="Remediation finding changes"
        rows={filtered}
        columns={columns}
        getRowKey={(finding) => finding.key}
        emptyMessage="No finding changes match the current filters."
        estimateRowHeight={76}
        minWidth={950}
      />
      <SurfaceCard className="p-6">
        <h3 className="text-lg font-bold mb-4 text-[var(--fgColor-default)]">
          Entity Delta Inventory
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {diff.entities.map((entity) => (
            <div
              key={entity.kind}
              className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-4 shadow-xs"
            >
              <h4 className="font-bold capitalize text-[var(--fgColor-default)]">
                {entity.kind}s
              </h4>
              <div className="mt-2 text-sm">
                <span className="text-[var(--fgColor-success)] font-semibold">
                  +{entity.added.length} added
                </span>{' '}
                ·{' '}
                <span className="text-[var(--fgColor-danger)] font-semibold">
                  -{entity.removed.length} removed
                </span>
              </div>
              {(entity.added.length > 0 || entity.removed.length > 0) && (
                <div className="mt-2 max-h-32 overflow-auto text-[11px] font-mono">
                  <ul>
                    {entity.added.map((id) => (
                      <li
                        key={`add:${id}`}
                        className="text-[var(--fgColor-success)]"
                      >
                        + {id}
                      </li>
                    ))}
                    {entity.removed.map((id) => (
                      <li
                        key={`remove:${id}`}
                        className="text-[var(--fgColor-danger)]"
                      >
                        - {id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
};
