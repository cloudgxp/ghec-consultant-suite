import React, { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, IconButton, Label, Select, TextInput } from '@primer/react';
import {
  DownloadIcon,
  SearchIcon,
  SortAscIcon,
  SortDescIcon,
} from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import {
  formatBytesMetric,
  formatCountMetric,
  resolveOrgName,
} from '../lib/formatters.js';
import { generateRepositoriesCsv, downloadCsv } from '../lib/export-csv.js';
import {
  ActiveFilters,
  EmptyState,
  FilterToolbar,
  PageHeader,
} from '../components/ui/index.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Repository = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'repository' }
>;
type Lfs = Extract<DiscoveryBundle['entities'][number], { kind: 'lfs' }>;
type Actions = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'actions' }
>;
type Security = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'security' }
>;

export const RepositoriesTab: React.FC<Props> = ({
  bundle,
  selectedOrgIds,
}) => {
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [lfsFilter, setLfsFilter] = useState('all');
  const [sort, setSort] = useState<'name' | 'size'>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const indexes = useMemo(() => {
    const lfs = new Map<string, Lfs>();
    const actions = new Map<string, Actions>();
    const security = new Map<string, Security>();
    for (const entity of bundle.entities) {
      if (entity.kind === 'lfs') lfs.set(entity.repositoryId, entity);
      if (entity.kind === 'actions') actions.set(entity.repositoryId, entity);
      if (entity.kind === 'security') security.set(entity.repositoryId, entity);
    }
    return { lfs, actions, security };
  }, [bundle]);
  const repositories = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Repository =>
          entity.kind === 'repository' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return repositories
      .filter((repository) => {
        if (needle && !repository.name.toLowerCase().includes(needle))
          return false;
        if (visibility !== 'all' && repository.visibility !== visibility)
          return false;
        const detected =
          indexes.lfs.get(repository.id)?.indicator === 'detected';
        return (
          lfsFilter === 'all' ||
          (lfsFilter === 'detected' ? detected : !detected)
        );
      })
      .sort((a, b) => {
        const value =
          sort === 'name'
            ? a.name.localeCompare(b.name)
            : (a.size.value ?? -1) - (b.size.value ?? -1);
        return order === 'asc' ? value : -value;
      });
  }, [repositories, query, visibility, lfsFilter, indexes, sort, order]);
  const columns = useMemo<readonly VirtualizedColumn<Repository>[]>(
    () => [
      {
        header: 'Repository',
        width: '1.4fr',
        cell: (repo) => (
          <>
            <div className="font-bold text-sm text-[var(--fgColor-default)]">
              {repo.name}
            </div>
            <div className="text-[11px] text-[var(--fgColor-muted)]">
              {resolveOrgName(bundle, repo.organizationId)}
            </div>
            {repo.archived && (
              <Label variant="attention" size="small" className="mt-1">
                Archived
              </Label>
            )}
            {repo.fork && (
              <Label variant="secondary" size="small" className="mt-1 ml-1">
                Fork
              </Label>
            )}
          </>
        ),
      },
      {
        header: 'Visibility',
        width: '0.8fr',
        cell: (repo) => (
          <Label
            variant={
              repo.visibility === 'public'
                ? 'attention'
                : repo.visibility === 'private'
                  ? 'secondary'
                  : 'accent'
            }
            size="small"
            className="capitalize"
          >
            {repo.visibility}
          </Label>
        ),
      },
      {
        header: 'Size',
        cell: (repo) => (
          <>
            <div className="font-mono text-xs text-[var(--fgColor-default)]">
              {formatBytesMetric(repo.size)}
            </div>
            {repo.size.availability !== 'observed' && (
              <div className="text-[10px] text-[var(--fgColor-attention)]">
                {repo.size.reason}
              </div>
            )}
          </>
        ),
      },
      {
        header: 'Git LFS',
        cell: (repo) => {
          const lfs = indexes.lfs.get(repo.id);
          return lfs?.indicator === 'detected' ? (
            <>
              <Label variant="attention" size="small">
                LFS Detected
              </Label>
              <div className="text-[10px] font-mono mt-1 text-[var(--fgColor-muted)]">
                {formatBytesMetric(lfs.storage)}
              </div>
            </>
          ) : (
            <Label variant="secondary" size="small">
              None
            </Label>
          );
        },
      },
      {
        header: 'Actions & Runners',
        width: '1.2fr',
        cell: (repo) => {
          const action = indexes.actions.get(repo.id);
          return action ? (
            <>
              <div className="text-xs text-[var(--fgColor-default)]">
                <strong>{formatCountMetric(action.workflowCount)}</strong>{' '}
                workflows
              </div>
              <Label
                variant={
                  action.runnerTypes.includes('self-hosted')
                    ? 'danger'
                    : 'secondary'
                }
                size="small"
                className="mt-1"
              >
                {action.runnerTypes.includes('self-hosted')
                  ? 'Self-hosted'
                  : 'Hosted'}
              </Label>
            </>
          ) : (
            <span className="text-[var(--fgColor-muted)]">—</span>
          );
        },
      },
      {
        header: 'Security Posture',
        width: '1.2fr',
        cell: (repo) => {
          const sec = indexes.security.get(repo.id);
          return sec ? (
            <div className="text-xs text-[var(--fgColor-default)]">
              <div>
                Dependabot: <strong>{sec.dependabot}</strong>
              </div>
              <div>
                Code scan: <strong>{sec.codeScanning}</strong>
              </div>
            </div>
          ) : (
            <span className="text-[var(--fgColor-muted)]">—</span>
          );
        },
      },
      {
        header: 'Branch',
        width: '0.9fr',
        cell: (repo) => (
          <code className="text-xs text-[var(--fgColor-default)]">
            {repo.defaultBranch ?? 'unknown'}
          </code>
        ),
      },
    ],
    [bundle, indexes],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository Inventory"
        description={
          <>
            Displaying {filtered.length} of {repositories.length} repositories.
            {selectedOrgIds.length > 0 && (
              <span className="font-semibold text-[var(--fgColor-accent)] ml-1">
                (Filtered by {selectedOrgIds.length} organization(s))
              </span>
            )}
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `repositories-${bundle.scan.id}.csv`,
                generateRepositoriesCsv(
                  bundle,
                  selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
                ),
              )
            }
          >
            Export Repositories (CSV)
          </Button>
        }
      />
      <FilterToolbar className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Search
          <TextInput
            leadingVisual={SearchIcon}
            type="search"
            aria-label="Search"
            placeholder="Search repositories…"
            size="small"
            block
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Visibility
          <Select
            aria-label="Visibility"
            size="small"
            block
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <Select.Option value="all">All Visibilities</Select.Option>
            <Select.Option value="public">Public</Select.Option>
            <Select.Option value="private">Private</Select.Option>
            <Select.Option value="internal">Internal</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Git LFS Status
          <Select
            aria-label="Git LFS Status"
            size="small"
            block
            value={lfsFilter}
            onChange={(e) => setLfsFilter(e.target.value)}
          >
            <Select.Option value="all">All LFS States</Select.Option>
            <Select.Option value="detected">LFS Detected</Select.Option>
            <Select.Option value="not_detected">No LFS</Select.Option>
          </Select>
        </label>
        <div className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          <span>Sort By</span>
          <div className="flex gap-2 items-center">
            <Select
              aria-label="Sort by"
              size="small"
              className="w-full"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'name' | 'size')}
            >
              <Select.Option value="name">Name</Select.Option>
              <Select.Option value="size">Size</Select.Option>
            </Select>
            <IconButton
              size="small"
              icon={order === 'asc' ? SortAscIcon : SortDescIcon}
              onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
              aria-label={`Sort ${order === 'asc' ? 'descending' : 'ascending'}`}
            />
          </div>
        </div>
      </FilterToolbar>
      <ActiveFilters
        filters={[
          ...(query
            ? [
                {
                  id: 'query',
                  label: `Search: ${query}`,
                  onRemove: () => setQuery(''),
                },
              ]
            : []),
          ...(visibility !== 'all'
            ? [
                {
                  id: 'visibility',
                  label: `Visibility: ${visibility}`,
                  onRemove: () => setVisibility('all'),
                },
              ]
            : []),
          ...(lfsFilter !== 'all'
            ? [
                {
                  id: 'lfs',
                  label: `LFS: ${lfsFilter}`,
                  onRemove: () => setLfsFilter('all'),
                },
              ]
            : []),
        ]}
        onClearAll={() => {
          setQuery('');
          setVisibility('all');
          setLfsFilter('all');
        }}
      />
      {filtered.length === 0 && repositories.length > 0 ? (
        <EmptyState
          title="No repositories match these filters"
          message="Remove one or more active filters to restore the inventory."
          action={
            <Button
              variant="primary"
              size="small"
              onClick={() => {
                setQuery('');
                setVisibility('all');
                setLfsFilter('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <VirtualizedTable
          ariaLabel="Repository inventory table"
          rows={filtered}
          columns={columns}
          getRowKey={(row) => row.id}
          emptyMessage="No repositories match your criteria."
          estimateRowHeight={72}
          minWidth={1050}
        />
      )}
    </div>
  );
};
