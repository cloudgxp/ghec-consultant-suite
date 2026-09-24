import React, { useState, useMemo } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  formatBytesMetric,
  formatCountMetric,
  resolveOrgName,
} from '../lib/formatters.js';
import { generateRepositoriesCsv, downloadCsv } from '../lib/export-csv.js';

interface RepositoriesTabProps {
  bundle: DiscoveryBundle;
  selectedOrgId: string;
}

export const RepositoriesTab: React.FC<RepositoriesTabProps> = ({
  bundle,
  selectedOrgId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [lfsFilter, setLfsFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pre-index auxiliary entities by repositoryId
  const lfsMap = useMemo(() => {
    const map = new Map<
      string,
      Extract<(typeof bundle.entities)[number], { kind: 'lfs' }>
    >();
    for (const e of bundle.entities) {
      if (e.kind === 'lfs') map.set(e.repositoryId, e);
    }
    return map;
  }, [bundle]);

  const actionsMap = useMemo(() => {
    const map = new Map<
      string,
      Extract<(typeof bundle.entities)[number], { kind: 'actions' }>
    >();
    for (const e of bundle.entities) {
      if (e.kind === 'actions') map.set(e.repositoryId, e);
    }
    return map;
  }, [bundle]);

  const secMap = useMemo(() => {
    const map = new Map<
      string,
      Extract<(typeof bundle.entities)[number], { kind: 'security' }>
    >();
    for (const e of bundle.entities) {
      if (e.kind === 'security') map.set(e.repositoryId, e);
    }
    return map;
  }, [bundle]);

  const repos = useMemo(() => {
    return bundle.entities.filter(
      (e) =>
        e.kind === 'repository' &&
        (!selectedOrgId || e.organizationId === selectedOrgId),
    ) as Extract<(typeof bundle.entities)[number], { kind: 'repository' }>[];
  }, [bundle, selectedOrgId]);

  const filteredRepos = useMemo(() => {
    return repos
      .filter((repo) => {
        if (
          searchQuery &&
          !repo.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
          return false;

        if (visibilityFilter !== 'all' && repo.visibility !== visibilityFilter)
          return false;

        if (lfsFilter !== 'all') {
          const lfs = lfsMap.get(repo.id);
          const isDetected = lfs?.indicator === 'detected';
          if (lfsFilter === 'detected' && !isDetected) return false;
          if (lfsFilter === 'not_detected' && isDetected) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          const res = a.name.localeCompare(b.name);
          return sortOrder === 'asc' ? res : -res;
        } else {
          const aSize = a.size.value ?? -1;
          const bSize = b.size.value ?? -1;
          const res = aSize - bSize;
          return sortOrder === 'asc' ? res : -res;
        }
      });
  }, [
    repos,
    searchQuery,
    visibilityFilter,
    lfsFilter,
    sortBy,
    sortOrder,
    lfsMap,
  ]);

  const handleExportCsv = () => {
    const csv = generateRepositoriesCsv(bundle, selectedOrgId || undefined);
    downloadCsv(`repositories-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-base-content">
            Repository Inventory
          </h2>
          <p className="text-sm text-base-content/70 mt-1">
            Displaying {filteredRepos.length} of {repos.length} repositories.
            {selectedOrgId && (
              <span className="font-semibold text-primary ml-1">
                (Filtered by {resolveOrgName(bundle, selectedOrgId)})
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="btn btn-primary btn-sm gap-2 shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export Repositories (CSV)
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-base-100 rounded-xl border border-base-300 shadow-xs">
        {/* Search */}
        <div>
          <label
            htmlFor="repo-search"
            className="text-xs font-semibold text-base-content/70 block mb-1"
          >
            Search Repositories
          </label>
          <input
            id="repo-search"
            type="search"
            placeholder="Filter by name..."
            className="input input-sm input-bordered w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Visibility Filter */}
        <div>
          <label
            htmlFor="repo-vis"
            className="text-xs font-semibold text-base-content/70 block mb-1"
          >
            Visibility
          </label>
          <select
            id="repo-vis"
            className="select select-sm select-bordered w-full"
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
          >
            <option value="all">All Visibilities</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="internal">Internal</option>
          </select>
        </div>

        {/* LFS Filter */}
        <div>
          <label
            htmlFor="repo-lfs"
            className="text-xs font-semibold text-base-content/70 block mb-1"
          >
            Git LFS Status
          </label>
          <select
            id="repo-lfs"
            className="select select-sm select-bordered w-full"
            value={lfsFilter}
            onChange={(e) => setLfsFilter(e.target.value)}
          >
            <option value="all">All LFS States</option>
            <option value="detected">LFS Detected</option>
            <option value="not_detected">No LFS</option>
          </select>
        </div>

        {/* Sort Options */}
        <div>
          <label
            htmlFor="repo-sort"
            className="text-xs font-semibold text-base-content/70 block mb-1"
          >
            Sort By
          </label>
          <div className="flex gap-2">
            <select
              id="repo-sort"
              className="select select-sm select-bordered w-full"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'size')}
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={`Sort order: ${sortOrder}`}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* Repositories Table */}
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
        <table
          className="table table-sm table-zebra w-full"
          aria-label="Repository inventory table"
        >
          <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
            <tr>
              <th scope="col">Repository</th>
              <th scope="col">Visibility</th>
              <th scope="col">Size</th>
              <th scope="col">Git LFS</th>
              <th scope="col">Actions & Runners</th>
              <th scope="col">Security Posture</th>
              <th scope="col">Branch</th>
            </tr>
          </thead>
          <tbody>
            {filteredRepos.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-base-content/60"
                >
                  No repositories match your criteria.
                </td>
              </tr>
            ) : (
              filteredRepos.map((repo) => {
                const lfs = lfsMap.get(repo.id);
                const actions = actionsMap.get(repo.id);
                const sec = secMap.get(repo.id);

                return (
                  <tr key={repo.id} className="hover:bg-base-200/50">
                    {/* Repo Name & Org */}
                    <td>
                      <div className="font-bold text-sm text-base-content">
                        {repo.name}
                      </div>
                      <div className="text-[11px] text-base-content/60">
                        {resolveOrgName(bundle, repo.organizationId)}
                      </div>
                      {repo.archived && (
                        <span className="badge badge-warning badge-xs mt-0.5">
                          Archived
                        </span>
                      )}
                      {repo.fork && (
                        <span className="badge badge-neutral badge-xs mt-0.5 ml-1">
                          Fork
                        </span>
                      )}
                    </td>

                    {/* Visibility */}
                    <td>
                      <span
                        className={`badge badge-sm capitalize ${
                          repo.visibility === 'public'
                            ? 'badge-warning'
                            : repo.visibility === 'private'
                              ? 'badge-neutral'
                              : 'badge-info'
                        }`}
                      >
                        {repo.visibility}
                      </span>
                    </td>

                    {/* Size */}
                    <td className="whitespace-nowrap">
                      <div className="font-mono text-xs">
                        {formatBytesMetric(repo.size)}
                      </div>
                      {repo.size.availability !== 'observed' && (
                        <div className="text-[10px] text-warning">
                          {repo.size.reason ?? 'Unknown'}
                        </div>
                      )}
                    </td>

                    {/* LFS */}
                    <td>
                      {lfs?.indicator === 'detected' ? (
                        <div>
                          <span className="badge badge-warning badge-xs font-semibold">
                            LFS Detected
                          </span>
                          <div className="text-[10px] font-mono text-base-content/70 mt-0.5">
                            {formatBytesMetric(lfs.storage)}
                          </div>
                        </div>
                      ) : (
                        <span className="badge badge-ghost badge-xs text-base-content/50">
                          None
                        </span>
                      )}
                    </td>

                    {/* Actions & Runners */}
                    <td>
                      {actions ? (
                        <div className="space-y-0.5">
                          <div className="text-xs">
                            <strong>
                              {formatCountMetric(actions.workflowCount)}
                            </strong>{' '}
                            workflows
                          </div>
                          {actions.runnerTypes.includes('self-hosted') ? (
                            <span className="badge badge-error badge-xs font-semibold">
                              Self-hosted Runner
                            </span>
                          ) : (
                            <span className="badge badge-ghost badge-xs">
                              Hosted
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-base-content/50">—</span>
                      )}
                    </td>

                    {/* Security */}
                    <td>
                      {sec ? (
                        <div className="text-xs space-y-0.5">
                          <div>
                            Dependabot:{' '}
                            <span
                              className={`font-semibold ${
                                sec.dependabot === 'enabled'
                                  ? 'text-success'
                                  : 'text-base-content/60'
                              }`}
                            >
                              {sec.dependabot}
                            </span>
                          </div>
                          <div>
                            Code Scan:{' '}
                            <span
                              className={`font-semibold ${
                                sec.codeScanning === 'enabled'
                                  ? 'text-success'
                                  : 'text-base-content/60'
                              }`}
                            >
                              {sec.codeScanning}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-base-content/50">—</span>
                      )}
                    </td>

                    {/* Branch */}
                    <td>
                      <code className="text-xs text-base-content/70">
                        {repo.defaultBranch ?? 'unknown'}
                      </code>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
