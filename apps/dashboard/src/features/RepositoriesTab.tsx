import React, { useMemo, useState } from 'react';
import type {
  DiscoveryBundle,
  RepoModuleResultSummary,
  RepositoryMigrationRecord,
} from '@ghec/contracts';
import {
  Button,
  Dialog,
  Flash,
  IconButton,
  Label,
  Select,
  TextInput,
} from '@primer/react';
import {
  DownloadIcon,
  LinkExternalIcon,
  LockIcon,
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
  DataTableFrame,
  EmptyState,
  FilterToolbar,
  PageHeader,
} from '../components/ui/index.js';
import type {
  HydratedOperationRow,
  ResultsHydrationData,
} from '../lib/importer.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
  resultsHydration?: ResultsHydrationData | undefined;
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
  resultsHydration,
}) => {
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [lfsFilter, setLfsFilter] = useState('all');
  const [migrationStatusFilter, setMigrationStatusFilter] = useState('all');
  const [sort, setSort] = useState<'name' | 'size'>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [drawerModuleFilter, setDrawerModuleFilter] = useState<string>('all');
  const [drawerQuery, setDrawerQuery] = useState<string>('');

  const repoMigrationMap = useMemo(() => {
    const map = new Map<string, RepositoryMigrationRecord>();
    for (const rec of resultsHydration?.manifest.repositories ?? []) {
      map.set(rec.targetRepo, rec);
      map.set(rec.sourceRepo, rec);
    }
    return map;
  }, [resultsHydration]);

  const hasMigrationData = repoMigrationMap.size > 0;

  const indexes = useMemo(() => {
    const lfs = new Map<string, Lfs>();
    const actions = new Map<string, Actions>();
    const security = new Map<string, Security>();
    const portfolio = new Map<
      string,
      Extract<
        DiscoveryBundle['entities'][number],
        { kind: 'repository-portfolio' }
      >
    >();
    for (const entity of bundle.entities) {
      if (entity.kind === 'lfs') lfs.set(entity.repositoryId, entity);
      if (entity.kind === 'actions') actions.set(entity.repositoryId, entity);
      if (entity.kind === 'security') security.set(entity.repositoryId, entity);
      if (entity.kind === 'repository-portfolio')
        portfolio.set(entity.repositoryId, entity);
    }
    return { lfs, actions, security, portfolio };
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
        if (migrationStatusFilter !== 'all') {
          const mig = repoMigrationMap.get(repository.name);
          if (!mig || mig.status !== migrationStatusFilter) return false;
        }
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
  }, [
    repositories,
    query,
    visibility,
    migrationStatusFilter,
    repoMigrationMap,
    lfsFilter,
    indexes,
    sort,
    order,
  ]);

  const columns = useMemo<readonly VirtualizedColumn<Repository>[]>(() => {
    const baseCols: VirtualizedColumn<Repository>[] = [
      {
        header: 'Repository',
        width: '1.5fr',
        cell: (repo) => {
          const strategyBadgeText =
            resultsHydration?.repoStrategyBadges[repo.name];
          return (
            <>
              <button
                type="button"
                onClick={() => {
                  setDrawerModuleFilter('all');
                  setDrawerQuery('');
                  setSelectedRepo(repo);
                }}
                className="text-left font-bold text-sm text-[var(--fgColor-accent)] hover:underline cursor-pointer"
              >
                {repo.name}
              </button>
              <div className="text-[11px] text-[var(--fgColor-muted)]">
                {resolveOrgName(bundle, repo.organizationId)}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {repo.archived && (
                  <Label variant="attention" size="small">
                    Archived
                  </Label>
                )}
                {repo.fork && (
                  <Label variant="secondary" size="small">
                    Fork
                  </Label>
                )}
                {strategyBadgeText && (
                  <Label variant="accent" size="small">
                    {strategyBadgeText}
                  </Label>
                )}
                {indexes.portfolio.get(repo.id)?.customProperties?.map((cp) => (
                  <span
                    key={cp.name}
                    className="px-1.5 py-0.5 text-[10px] font-mono border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] rounded text-[var(--fgColor-muted)]"
                    title={`${cp.name}: ${cp.value}`}
                  >
                    {cp.name}: {cp.value}
                  </span>
                ))}
              </div>
            </>
          );
        },
      },
    ];

    if (hasMigrationData) {
      baseCols.push({
        header: 'Migration Status',
        width: '1.15fr',
        cell: (repo) => {
          const mig = repoMigrationMap.get(repo.name);
          if (!mig) {
            return (
              <span className="text-xs text-[var(--fgColor-muted)]">—</span>
            );
          }
          const modList = Object.values(mig.moduleSummaries ?? {});
          const succeededMods = modList.filter(
            (m) => m.status === 'complete' || m.status === 'skipped',
          ).length;
          return (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1">
                <Label
                  size="small"
                  variant={mig.status === 'succeeded' ? 'success' : 'danger'}
                  className="capitalize"
                >
                  {mig.status}
                </Label>
                <span className="font-mono text-[10px] text-[var(--fgColor-muted)]">
                  {mig.durationMs}ms
                </span>
              </div>
              <div className="text-[11px] text-[var(--fgColor-muted)]">
                {modList.length > 0
                  ? `${succeededMods}/${modList.length} modules · `
                  : `${mig.stagesRun.length} stages · `}
                <button
                  type="button"
                  onClick={() => {
                    setDrawerModuleFilter('all');
                    setDrawerQuery('');
                    setSelectedRepo(repo);
                  }}
                  className="text-[var(--fgColor-accent)] hover:underline cursor-pointer font-semibold"
                >
                  Inspect
                </button>
              </div>
            </div>
          );
        },
      });
    }

    baseCols.push(
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
        width: '1.1fr',
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
        width: '1.1fr',
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
        width: '0.8fr',
        cell: (repo) => (
          <code className="text-xs text-[var(--fgColor-default)]">
            {repo.defaultBranch ?? 'unknown'}
          </code>
        ),
      },
    );
    return baseCols;
  }, [bundle, indexes, hasMigrationData, repoMigrationMap, resultsHydration]);

  const selectedRepoMigration = selectedRepo
    ? repoMigrationMap.get(selectedRepo.name)
    : undefined;

  const selectedRepoModuleRows = useMemo<
    readonly RepoModuleResultSummary[]
  >(() => {
    if (!selectedRepoMigration?.moduleSummaries) return [];
    return Object.values(selectedRepoMigration.moduleSummaries);
  }, [selectedRepoMigration]);

  const selectedRepoOperations = useMemo<
    readonly HydratedOperationRow[]
  >(() => {
    if (!selectedRepo || !resultsHydration) return [];
    const needle = drawerQuery.trim().toLowerCase();
    return resultsHydration.postCare.operationRows.filter((op) => {
      if (op.targetRepo !== selectedRepo.name) return false;
      if (drawerModuleFilter !== 'all' && op.moduleId !== drawerModuleFilter) {
        return false;
      }
      if (needle) {
        const hay =
          `${op.moduleId} ${op.resourceName} ${op.subDomain} ${op.operationType} ${op.status} ${op.notes}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [selectedRepo, resultsHydration, drawerModuleFilter, drawerQuery]);

  const skippedArchivedRows =
    resultsHydration?.postCare.skippedArchivedRows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository Inventory"
        description={
          <>
            Displaying {filtered.length} of {repositories.length} repositories.
            Click any repository name to inspect its 19-module migration
            breakdown, granular operations, and direct GitHub Settings links.
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

      <FilterToolbar
        className={`grid grid-cols-1 sm:grid-cols-2 ${hasMigrationData ? 'lg:grid-cols-5' : 'md:grid-cols-4'} gap-4`}
      >
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
        {hasMigrationData && (
          <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
            Migration Status
            <Select
              aria-label="Migration Status"
              size="small"
              block
              value={migrationStatusFilter}
              onChange={(e) => setMigrationStatusFilter(e.target.value)}
            >
              <Select.Option value="all">All Migration States</Select.Option>
              <Select.Option value="succeeded">Succeeded</Select.Option>
              <Select.Option value="failed">Failed</Select.Option>
            </Select>
          </label>
        )}
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
          ...(migrationStatusFilter !== 'all'
            ? [
                {
                  id: 'migrationStatus',
                  label: `Migration: ${migrationStatusFilter}`,
                  onRemove: () => setMigrationStatusFilter('all'),
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
          setMigrationStatusFilter('all');
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
                setMigrationStatusFilter('all');
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
          estimateRowHeight={76}
          minWidth={1050}
        />
      )}

      {/* Skipped Archived Repositories Section (replaces exports/archived-repositories-skipped.csv & POST-CARE-CHECKLIST Section 6 table) */}
      {skippedArchivedRows.length > 0 && (
        <details
          open
          className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-4 shadow-xs"
        >
          <summary className="cursor-pointer font-bold text-sm text-[var(--fgColor-default)] select-none">
            Skipped Archived Repositories ({skippedArchivedRows.length}) — Not
            Migrated by Default
          </summary>
          <div className="mt-3 space-y-3">
            <Flash variant="default">
              <span className="text-xs">
                Archived repositories are skipped by default to keep the target
                organization clean. To migrate any of these repositories, re-run
                the CLI with <code>--include-archived</code>.
              </span>
            </Flash>
            <DataTableFrame caption="Skipped archived repositories">
              <table
                className="w-full text-left border-collapse text-xs"
                aria-label="Skipped archived repositories"
              >
                <thead className="bg-[var(--bgColor-muted)] text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Source Repository
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Visibility & Fork
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Disposition
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Notes
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Source Link
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {skippedArchivedRows.map((row) => (
                    <tr
                      key={`${row.sourceOrg}/${row.sourceRepo}`}
                      className="border-b border-[var(--borderColor-muted)] odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                    >
                      <td className="px-3 py-2 font-mono font-bold text-[var(--fgColor-default)]">
                        {row.sourceOrg}/{row.sourceRepo}
                      </td>
                      <td className="px-3 py-2 font-mono text-[var(--fgColor-muted)] capitalize">
                        {row.visibility}
                        {row.isFork ? ' · fork' : ''}
                      </td>
                      <td className="px-3 py-2">
                        <Label size="small" variant="attention">
                          {row.disposition}
                        </Label>
                      </td>
                      <td className="px-3 py-2 text-[var(--fgColor-default)]">
                        {row.notes}
                      </td>
                      <td className="px-3 py-2">
                        {row.sourceUrl && (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[var(--fgColor-accent)] hover:underline"
                          >
                            <span>View Source Repo</span>
                            <LinkExternalIcon size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableFrame>
          </div>
        </details>
      )}

      {/* Repository Migration Detail Slide-Over Drawer (replaces success/<repo>.md, failure/<repo>.md, and repositories/<repo>/<module>.md) */}
      {selectedRepo && (
        <Dialog
          title={`Repository Report: ${selectedRepo.name}`}
          subtitle={
            resultsHydration
              ? `${resultsHydration.manifest.sourceOrg}/${selectedRepo.name} ➔ ${resultsHydration.manifest.targetOrg}/${selectedRepo.name}`
              : `Organization: ${resolveOrgName(bundle, selectedRepo.organizationId)}`
          }
          position="right"
          width="xlarge"
          onClose={() => setSelectedRepo(null)}
        >
          <div className="space-y-5 p-4">
            {/* Summary Strip */}
            <div className="flex flex-wrap items-center gap-2">
              <Label variant="secondary" className="capitalize">
                Visibility: {selectedRepo.visibility}
              </Label>
              <Label variant="secondary" className="font-mono">
                Size: {formatBytesMetric(selectedRepo.size)}
              </Label>
              <Label variant="secondary" className="font-mono">
                Default branch: {selectedRepo.defaultBranch ?? 'unknown'}
              </Label>
              {selectedRepoMigration && (
                <>
                  <Label
                    variant={
                      selectedRepoMigration.status === 'succeeded'
                        ? 'success'
                        : 'danger'
                    }
                    className="capitalize"
                  >
                    Migration: {selectedRepoMigration.status}
                  </Label>
                  <Label variant="secondary" className="font-mono">
                    Duration: {selectedRepoMigration.durationMs}ms
                  </Label>
                </>
              )}
              {resultsHydration?.repoStrategyBadges[selectedRepo.name] && (
                <Label variant="accent">
                  {resultsHydration.repoStrategyBadges[selectedRepo.name]}
                </Label>
              )}
            </div>

            {selectedRepoMigration?.status === 'failed' && (
              <Flash variant="danger">
                <div className="text-xs space-y-1">
                  <div className="font-bold">
                    Repository Migration Failure:{' '}
                    {selectedRepoMigration.failureReason ?? 'Unknown error'}
                  </div>
                  <div>
                    Inspect the failed modules below or re-run with targeted
                    remediation:
                    <code className="ml-1 rounded bg-[var(--bgColor-muted)] px-1.5 py-0.5 font-mono">
                      ghec-consultant-cli migrate --source-org{' '}
                      {resultsHydration?.manifest.sourceOrg ?? 'source-org'}{' '}
                      --target-org{' '}
                      {resultsHydration?.manifest.targetOrg ?? 'target-org'}{' '}
                      --repos {selectedRepo.name}
                    </code>
                  </div>
                </div>
              </Flash>
            )}

            {/* Tier 2: Repository Modules Breakdown */}
            {selectedRepoModuleRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--fgColor-muted)] m-0">
                    Tier 2 · Per-Repository Module Breakdown (
                    {selectedRepoModuleRows.length} Modules)
                  </h4>
                  {drawerModuleFilter !== 'all' && (
                    <Button
                      size="small"
                      onClick={() => setDrawerModuleFilter('all')}
                    >
                      Show All Modules ({selectedRepoOperations.length})
                    </Button>
                  )}
                </div>
                <DataTableFrame caption="Per-repository module execution breakdown">
                  <table
                    className="w-full text-left border-collapse text-xs"
                    aria-label="Per-repository module execution breakdown"
                  >
                    <thead className="bg-[var(--bgColor-muted)] text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
                      <tr>
                        <th scope="col" className="px-2.5 py-2">
                          Module
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Status
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Succeeded / Total / Skipped
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Failed
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Verification
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRepoModuleRows.map((mod) => (
                        <tr
                          key={mod.moduleId}
                          className={`border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)]/50 ${
                            drawerModuleFilter === mod.moduleId
                              ? 'bg-[var(--bgColor-accent-muted)]/30'
                              : 'odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20'
                          }`}
                        >
                          <td className="px-2.5 py-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDrawerModuleFilter(
                                  drawerModuleFilter === mod.moduleId
                                    ? 'all'
                                    : mod.moduleId,
                                )
                              }
                              className="text-left font-mono font-semibold text-[var(--fgColor-accent)] hover:underline cursor-pointer"
                            >
                              {mod.moduleId}
                            </button>
                          </td>
                          <td className="px-2.5 py-1.5">
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
                          <td className="px-2.5 py-1.5 font-mono text-[var(--fgColor-default)]">
                            {mod.succeededOperations} / {mod.totalOperations} /{' '}
                            {mod.skippedOperations}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">
                            {mod.failedOperations > 0 ? (
                              <span className="font-bold text-[var(--fgColor-danger)]">
                                {mod.failedOperations}
                              </span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Label
                              size="small"
                              variant={
                                mod.discrepancyCount === 0
                                  ? 'success'
                                  : 'attention'
                              }
                            >
                              {mod.discrepancyCount === 0
                                ? 'Verified'
                                : `${mod.discrepancyCount} Discrepancies`}
                            </Label>
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-[var(--fgColor-muted)]">
                            {mod.durationMs ?? 0}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableFrame>
              </div>
            )}

            {/* Tier 3: Granular Repository Operations (replaces repositories/<repo>/<module>.md) */}
            {resultsHydration && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--fgColor-muted)] m-0">
                    Tier 3 · Granular Repository Operations (
                    {selectedRepoOperations.length})
                    {drawerModuleFilter !== 'all' &&
                      ` · Filtered by ${drawerModuleFilter}`}
                  </h4>
                  <div className="w-64">
                    <TextInput
                      leadingVisual={SearchIcon}
                      type="search"
                      aria-label="Filter repository operations"
                      placeholder="Filter resources or notes…"
                      size="small"
                      block
                      value={drawerQuery}
                      onChange={(e) => setDrawerQuery(e.target.value)}
                    />
                  </div>
                </div>
                <DataTableFrame caption="Granular repository operations">
                  <table
                    className="w-full text-left border-collapse text-xs"
                    aria-label="Granular repository operations"
                  >
                    <thead className="bg-[var(--bgColor-muted)] text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
                      <tr>
                        <th scope="col" className="px-2.5 py-2">
                          Module
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Resource & Scope
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Operation & Status
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Notes & Settings Link
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRepoOperations.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-center py-6 text-[var(--fgColor-muted)]"
                          >
                            No granular operations match the current filter.
                          </td>
                        </tr>
                      ) : (
                        selectedRepoOperations.map((op, idx) => (
                          <tr
                            key={`${op.moduleId}-${op.resourceName}-${idx}`}
                            className="border-b border-[var(--borderColor-muted)] odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                          >
                            <td className="px-2.5 py-2 font-mono text-[var(--fgColor-muted)]">
                              {op.moduleId}
                            </td>
                            <td className="px-2.5 py-2">
                              <div className="flex flex-wrap items-center gap-1 font-mono font-bold text-[var(--fgColor-default)]">
                                <span>{op.resourceName}</span>
                                {op.isSecret && (
                                  <Label size="small" variant="attention">
                                    <LockIcon size={10} className="mr-1" />
                                    [SEALED]
                                  </Label>
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--fgColor-muted)]">
                                {op.subDomain || op.scopeLevel}
                              </div>
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
                                      {op.secondaryLinkLabel ??
                                        'Secondary Link'}
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
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
};
