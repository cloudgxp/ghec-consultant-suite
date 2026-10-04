import { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  FilterToolbar,
  MetricCard,
  PageHeader,
  SurfaceCard,
} from '../components/ui/index.js';
import { Label, Select, TextInput } from '@primer/react';
import { SearchIcon } from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Portfolio = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'repository-portfolio' }
>;
export function PortfolioTab({ bundle, selectedOrgIds }: Props) {
  const [language, setLanguage] = useState('all');
  const [classification, setClassification] = useState('all');
  const [query, setQuery] = useState('');
  const repos = useMemo(
    () =>
      new Map(
        bundle.entities
          .filter((e) => e.kind === 'repository')
          .map((e) => [e.id, e]),
      ),
    [bundle],
  );
  const ownership = useMemo(
    () =>
      new Map(
        bundle.entities
          .filter((e) => e.kind === 'code-ownership')
          .map((e) => [e.repositoryId, e]),
      ),
    [bundle],
  );
  const rows = bundle.entities.filter(
    (e): e is Portfolio =>
      e.kind === 'repository-portfolio' &&
      (!selectedOrgIds.length || selectedOrgIds.includes(e.organizationId)),
  );
  const languages = [
    ...new Set(
      rows.flatMap((e) => (e.primaryLanguage ? [e.primaryLanguage] : [])),
    ),
  ].sort();
  const filtered = rows.filter((e) => {
    const repo = repos.get(e.repositoryId);
    return (
      (!query || repo?.name.toLowerCase().includes(query.toLowerCase())) &&
      (language === 'all' || e.primaryLanguage === language) &&
      (classification === 'all' ||
        (classification === 'missing'
          ? !e.businessClassification
          : e.businessClassification === classification))
    );
  });
  const columns: readonly VirtualizedColumn<Portfolio>[] = [
    {
      header: 'Repository',
      width: '1.4fr',
      cell: (e) => (
        <strong>{repos.get(e.repositoryId)?.name ?? e.repositoryId}</strong>
      ),
    },
    {
      header: 'Visibility',
      cell: (e) => repos.get(e.repositoryId)?.visibility ?? 'Unknown',
    },
    { header: 'Language', cell: (e) => e.primaryLanguage ?? 'Unclassified' },
    {
      header: 'Topics',
      width: '1.4fr',
      cell: (e) =>
        e.topics.length
          ? e.topics.map((t) => (
              <Label key={t} size="small" variant="secondary" className="mr-1">
                {t}
              </Label>
            ))
          : 'None',
    },
    {
      header: 'Business class',
      cell: (e) =>
        e.businessClassification ?? (
          <span className="text-[var(--fgColor-attention)] font-medium">
            Missing
          </span>
        ),
    },
    {
      header: 'Wave',
      cell: (e) =>
        e.migrationWave ?? (
          <span className="text-[var(--fgColor-attention)] font-medium">
            Unassigned
          </span>
        ),
    },
    {
      header: 'Ownership',
      cell: (e) => ownership.get(e.repositoryId)?.presence ?? 'Unknown',
    },
    {
      header: 'Last push',
      cell: (e) =>
        e.pushedAt ? new Date(e.pushedAt).toLocaleDateString() : 'Unknown',
    },
  ];
  const distribution = [
    ...new Set(rows.map((e) => e.primaryLanguage ?? 'Unclassified')),
  ]
    .map((label) => ({
      label,
      count: rows.filter((e) => (e.primaryLanguage ?? 'Unclassified') === label)
        .length,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository Portfolio"
        description="Segment repositories by language, topic, visibility, ownership, business classification, and migration wave."
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Repositories" value={rows.length} />
        <MetricCard
          label="Uncategorized"
          value={rows.filter((e) => !e.businessClassification).length}
          tone="warning"
        />
        <MetricCard
          label="Ownerless / unknown"
          value={
            rows.filter(
              (e) => ownership.get(e.repositoryId)?.presence !== 'present',
            ).length
          }
          tone="warning"
        />
        <MetricCard
          label="Wave unassigned"
          value={rows.filter((e) => !e.migrationWave).length}
          tone="warning"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <FilterToolbar className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
            Search
            <TextInput
              leadingVisual={SearchIcon}
              type="search"
              aria-label="Search repositories"
              placeholder="Search repositories…"
              size="small"
              block
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
            Language
            <Select
              size="small"
              block
              aria-label="Filter by language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <Select.Option value="all">All</Select.Option>
              {languages.map((l) => (
                <Select.Option key={l} value={l}>
                  {l}
                </Select.Option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
            Classification
            <Select
              size="small"
              block
              aria-label="Filter by classification"
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
            >
              <Select.Option value="all">All</Select.Option>
              <Select.Option value="missing">Missing</Select.Option>
            </Select>
          </label>
        </FilterToolbar>
        <SurfaceCard className="p-4">
          <h3 className="font-bold text-sm text-[var(--fgColor-default)]">
            Language distribution
          </h3>
          <ul className="mt-2 text-sm space-y-1">
            {distribution.slice(0, 6).map((d) => (
              <li key={d.label} className="flex justify-between items-center">
                <button
                  type="button"
                  className="text-left text-[var(--fgColor-accent)] hover:underline cursor-pointer"
                  onClick={() => setLanguage(d.label)}
                >
                  {d.label}
                </button>
                <strong className="text-[var(--fgColor-default)]">
                  {d.count}
                </strong>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </div>
      <VirtualizedTable
        ariaLabel="Repository portfolio"
        rows={filtered}
        columns={columns}
        getRowKey={(e) => e.id}
        emptyMessage="No repositories match this segment."
        minWidth={1100}
      />
    </div>
  );
}
