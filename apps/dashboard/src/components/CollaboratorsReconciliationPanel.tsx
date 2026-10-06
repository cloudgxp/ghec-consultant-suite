import React, { useMemo, useState } from 'react';
import { Button, Flash, Label, TextInput } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  LinkExternalIcon,
  PersonIcon,
  RepoIcon,
  SearchIcon,
  SyncIcon,
} from '@primer/octicons-react';
import {
  categorizeCollaboratorGrants,
  predictEmuUsername,
  type CollaboratorGrantItem,
  type OutsideCollaboratorReconciliation,
} from '../lib/team-tree.js';

export interface CollaboratorEntityItem {
  id: string;
  pseudonym: string;
  outsideCollaborator?: boolean | null | undefined;
  ssoStatus?: 'linked' | 'unlinked' | 'unknown' | undefined;
  membership?: 'member' | 'owner' | 'outside' | 'unknown' | undefined;
  repositoryGrants?: CollaboratorGrantItem[] | undefined;
}

export interface CollaboratorsReconciliationPanelProps {
  collaborators: CollaboratorEntityItem[];
  emuSuffix?: string | undefined;
  onTriggerReconciliation?: (() => void) | undefined;
}

export const CollaboratorsReconciliationPanel: React.FC<
  CollaboratorsReconciliationPanelProps
