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
import {
  Button,
  Checkbox,
  Dialog,
  Flash,
  Label,
  Select,
  TextInput,
} from '@primer/react';
import { DownloadIcon, PackageIcon, SearchIcon } from '@primer/octicons-react';
import { downloadCsv, generatePackagesCsv } from '../lib/export-csv.js';
import {
  packageInventory,
  type PackageInventoryRecord,
} from '../lib/supply-chain.js';
import { resolveOrgName } from '../lib/formatters.js';
import { ModuleTriggerModal } from '../components/ModuleTriggerModal.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}

const display = (value: string | number | null | undefined) =>
  value ?? 'Unavailable';
const bytes = (value: number | null) =>
  value === null ? 'Unknown' : `${(value / 1024 / 1024).toFixed(1)} MB`;

export function PackagesTab({ bundle, selectedOrgIds }: Props) {
  const [query, setQuery] = useState('');
  const [ecosystem, setEcosystem] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [linkage, setLinkage] = useState('all');
  const [selected, setSelected] = useState<PackageInventoryRecord | null>(null);
  const records = useMemo(
    () =>
      packageInventory(bundle).filter(
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
          !`${item.name} ${item.owner ?? ''}`.toLowerCase().includes(needle)
        )
          return false;
        if (ecosystem !== 'all' && item.ecosystem !== ecosystem) return false;
        if (visibility !== 'all' && item.visibility !== visibility)
          return false;
        if (linkage === 'linked' && !item.repositoryId) return false;
        if (linkage === 'unlinked' && item.repositoryId) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records, query, ecosystem, visibility, linkage]);
  const ecosystems = [...new Set(records.map((item) => item.ecosystem))].sort();
  const observed = records.filter(
    (item) => item.sizeAvailability === 'observed',
  ).length;
  const columns = useMemo<readonly VirtualizedColumn<PackageInventoryRecord>[]>(
    () => [
      {
        header: 'Package',
        width: '1.4fr',
        cell: (item) => (
          <button
            type="button"
            className="text-left font-semibold text-[var(--fgColor-accent)] hover:underline cursor-pointer"
            onClick={() => setSelected(item)}
          >
            {item.name}
          </button>
        ),
      },
      {
        header: 'Ecosystem',
        cell: (item) => (
          <Label size="small" variant="secondary">
            {item.ecosystem}
          </Label>
        ),
      },
      {
        header: 'Visibility',
        cell: (item) => <span className="capitalize">{item.visibility}</span>,
      },
      { header: 'Owner', cell: (item) => display(item.owner) },
      {
        header: 'Repository',
        width: '1.2fr',
        cell: (item) =>
          item.repositoryId ?? (
            <span className="text-[var(--fgColor-attention)] font-medium">
              Unlinked
            </span>
          ),
      },
      { header: 'Versions', cell: (item) => display(item.versionCount) },
      { header: 'Known size', cell: (item) => bytes(item.sizeBytes) },
      {
        header: 'Disposition',
        cell: (item) => (
          <span className="capitalize">
            {item.disposition.replace('_', ' ')}
          </span>
        ),
      },
    ],
    [],
  );

  const [isTriggerOpen, setIsTriggerOpen] = useState(false);
  const [includeGhcr, setIncludeGhcr] = useState(true);
  const [includeLanguagePkgs, setIncludeLanguagePkgs] = useState(true);
  const [dispatchedRun, setDispatchedRun] = useState<{
    workflowId: string;
    modules: string[];
    isDryRun: boolean;
  } | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packages"
        description={`${filtered.length} of ${records.length} packages. Metadata only; package content is never downloaded.`}
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `packages-${bundle.scan.id}.csv`,
                generatePackagesCsv(bundle, filtered),
              )
            }
          >
            Export filtered CSV
          </Button>
        }
        secondaryActions={
          <Button
            size="small"
            leadingVisual={PackageIcon}
            onClick={() => setIsTriggerOpen(true)}
          >
            Replicate Packages & Images
          </Button>
        }
      />
      {dispatchedRun && (
        <Flash variant="success">
          <div className="flex items-center justify-between text-xs">
            <span>
              Dispatched <strong>{dispatchedRun.modules.join(', ')}</strong> (
              {dispatchedRun.isDryRun ? 'Dry-Run Simulation' : 'Live Apply'}) to
              workflow <code>{dispatchedRun.workflowId}</code>.
            </span>
            <Button size="small" onClick={() => setDispatchedRun(null)}>
              Dismiss
            </Button>
          </div>
        </Flash>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Packages" value={records.length} />
        <MetricCard label="Registries" value={ecosystems.length} />
        <MetricCard
          label="Organizations"
          value={new Set(records.map((item) => item.organizationId)).size}
        />
        <MetricCard
          label="Unlinked"
          value={records.filter((item) => !item.repositoryId).length}
          tone="warning"
        />
        <MetricCard
          label="Size coverage"
          value={
            records.length
              ? `${Math.round((observed / records.length) * 100)}%`
              : 'N/A'
          }
          detail="Observed, never inferred as zero"
        />
      </div>
      <FilterToolbar
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        resultCount={`${filtered.length} results`}
      >
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Search
          <TextInput
            leadingVisual={SearchIcon}
            type="search"
            aria-label="Search packages"
            placeholder="Search packages…"
            size="small"
            block
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Ecosystem
          <Select
            aria-label="Filter by ecosystem"
            size="small"
            block
            value={ecosystem}
            onChange={(event) => setEcosystem(event.target.value)}
          >
            <Select.Option value="all">All ecosystems</Select.Option>
            {ecosystems.map((value) => (
              <Select.Option key={value} value={value}>
                {value}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Visibility
          <Select
            aria-label="Filter by visibility"
            size="small"
            block
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <Select.Option value="all">All visibility</Select.Option>
            <Select.Option value="public">Public</Select.Option>
            <Select.Option value="private">Private</Select.Option>
            <Select.Option value="internal">Internal</Select.Option>
            <Select.Option value="unknown">Unknown</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Repository linkage
          <Select
            aria-label="Filter by repository linkage"
            size="small"
            block
            value={linkage}
            onChange={(event) => setLinkage(event.target.value)}
          >
            <Select.Option value="all">All packages</Select.Option>
            <Select.Option value="linked">Linked</Select.Option>
            <Select.Option value="unlinked">Unlinked</Select.Option>
          </Select>
        </label>
      </FilterToolbar>
      <VirtualizedTable
        ariaLabel="Package inventory"
        rows={filtered}
        columns={columns}
        getRowKey={(row) => row.id}
        emptyMessage="No packages match the current filters."
        minWidth={1100}
      />
      {selected && (
        <Dialog
          title={selected.name}
          subtitle="Package details"
          position="right"
          width="large"
          onClose={() => setSelected(null)}
        >
          <div className="space-y-4 p-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                [
                  'Organization',
                  resolveOrgName(bundle, selected.organizationId),
                ],
                ['Ecosystem', selected.ecosystem],
                ['Visibility', selected.visibility],
                ['Owner', selected.owner],
                ['Repository', selected.repositoryId],
                ['Versions', selected.versionCount],
                ['Known size', bytes(selected.sizeBytes)],
                ['Created', selected.createdAt],
                ['Updated', selected.updatedAt],
                ['Disposition', selected.disposition],
                ['Evidence source', selected.provenance.source],
                ['Operation', selected.provenance.operation],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="font-semibold text-[var(--fgColor-muted)]">
                    {label}
                  </dt>
                  <dd className="break-words text-[var(--fgColor-default)]">
                    {display(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {selected.compatibility === 'v1-asset' && (
              <Flash variant="warning">
                <span className="text-sm">
                  This record was normalized from a v1 generic asset.
                  Unavailable dimensions are intentionally shown as unavailable.
                </span>
              </Flash>
            )}
          </div>
        </Dialog>
      )}
      <ModuleTriggerModal
        isOpen={isTriggerOpen}
        onClose={() => setIsTriggerOpen(false)}
        title="Replicate Packages & Container Images"
        description="Migrate GHCR container images and package registry artifacts (npm, Maven, NuGet, RubyGems) to target enterprise packages infrastructure."
        modules={['packages']}
        sourceOrg={
          selectedOrgIds[0]
            ? resolveOrgName(bundle, selectedOrgIds[0])
            : bundle.organizations[0]?.login || 'source-org'
        }
        affectedCount={records.length}
        entityLabel="packages"
        prerequisites={[
          'Target enterprise container and package permissions granted',
          'Target packages storage and token credentials configured',
        ]}
        customOptions={
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={includeGhcr}
                onChange={(e) => setIncludeGhcr(e.target.checked)}
              />
              <span className="text-xs text-[var(--fgColor-default)] font-medium">
                Include GHCR Container Images (Docker / OCI)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={includeLanguagePkgs}
                onChange={(e) => setIncludeLanguagePkgs(e.target.checked)}
              />
              <span className="text-xs text-[var(--fgColor-default)] font-medium">
                Include Language Packages (npm, Maven, NuGet, RubyGems)
              </span>
            </div>
            <p className="text-[11px] text-[var(--fgColor-muted)]">
              Registry sync will re-tag and push images/packages directly to
              target registry endpoints without pulling full layers locally.
            </p>
          </div>
        }
        onDispatched={(res) => {
          setDispatchedRun(res);
          setIsTriggerOpen(false);
        }}
      />
    </div>
  );
}
