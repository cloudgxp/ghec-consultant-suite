import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, Dialog, Label, UnderlineNav } from '@primer/react';
import { DownloadIcon, SearchIcon } from '@primer/octicons-react';
import { formatDuration, resolveOrgName } from '../lib/formatters.js';
import { generateCollectorHealthCsv, downloadCsv } from '../lib/export-csv.js';
import {
  ActiveFilters,
  DataTableFrame,
  FilterToolbar,
  PageHeader,
} from '../components/ui/index.js';
import { DiscoveryScanTrigger } from '../components/DiscoveryScanTrigger.js';
import type { ImportResult } from '../lib/importer.js';

interface CollectorHealthTabProps {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
  onLoadBundle?: ((result: ImportResult) => void) | undefined;
}

const statusVariant: Record<string, 'success' | 'attention' | 'danger'> = {
  complete: 'success',
  partial: 'attention',
  failed: 'danger',
};

export const CollectorHealthTab: React.FC<CollectorHealthTabProps> = ({
  bundle,
  selectedOrgIds,
  onLoadBundle,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  const collectors = bundle.collectors.filter(
    (c) =>
      selectedOrgIds.length === 0 || selectedOrgIds.includes(c.organizationId),
  );

  const filteredCollectors = collectors.filter((c) => {
    if (statusFilter === 'all') return true;
    return c.status === statusFilter;
  });

  const handleExportCsv = () => {
    const csv = generateCollectorHealthCsv(
      bundle,
      selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
    );
    downloadCsv(`collector-health-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collector Health & Evidence Audit"
        description={
          <>
            Terminal status, coverage verification, warnings, and error
            diagnostics for all {bundle.collectors.length} collector executions.
          </>
        }
        primaryAction={
          <div className="flex items-center gap-2">
            {onLoadBundle && (
              <Button
                size="small"
                leadingVisual={SearchIcon}
                onClick={() => setIsScanModalOpen(true)}
              >
                Run Discovery Scan
              </Button>
            )}
            <Button
              variant="primary"
              size="small"
              leadingVisual={DownloadIcon}
              onClick={handleExportCsv}
            >
              Export Collector Audit (CSV)
            </Button>
          </div>
        }
      />

      {/* Filter Tabs */}
      <FilterToolbar>
        <UnderlineNav aria-label="Collector status filters">
          {['all', 'failed', 'partial', 'complete'].map((status) => (
            <UnderlineNav.Item
              key={status}
              aria-current={statusFilter === status ? 'page' : 'false'}
              onSelect={(e) => {
                e.preventDefault();
                setStatusFilter(status);
              }}
              className="capitalize cursor-pointer"
            >
              {status} (
              {
                collectors.filter(
                  (c) => status === 'all' || c.status === status,
                ).length
              }
              )
            </UnderlineNav.Item>
          ))}
        </UnderlineNav>
      </FilterToolbar>
      <ActiveFilters
        filters={
          statusFilter !== 'all'
            ? [
                {
                  id: 'status',
                  label: `Status: ${statusFilter}`,
                  onRemove: () => setStatusFilter('all'),
                },
              ]
            : []
        }
      />

      {/* Collectors Table */}
      <DataTableFrame caption="Collector health and evidence audit">
        <table
          className="w-full text-left border-collapse text-sm"
          aria-label="Collector executions table"
        >
          <thead className="bg-[var(--bgColor-muted)] text-xs text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
            <tr>
              <th scope="col" className="px-3 py-2.5">
                Module
              </th>
              <th scope="col" className="px-3 py-2.5">
                Organization
              </th>
              <th scope="col" className="px-3 py-2.5">
                Terminal Status
              </th>
              <th scope="col" className="px-3 py-2.5">
                Coverage State
              </th>
              <th scope="col" className="px-3 py-2.5">
                Observed / Expected
              </th>
              <th scope="col" className="px-3 py-2.5">
                Duration
              </th>
              <th scope="col" className="px-3 py-2.5">
                Diagnostics & Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCollectors.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-[var(--fgColor-muted)]"
                >
                  No collectors match current filters.
                </td>
              </tr>
            ) : (
              filteredCollectors.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)]/50 odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                >
                  <td className="font-mono text-xs font-bold text-[var(--fgColor-default)] px-3 py-2.5">
                    {c.module}
                  </td>
                  <td className="text-xs text-[var(--fgColor-muted)] px-3 py-2.5">
                    {resolveOrgName(bundle, c.organizationId)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Label
                      variant={statusVariant[c.status] ?? 'default'}
                      size="small"
                      className="capitalize"
                    >
                      {c.status}
                    </Label>
                  </td>
                  <td className="px-3 py-2.5">
                    <Label
                      variant="secondary"
                      size="small"
                      className="font-mono capitalize"
                    >
                      {c.coverage.state}
                    </Label>
                  </td>
                  <td className="text-xs font-mono text-[var(--fgColor-default)] px-3 py-2.5">
                    {c.coverage.observed} / {c.coverage.expected ?? '—'}
                  </td>
                  <td className="text-xs font-mono text-[var(--fgColor-muted)] px-3 py-2.5">
                    {formatDuration(c.startedAt, c.completedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1 max-w-sm">
                      {c.coverage.reason && (
                        <div className="text-xs text-[var(--fgColor-attention)]">
                          Coverage note: {c.coverage.reason}
                        </div>
                      )}
                      {c.errors.map((err, idx) => (
                        <Label
                          key={idx}
                          variant="danger"
                          size="small"
                          className="block whitespace-normal py-1"
                        >
                          [{err.code}] {err.message}
                        </Label>
                      ))}
                      {c.warnings.map((warn, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-[var(--fgColor-attention)] italic"
                        >
                          Warning: {warn}
                        </div>
                      ))}
                      {c.errors.length === 0 &&
                        c.warnings.length === 0 &&
                        !c.coverage.reason && (
                          <span className="text-xs text-[var(--fgColor-success)] font-medium">
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
      </DataTableFrame>

      {isScanModalOpen && (
        <Dialog
          title="Run Automated Discovery Scan"
          onClose={() => setIsScanModalOpen(false)}
          className="w-full max-w-3xl"
        >
          <div className="p-4">
            <DiscoveryScanTrigger
              onLoadBundle={(res) => {
                setIsScanModalOpen(false);
                onLoadBundle?.(res);
              }}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
};