> = ({ collaborators, emuSuffix = '_gxp', onTriggerReconciliation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'ready' | 'needs_invitation' | 'blocked'
  >('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Map to reconciliation records
  const reconciledList: OutsideCollaboratorReconciliation[] = useMemo(() => {
    return collaborators.map((c) => {
      const sourceLogin = c.pseudonym;
      const predictedTargetLogin = predictEmuUsername(sourceLogin, emuSuffix);
      const grants = c.repositoryGrants ?? [];

      let reconciliationStatus: OutsideCollaboratorReconciliation['reconciliationStatus'] =
        'ready';
      if (c.ssoStatus === 'unlinked') {
        reconciliationStatus = 'needs_invitation';
      } else if (grants.length === 0) {
        reconciliationStatus = 'needs_invitation';
      }

      return {
        id: c.id,
        pseudonym: c.pseudonym,
        sourceLogin,
        predictedTargetLogin,
        ssoStatus: c.ssoStatus ?? 'unknown',
        repositoryGrants: grants,
        reconciliationStatus,
      };
    });
  }, [collaborators, emuSuffix]);

  const filtered = useMemo(() => {
    return reconciledList.filter((item) => {
      if (
        statusFilter !== 'all' &&
        item.reconciliationStatus !== statusFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSource = item.sourceLogin.toLowerCase().includes(q);
        const matchTarget = item.predictedTargetLogin.toLowerCase().includes(q);
        if (!matchSource && !matchTarget) return false;
      }
      return true;
    });
  }, [reconciledList, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    let ready = 0;
    let needsInvite = 0;
    let blocked = 0;

    for (const item of reconciledList) {
      if (item.reconciliationStatus === 'ready') ready++;
      else if (item.reconciliationStatus === 'needs_invitation') needsInvite++;
      else blocked++;
    }

    return { total: reconciledList.length, ready, needsInvite, blocked };
  }, [reconciledList]);

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-muted)]">
            Outside Collaborators
          </div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-default)]">
            {stats.total}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-success)]">
            EMU Ready (Linked)
          </div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-success)]">
            {stats.ready}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-attention)]">
            Manual Invitation Required
          </div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-attention)]">
            {stats.needsInvite}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-[var(--borderColor-danger-muted)] bg-[var(--canvas-subtle)]">
          <div className="text-xs text-[var(--fgColor-danger)]">
            Reconciliation Blocked
          </div>
          <div className="text-xl font-bold font-mono text-[var(--fgColor-danger)]">
            {stats.blocked}
          </div>
        </div>
      </div>

      {/* Info notice about EMU outside collaborators */}
      <Flash variant="default">
        <div className="flex items-start gap-2 text-xs">
          <LinkExternalIcon size={16} className="mt-0.5" />
          <div>
            <span className="font-semibold">EMU Enterprise Policy Note:</span>{' '}
            In GitHub Enterprise Managed Users (EMU), outside collaborators
            cannot be provisioned via SCIM or join via SAML without enterprise
            guest user licensing or explicit organization invitation. Use{' '}
            <code>gh gei reclaim-mannequin --skip-invitation</code> for commit
            re-attribution.
          </div>
        </div>
      </Flash>

      {/* Toolbar: Search, Filters, View Switcher */}
      <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px] max-w-sm">
          <TextInput
            leadingVisual={SearchIcon}
            placeholder="Filter collaborators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter outside collaborators"
            block
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded border border-[var(--borderColor-default)] overflow-hidden text-xs">
            {(['all', 'ready', 'needs_invitation'] as const).map((st) => (
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
                  ? 'All'
                  : st === 'ready'
                    ? 'Linked'
                    : 'Needs Invite'}
              </button>
            ))}
          </div>

          <div className="flex rounded border border-[var(--borderColor-default)] overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 transition-colors ${
                viewMode === 'cards'
                  ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)] font-medium'
                  : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 transition-colors ${
                viewMode === 'table'
                  ? 'bg-[var(--bgColor-accent-emphasis)] text-[var(--fgColor-onEmphasis)] font-medium'
                  : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
              }`}
            >
              Table
            </button>
          </div>

          {onTriggerReconciliation && (
            <Button
              size="small"
              leadingVisual={SyncIcon}
              onClick={onTriggerReconciliation}
            >
              Reconcile All
            </Button>
          )}
        </div>
      </div>

      {/* Render Mode: Cards */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-xs text-[var(--fgColor-muted)] border border-dashed border-[var(--borderColor-default)] rounded-lg">
              No outside collaborators found matching criteria.
            </div>
          ) : (
            filtered.map((c) => {
              const categorized = categorizeCollaboratorGrants(
                c.repositoryGrants,
              );
              return (
                <div
                  key={c.id}
                  className="p-4 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-default)] flex flex-col justify-between hover:border-[var(--borderColor-muted)] transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] flex items-center justify-center text-[var(--fgColor-muted)] font-mono text-xs">
                          <PersonIcon size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-[var(--fgColor-default)]">
                            {c.sourceLogin}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--fgColor-muted)]">
                            Target: {c.predictedTargetLogin}
                          </div>
                        </div>
                      </div>

                      {c.reconciliationStatus === 'ready' ? (
                        <Label
                          variant="accent"
                          className="text-[10px] inline-flex items-center gap-1"
                        >
                          <CheckCircleIcon size={12} /> Ready
                        </Label>
                      ) : (
                        <Label
                          variant="attention"
                          className="text-[10px] inline-flex items-center gap-1"
                        >
                          <AlertIcon size={12} /> Needs Invite
                        </Label>
                      )}
                    </div>

                    {/* Repository Access Summary */}
                    <div className="mt-3 pt-3 border-t border-[var(--borderColor-muted)]">
                      <div className="text-[11px] font-semibold text-[var(--fgColor-muted)] mb-1.5 flex items-center gap-1">
                        <RepoIcon size={12} /> Repository Access (
                        {c.repositoryGrants.length})
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {categorized.admin.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--bgColor-danger-muted)] text-[var(--fgColor-danger)] font-medium">
                            Admin ({categorized.admin.length})
                          </span>
                        )}
                        {categorized.maintain.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--bgColor-attention-muted)] text-[var(--fgColor-attention)] font-medium">
                            Maintain ({categorized.maintain.length})
                          </span>
                        )}
                        {categorized.write.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--bgColor-accent-muted)] text-[var(--fgColor-accent)] font-medium">
                            Write ({categorized.write.length})
                          </span>
                        )}
                        {categorized.read.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] border border-[var(--borderColor-default)]">
                            Read ({categorized.read.length})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 text-[10px] text-[var(--fgColor-muted)] flex items-center justify-between">
                    <span>SSO: {c.ssoStatus}</span>
                    <span className="font-mono">EMU rule: {emuSuffix}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Render Mode: Table */
        <div className="rounded-lg border border-[var(--borderColor-default)] overflow-hidden bg-[var(--canvas-default)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] font-semibold">
                <th className="py-2.5 px-4">Source Identity</th>
                <th className="py-2.5 px-4">Target EMU Identity</th>
                <th className="py-2.5 px-4">SSO Status</th>
                <th className="py-2.5 px-4">Repository Grants</th>
                <th className="py-2.5 px-4 text-right">Reconciliation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--borderColor-muted)]">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-[var(--fgColor-muted)]"
                  >
                    No outside collaborators found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-[var(--canvas-subtle)] transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono font-medium text-[var(--fgColor-default)]">
                      {c.sourceLogin}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[var(--fgColor-accent)]">
                      {c.predictedTargetLogin}
                    </td>
                    <td className="py-2.5 px-4">
                      <Label
                        variant="secondary"
                        className="capitalize text-[10px]"
                      >
                        {c.ssoStatus}
                      </Label>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono">
                        {c.repositoryGrants.length} repo(s)
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {c.reconciliationStatus === 'ready' ? (
                        <Label
                          variant="accent"
                          className="text-[10px] inline-flex items-center gap-1"
                        >
                          <CheckCircleIcon size={12} /> Ready
                        </Label>
                      ) : (
                        <Label
                          variant="attention"
                          className="text-[10px] inline-flex items-center gap-1"
                        >
                          <AlertIcon size={12} /> Needs Invite
                        </Label>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
