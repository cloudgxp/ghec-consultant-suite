import { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Dialog, Label } from '@primer/react';
import { MetricCard, PageHeader } from '../components/ui/index.js';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Project = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'project' }
>;
export function ProjectsTab({ bundle, selectedOrgIds }: Props) {
  const [selected, setSelected] = useState<Project | null>(null);
  const repoNames = useMemo(
    () =>
      new Map(
        bundle.entities
          .filter((e) => e.kind === 'repository')
          .map((e) => [e.id, e.name]),
      ),
    [bundle],
  );
  const rows = bundle.entities.filter(
    (e): e is Project =>
      e.kind === 'project' &&
      (!selectedOrgIds.length || selectedOrgIds.includes(e.organizationId)),
  );
  const columns: readonly VirtualizedColumn<Project>[] = [
    {
      header: 'Project',
      width: '1.5fr',
      cell: (e) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--fgColor-accent)] hover:underline cursor-pointer"
          onClick={() => setSelected(e)}
        >
          {e.title}
        </button>
      ),
    },
    {
      header: 'Status',
      cell: (e) => (
        <Label size="small" variant="secondary">
          {e.status}
        </Label>
      ),
    },
    { header: 'Owner scope', cell: (e) => e.ownerScope },
    { header: 'Repositories', cell: (e) => e.linkedRepositoryIds.length },
    { header: 'Items', cell: (e) => e.itemCount.value ?? 'Unknown' },
    { header: 'Fields', cell: (e) => e.fieldCount.value ?? 'Unknown' },
    {
      header: 'Updated',
      cell: (e) =>
        e.updatedAt ? new Date(e.updatedAt).toLocaleDateString() : 'Unknown',
    },
    { header: 'Coverage', cell: (e) => e.coverage },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Projects v2 metadata and repository relationships. Item content and project bodies are never collected."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Projects" value={rows.length} />
        <MetricCard
          label="Open"
          value={rows.filter((e) => e.status === 'open').length}
        />
        <MetricCard
          label="Unlinked"
          value={rows.filter((e) => !e.linkedRepositoryIds.length).length}
          tone="warning"
        />
        <MetricCard
          label="Stale or unknown"
          value={
            rows.filter(
              (e) =>
                !e.updatedAt ||
                Date.parse(bundle.scan.completedAt) - Date.parse(e.updatedAt) >
                  365 * 86400000,
            ).length
          }
          tone="warning"
        />
      </div>
      <VirtualizedTable
        ariaLabel="Projects inventory"
        rows={rows}
        columns={columns}
        getRowKey={(e) => e.id}
        emptyMessage="No Project metadata was collected."
        minWidth={1000}
      />
      {selected && (
        <Dialog
          title={selected.title}
          subtitle="Linked repositories and relationships"
          position="right"
          width="large"
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4 p-4">
            <h4 className="font-semibold text-sm text-[var(--fgColor-default)]">
              Linked repositories
            </h4>
            <ul className="mt-2 space-y-2">
              {selected.linkedRepositoryIds.length ? (
                selected.linkedRepositoryIds.map((id) => (
                  <li
                    key={id}
                    className="rounded p-2 text-sm bg-[var(--bgColor-muted)] text-[var(--fgColor-default)] border border-[var(--borderColor-default)]"
                  >
                    {repoNames.get(id) ?? id}
                  </li>
                ))
              ) : (
                <li className="text-sm text-[var(--fgColor-attention)] font-medium">
                  No repository links observed.
                </li>
              )}
            </ul>
          </div>
        </Dialog>
      )}
    </div>
  );
}
