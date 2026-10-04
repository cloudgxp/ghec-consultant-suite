import { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import {
  FilterToolbar,
  MetricCard,
  PageHeader,
} from '../components/ui/index.js';
import { Button, Label, Select, TextInput } from '@primer/react';
import { DownloadIcon, SearchIcon } from '@primer/octicons-react';
import { downloadCsv, generateReleaseAssetsCsv } from '../lib/export-csv.js';
import {
  releaseAssetInventory,
  type ReleaseAssetInventoryRecord,
} from '../lib/supply-chain.js';
import { resolveOrgName } from '../lib/formatters.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}

const bytes = (value: number | null) => {
  if (value === null) return 'Unknown';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export function ReleasesAndAssetsTab({ bundle, selectedOrgIds }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [size, setSize] = useState('all');
  const repositoryNames = useMemo(
    () =>
      new Map(
        bundle.entities
          .filter((entity) => entity.kind === 'repository')
          .map((repo) => [repo.id, repo.name]),
      ),
    [bundle],
  );
  const records = useMemo(
    () =>
      releaseAssetInventory(bundle).filter(
        (item) =>
          selectedOrgIds.length === 0 ||
          selectedOrgIds.includes(item.organizationId),
      ),
    [bundle, selectedOrgIds],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records
      .filter((item) => {
        if (
          needle &&
          !`${item.name} ${repositoryNames.get(item.repositoryId ?? '') ?? ''}`
            .toLowerCase()
            .includes(needle)
        )
          return false;
        if (kind !== 'all' && item.kind !== kind) return false;
        if (size === 'unknown' && item.sizeBytes !== null) return false;
        if (
          size === 'large' &&
          (item.sizeBytes === null || item.sizeBytes < 100 * 1024 * 1024)
        )
          return false;
        return true;
      })
      .sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1));
  }, [records, repositoryNames, query, kind, size]);
  const knownBytes = records.reduce(
    (total, item) => total + (item.sizeBytes ?? 0),
    0,
  );
  const columns = useMemo<
    readonly VirtualizedColumn<ReleaseAssetInventoryRecord>[]
  >(
    () => [
      {
        header: 'Type',
        cell: (item) => (
          <Label size="small" variant="secondary" className="capitalize">
            {item.kind.replace('-', ' ')}
          </Label>
        ),
      },
      {
        header: 'Name',
        width: '1.5fr',
        cell: (item) => (
          <div>
            <div className="font-semibold">{item.name}</div>
            <div className="text-xs text-[var(--fgColor-muted)]">
              {item.detail}
            </div>
          </div>
        ),
      },
      {
        header: 'Organization',
        cell: (item) => resolveOrgName(bundle, item.organizationId),
      },
      {
        header: 'Repository',
        width: '1.2fr',
        cell: (item) =>
          item.repositoryId
            ? (repositoryNames.get(item.repositoryId) ?? item.repositoryId)
            : 'Unavailable',
      },
      {
        header: 'Size',
        cell: (item) => (
          <div>
            <span
              className={
                item.sizeBytes === null
                  ? 'text-[var(--fgColor-attention)] font-medium'
                  : 'font-mono'
              }
            >
              {bytes(item.sizeBytes)}
            </span>
            {item.sizeAvailability !== 'observed' && (
              <div className="text-[10px] uppercase text-[var(--fgColor-muted)]">
                {item.sizeAvailability}
              </div>
            )}
          </div>
        ),
      },
      {
        header: 'Lifecycle',
        cell: (item) =>
          item.lifecycleAt
            ? new Date(item.lifecycleAt).toLocaleDateString()
            : 'Unavailable',
      },
      {
        header: 'Evidence',
        cell: (item) => (
          <div>
            <span className="capitalize">{item.provenance.source}</span>
            {item.compatibility === 'v1-asset' && (
              <Label size="small" variant="attention" className="ml-1">
                v1 normalized
              </Label>
            )}
          </div>
        ),
      },
    ],
    [bundle, repositoryNames],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Releases & Assets"
        description={`${filtered.length} of ${records.length} release, binary, large-asset, and LFS records. Unknown sizes are not counted as zero.`}
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `releases-assets-${bundle.scan.id}.csv`,
                generateReleaseAssetsCsv(bundle, filtered),
              )
            }
          >
            Export filtered CSV
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Releases"
          value={records.filter((item) => item.kind === 'release').length}
        />
        <MetricCard
          label="Release assets"
          value={records.filter((item) => item.kind === 'release-asset').length}
        />
        <MetricCard
          label="Large assets"
          value={records.filter((item) => item.kind === 'large-asset').length}
        />
        <MetricCard
          label="LFS dependencies"
          value={records.filter((item) => item.kind === 'lfs').length}
          tone="warning"
        />
        <MetricCard
          label="Known bytes"
          value={bytes(knownBytes)}
          detail={`${records.filter((item) => item.sizeBytes === null).length} records unknown`}
        />
      </div>
      <FilterToolbar
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        resultCount={`${filtered.length} results`}
      >
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Search name or repository
          <TextInput
            leadingVisual={SearchIcon}
            type="search"
            aria-label="Search name or repository"
            placeholder="Search name or repository…"
            size="small"
            block
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          View
          <Select
            aria-label="Filter by view"
            size="small"
            block
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <Select.Option value="all">All records</Select.Option>
            <Select.Option value="release">Releases</Select.Option>
            <Select.Option value="release-asset">Release assets</Select.Option>
            <Select.Option value="large-asset">Large assets</Select.Option>
            <Select.Option value="lfs">Git LFS</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Size signal
          <Select
            aria-label="Filter by size signal"
            size="small"
            block
            value={size}
            onChange={(event) => setSize(event.target.value)}
          >
            <Select.Option value="all">All sizes</Select.Option>
            <Select.Option value="large">100 MB or larger</Select.Option>
            <Select.Option value="unknown">Unknown size</Select.Option>
          </Select>
        </label>
      </FilterToolbar>
      <VirtualizedTable
        ariaLabel="Releases and assets inventory"
        rows={filtered}
        columns={columns}
        getRowKey={(row) => row.id}
        emptyMessage="No releases or assets match the current filters."
        minWidth={1050}
      />
    </div>
  );
}
