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
import { Button, Dialog, Flash, Label, Select, TextInput } from '@primer/react';
import { DownloadIcon, SearchIcon } from '@primer/octicons-react';
import {
  configurationCoverage,
  configurationInventory,
  freshness,
  type ConfigurationRecord,
} from '../lib/configuration-metadata.js';
import {
  downloadCsv,
  generateConfigurationMetadataCsv,
} from '../lib/export-csv.js';
import { resolveOrgName } from '../lib/formatters.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
const domains = [
  'actions',
  'dependabot',
  'codespaces',
  'environment',
  'copilot',
] as const;

export function SecretsAndVariablesTab({ bundle, selectedOrgIds }: Props) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [level, setLevel] = useState('all');
  const [kind, setKind] = useState('all');
  const [reach, setReach] = useState('all');
  const [freshnessFilter, setFreshnessFilter] = useState('all');
  const [selected, setSelected] = useState<ConfigurationRecord | null>(null);
  const scanDate = useMemo(
    () => new Date(bundle.scan.completedAt),
    [bundle.scan.completedAt],
  );
  const records = useMemo(
    () =>
      configurationInventory(bundle).filter(
        (item) =>
          selectedOrgIds.length === 0 ||
          selectedOrgIds.includes(item.organizationId),
      ),
    [bundle, selectedOrgIds],
  );
  const coverage = useMemo(
    () =>
      configurationCoverage(bundle).filter(
        (item) =>
          selectedOrgIds.length === 0 ||
          selectedOrgIds.includes(item.organizationId),
      ),
    [bundle, selectedOrgIds],
  );
  const duplicateNames = useMemo(() => {
    const scopes = new Map<string, Set<string>>();
    for (const item of records) {
      const key = `${item.organizationId}:${item.domain}:${item.name}`;
      const set = scopes.get(key) ?? new Set<string>();
      set.add(
        `${item.level}:${item.repositoryId ?? item.environmentName ?? 'org'}`,
      );
      scopes.set(key, set);
    }
    return new Set(
      [...scopes].filter(([, values]) => values.size > 1).map(([name]) => name),
    );
  }, [records]);
  const filtered = records
    .filter((item) => {
      const needle = query.trim().toLowerCase();
      if (
        needle &&
        !`${item.name} ${item.repositoryId ?? ''} ${item.environmentName ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      if (domain !== 'all' && item.domain !== domain) return false;
      if (level !== 'all' && item.level !== level) return false;
      if (kind !== 'all' && item.configurationKind !== kind) return false;
      if (reach !== 'all' && item.accessMode !== reach) return false;
      if (
        freshnessFilter !== 'all' &&
        freshness(item, scanDate) !== freshnessFilter
      )
        return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const columns: readonly VirtualizedColumn<ConfigurationRecord>[] = [
    {
      header: 'Name',
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
      header: 'Kind',
      cell: (item) => (
        <Label size="small" variant="secondary" className="capitalize">
          {item.configurationKind}
        </Label>
      ),
    },
    {
      header: 'Domain',
      cell: (item) => <span className="capitalize">{item.domain}</span>,
    },
    {
      header: 'Scope',
      cell: (item) => (
        <div>
          <span className="capitalize">{item.level}</span>
          <div className="text-xs text-[var(--fgColor-muted)]">
            {item.environmentName ?? item.repositoryId ?? 'Organization'}
          </div>
        </div>
      ),
    },
    {
      header: 'Reach',
      width: '1.2fr',
      cell: (item) => (
        <span className="capitalize">
          {item.accessMode.replaceAll('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Updated',
      cell: (item) => (
        <div>
          {item.updatedAt
            ? new Date(item.updatedAt).toLocaleDateString()
            : 'Unavailable'}
          <div
            className={`text-xs capitalize ${freshness(item, scanDate) === 'stale' ? 'text-[var(--fgColor-attention)]' : 'text-[var(--fgColor-muted)]'}`}
          >
            {freshness(item, scanDate)}
          </div>
        </div>
      ),
    },
    {
      header: 'Signals',
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          {duplicateNames.has(
            `${item.organizationId}:${item.domain}:${item.name}`,
          ) && (
            <Label size="small" variant="attention">
              Same name across scopes
            </Label>
          )}
          {item.level === 'organization' &&
            item.accessMode === 'all_repositories' && (
              <Label size="small" variant="attention">
                Broad reach
              </Label>
            )}
          {item.compatibility === 'v1-actions' && (
            <Label size="small" variant="secondary">
              v1 normalized
            </Label>
          )}
        </div>
      ),
    },
  ];
  const coverageFor = (value: (typeof domains)[number]) => {
    const states = coverage
      .filter((item) => item.domain === value)
      .map((item) => item.state);
    if (!states.length) return 'unknown';
    if (states.includes('denied')) return 'denied';
    if (states.includes('partial')) return 'partial';
    if (states.every((state) => state === 'unsupported')) return 'unsupported';
    if (states.every((state) => state === 'complete')) return 'complete';
    return 'mixed';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Secrets & Variables"
        description="Metadata-only configuration inventory. Values, hashes, lengths, ciphertext, destinations, and inferred sensitivity are never collected or displayed."
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `configuration-metadata-${bundle.scan.id}.csv`,
                generateConfigurationMetadataCsv(bundle, filtered),
              )
            }
          >
            Export filtered metadata CSV
          </Button>
        }
      />
      <Flash variant="warning">
        <div className="text-sm">
          <strong>Zero values:</strong> Presence does not prove workflow use.
          Every count and date below describes metadata only.
        </div>
      </Flash>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {domains.map((item) => (
          <MetricCard
            key={item}
            label={item}
            value={records.filter((record) => record.domain === item).length}
            detail={`Coverage: ${coverageFor(item)}`}
            tone={coverageFor(item) === 'complete' ? 'success' : 'warning'}
          />
        ))}
      </div>
      <FilterToolbar
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
        resultCount={`${filtered.length} records`}
      >
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Search
          <TextInput
            leadingVisual={SearchIcon}
            type="search"
            aria-label="Search configuration records"
            placeholder="Search records…"
            size="small"
            block
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Domain
          <Select
            aria-label="Filter by domain"
            size="small"
            block
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          >
            <Select.Option value="all">All</Select.Option>
            {domains.map((item) => (
              <Select.Option key={item} value={item}>
                {item}
              </Select.Option>
            ))}
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Scope
          <Select
            aria-label="Filter by scope"
            size="small"
            block
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="organization">Organization</Select.Option>
            <Select.Option value="repository">Repository</Select.Option>
            <Select.Option value="environment">Environment</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Kind
          <Select
            aria-label="Filter by kind"
            size="small"
            block
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="secret">Secret</Select.Option>
            <Select.Option value="variable">Variable</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Reach
          <Select
            aria-label="Filter by reach"
            size="small"
            block
            value={reach}
            onChange={(event) => setReach(event.target.value)}
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="all_repositories">
              All repositories
            </Select.Option>
            <Select.Option value="selected_repositories">
              Selected
            </Select.Option>
            <Select.Option value="private_repositories">Private</Select.Option>
            <Select.Option value="inherited">Inherited</Select.Option>
            <Select.Option value="unknown">Unknown</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Freshness
          <Select
            aria-label="Filter by freshness"
            size="small"
            block
            value={freshnessFilter}
            onChange={(event) => setFreshnessFilter(event.target.value)}
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="current">Current</Select.Option>
            <Select.Option value="stale">Stale</Select.Option>
            <Select.Option value="unknown">Unknown</Select.Option>
          </Select>
        </label>
      </FilterToolbar>
      <VirtualizedTable
        ariaLabel="Secrets and variables inventory table"
        rows={filtered}
        columns={columns}
        getRowKey={(row) => row.id}
        emptyMessage="No configuration metadata matches the active filters, or this domain was unavailable."
        minWidth={1100}
      />
      {selected && (
        <Dialog
          title={selected.name}
          subtitle="Metadata and inheritance"
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
                ['Domain', selected.domain],
                ['Kind', selected.configurationKind],
                ['Level', selected.level],
                ['Parent', selected.parentId],
                ['Repository', selected.repositoryId],
                ['Environment', selected.environmentName],
                ['Access mode', selected.accessMode],
                ['Selected reach', selected.selectedRepositoryCount],
                ['Updated', selected.updatedAt],
                ['Evidence', selected.provenance.operation],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="font-semibold text-[var(--fgColor-muted)]">
                    {label}
                  </dt>
                  <dd className="break-words text-[var(--fgColor-default)]">
                    {value ?? 'Unavailable'}
                  </dd>
                </div>
              ))}
            </dl>
            <Flash variant="default">
              <span className="text-sm">
                No configuration value exists in this record. Parent and reach
                fields describe administrative scope, not confirmed runtime use.
              </span>
            </Flash>
          </div>
        </Dialog>
      )}
    </div>
  );
}
