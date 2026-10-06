import React, { useMemo, useState } from 'react';
import { Button, Label, TextInput } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilterIcon,
  SearchIcon,
  SkipIcon,
} from '@primer/octicons-react';
import type {
  ModuleCategory,
  ModuleOperationSummary,
} from '../lib/step-summary.js';

export interface OperationsBreakdownTableProps {
  operations: ModuleOperationSummary[];
  onSelectModule?: ((moduleId: string) => void) | undefined;
}

export const OperationsBreakdownTable: React.FC<
  OperationsBreakdownTableProps
> = ({ operations, onSelectModule }) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | ModuleCategory>(
    'all',
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    return operations.filter((op) => {
      if (categoryFilter !== 'all' && op.category !== categoryFilter) {
        return false;
      }
      if (statusFilter !== 'all' && op.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = op.displayName.toLowerCase().includes(q);
        const matchId = op.moduleId.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      return true;
    });
  }, [operations, categoryFilter, statusFilter, searchQuery]);

  const totals = useMemo(() => {
    return operations.reduce(
      (acc, op) => ({
        creates: acc.creates + op.creates,
        updates: acc.updates + op.updates,
        noops: acc.noops + op.noops,
        skips: acc.skips + op.skips,
        failures: acc.failures + op.failures,
      }),
      { creates: 0, updates: 0, noops: 0, skips: 0, failures: 0 },
    );
  }, [operations]);

  const totalOpsCount =
    totals.creates +
    totals.updates +
    totals.noops +
    totals.skips +
    totals.failures;

  return (
    <div className="space-y-4">
      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-muted)]">
            Total Operations
          </div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-default)]">
            {totalOpsCount}
          </div>
        </div>
        <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-success)]">Created</div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-success)]">
            {totals.creates}
          </div>
        </div>
        <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-accent)]">Updated</div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-accent)]">
            {totals.updates}
          </div>
        </div>
        <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-muted)]">No-Op</div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-muted)]">
            {totals.noops}
          </div>
        </div>
        <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-muted)]">Skipped</div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-muted)]">
            {totals.skips}
          </div>
        </div>
        <div className="p-3 rounded border border-[var(--borderColor-danger-muted)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-danger)]">Failures</div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-danger)]">
            {totals.failures}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <TextInput
            leadingVisual={SearchIcon}
            placeholder="Filter by module name or id..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter modules"
            block
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--fgColor-muted)] flex items-center gap-1">
            <FilterIcon size={14} /> Scope:
          </span>
          <div className="flex rounded border border-[var(--borderColor-default)] overflow-hidden text-xs">
            {(
              ['all', 'organization', 'repository', 'post-migration'] as const
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 transition-colors ${
                  categoryFilter === cat
                    ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)] font-medium'
                    : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
                }`}
              >
                {cat === 'all'
                  ? 'All Scopes'
                  : cat === 'organization'
                    ? 'Org'
                    : cat === 'repository'
                      ? 'Repo'
                      : 'Post-Migration'}
              </button>
            ))}
          </div>

          <div className="flex rounded border border-[var(--borderColor-default)] overflow-hidden text-xs">
            {(['all', 'completed', 'failed', 'skipped'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 transition-colors ${
                  statusFilter === st
                    ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)] font-medium'
                    : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
                }`}
              >
                {st === 'all'
                  ? 'All Status'
                  : st === 'completed'
                    ? 'Succeeded'
                    : st === 'failed'
                      ? 'Failed'
                      : 'Skipped'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded border border-[var(--borderColor-default)] overflow-hidden bg-[var(--canvas-default)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] font-semibold">
                <th className="py-2.5 px-3 w-8"></th>
                <th className="py-2.5 px-3">Module</th>
                <th className="py-2.5 px-3">Scope</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Creates</th>
                <th className="py-2.5 px-3 text-right">Updates</th>
                <th className="py-2.5 px-3 text-right">No-Op</th>
                <th className="py-2.5 px-3 text-right">Skips</th>
                <th className="py-2.5 px-3 text-right">Failures</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--borderColor-muted)]">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-8 text-center text-[var(--fgColor-muted)]"
                  >
                    No modules match the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((op) => {
                  const isExpanded = expandedModules.has(op.moduleId);
                  const hasDetails = Boolean(
                    (op.errors && op.errors.length > 0) ||
                    (op.details && op.details.length > 0),
                  );

                  return (
                    <React.Fragment key={op.moduleId}>
                      <tr
                        className={`hover:bg-[var(--canvas-subtle)] transition-colors ${
                          isExpanded ? 'bg-[var(--canvas-subtle)]' : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-center">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(op.moduleId)}
                              className="text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)] focus:outline-none"
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? (
                                <ChevronDownIcon size={14} />
                              ) : (
                                <ChevronRightIcon size={14} />
                              )}
                            </button>
                          ) : null}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium text-[var(--fgColor-default)]">
                            {op.displayName}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--fgColor-muted)]">
                            {op.moduleId}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <Label
                            variant="secondary"
                            className="capitalize text-[10px]"
                          >
                            {op.category === 'post-migration'
                              ? 'Post-Migration'
                              : op.category === 'organization'
                                ? 'Organization'
                                : 'Repository'}
                          </Label>
                        </td>
                        <td className="py-2 px-3">
                          {op.status === 'completed' ? (
                            <Label
                              variant="accent"
                              className="text-[10px] inline-flex items-center gap-1"
                            >
                              <CheckCircleIcon size={12} /> Succeeded
                            </Label>
                          ) : op.status === 'failed' ? (
                            <Label
                              variant="attention"
                              className="text-[10px] inline-flex items-center gap-1"
                            >
                              <AlertIcon size={12} /> Failed
                            </Label>
                          ) : op.status === 'skipped' ? (
                            <Label
                              variant="secondary"
                              className="text-[10px] inline-flex items-center gap-1"
                            >
                              <SkipIcon size={12} /> Skipped
                            </Label>
                          ) : (
                            <Label variant="secondary" className="text-[10px]">
                              Pending
                            </Label>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-[var(--fgColor-success)]">
                          {op.creates}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-[var(--fgColor-accent)]">
                          {op.updates}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[var(--fgColor-muted)]">
                          {op.noops}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[var(--fgColor-muted)]">
                          {op.skips}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono font-bold ${
                            op.failures > 0
                              ? 'text-[var(--fgColor-danger)]'
                              : 'text-[var(--fgColor-muted)]'
                          }`}
                        >
                          {op.failures}
                        </td>
                      </tr>

                      {/* Expandable Details Row */}
                      {isExpanded && hasDetails && (
                        <tr className="bg-[var(--canvas-subtle)] border-t border-[var(--borderColor-muted)]">
                          <td colSpan={9} className="py-3 px-6">
                            <div className="space-y-2">
                              {op.errors && op.errors.length > 0 && (
                                <div className="p-3 rounded border border-[var(--borderColor-danger-muted)] bg-[var(--canvas-default)]">
                                  <div className="text-xs font-semibold text-[var(--fgColor-danger)] mb-1 flex items-center gap-1.5">
                                    <AlertIcon size={14} /> Error Diagnostics
                                    (Zero-Secrets Redacted)
                                  </div>
                                  <ul className="list-disc list-inside space-y-1 text-xs text-[var(--fgColor-danger)] font-mono">
                                    {op.errors.map((err, idx) => (
                                      <li key={idx} className="break-all">
                                        {err}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {op.details && op.details.length > 0 && (
                                <div className="p-3 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)]">
                                  <div className="text-xs font-semibold text-[var(--fgColor-default)] mb-1">
                                    Operation Logs & Metrics
                                  </div>
                                  <ul className="list-disc list-inside space-y-1 text-xs text-[var(--fgColor-muted)]">
                                    {op.details.map((item, idx) => (
                                      <li key={idx}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {onSelectModule && (
                                <div className="pt-1 flex justify-end">
                                  <Button
                                    size="small"
                                    onClick={() => onSelectModule(op.moduleId)}
                                  >
                                    View in Domain Tab
                                  </Button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
