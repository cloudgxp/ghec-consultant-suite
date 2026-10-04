import { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, Label } from '@primer/react';
import { FilterIcon } from '@primer/octicons-react';
import { MetricCard, PageHeader } from '../components/ui/index.js';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Ownership = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'code-ownership' }
>;
export function CodeOwnershipTab({ bundle, selectedOrgIds }: Props) {
  const [gapOnly, setGapOnly] = useState(false);
  const repoNames = useMemo(
    () =>
      new Map(
        bundle.entities
          .filter((e) => e.kind === 'repository')
          .map((e) => [e.id, e.name]),
      ),
    [bundle],
  );
  const rows = bundle.entities
    .filter(
      (e): e is Ownership =>
        e.kind === 'code-ownership' &&
        (!selectedOrgIds.length || selectedOrgIds.includes(e.organizationId)),
    )
    .filter(
      (e) =>
        !gapOnly ||
        e.presence !== 'present' ||
        (e.unresolvedOwnerCount.value ?? 0) > 0,
    );
  const columns: readonly VirtualizedColumn<Ownership>[] = [
    {
      header: 'Repository',
      width: '1.4fr',
      cell: (e) => (
        <strong>{repoNames.get(e.repositoryId) ?? e.repositoryId}</strong>
      ),
    },
    {
      header: 'File posture',
      cell: (e) => (
        <div>
          <span className="capitalize">{e.presence}</span>
          <div className="text-xs">{e.location}</div>
        </div>
      ),
    },
    { header: 'Syntax', cell: (e) => e.syntaxStatus },
    {
      header: 'Rules / owners',
      cell: (e) =>
        `${e.ruleCount.value ?? 'Unknown'} / ${e.ownerCount.value ?? 'Unknown'}`,
    },
    {
      header: 'Resolvable owners',
      cell: (e) =>
        `Teams ${e.resolvableTeamCount.value ?? 'Unknown'} · Users ${e.resolvableUserCount.value ?? 'Unknown'}`,
    },
    {
      header: 'Unresolved',
      cell: (e) => e.unresolvedOwnerCount.value ?? 'Unknown',
    },
    {
      header: 'Review policy',
      cell: (e) =>
        e.reviewPolicyIntegrated === null
          ? 'Unknown'
          : e.reviewPolicyIntegrated
            ? 'Integrated'
            : 'Not integrated',
    },
    {
      header: 'Coverage',
      width: '1.3fr',
      cell: (e) => (
        <div>
          <Label size="small" variant="secondary">
            {e.coverage}
          </Label>
          <div className="mt-1 text-xs text-[var(--fgColor-muted)]">
            {e.coverageReason}
          </div>
        </div>
      ),
    },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Code Ownership"
        description="Approved CODEOWNERS aggregates only. Raw patterns and file contents are never stored in standard bundles."
        primaryAction={
          <Button
            size="small"
            variant={gapOnly ? 'primary' : 'default'}
            leadingVisual={FilterIcon}
            onClick={() => setGapOnly(!gapOnly)}
          >
            Ownership gaps only
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Repositories assessed" value={rows.length} />
        <MetricCard
          label="CODEOWNERS present"
          value={rows.filter((e) => e.presence === 'present').length}
        />
        <MetricCard
          label="Missing or unknown"
          value={rows.filter((e) => e.presence !== 'present').length}
          tone="warning"
        />
        <MetricCard
          label="Unresolved owners"
          value={
            rows.reduce((n, e) => n + (e.unresolvedOwnerCount.value ?? 0), 0) ||
            'Unknown'
          }
        />
      </div>
      <VirtualizedTable
        ariaLabel="Code ownership posture"
        rows={rows}
        columns={columns}
        getRowKey={(e) => e.id}
        emptyMessage="No code ownership records match the current scope."
        minWidth={1150}
      />
    </div>
  );
}
