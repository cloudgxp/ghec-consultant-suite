import React, { useEffect, useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  Button,
  Dialog,
  Flash,
  Label,
  ProgressBar,
  Select,
  TextInput,
  UnderlineNav,
} from '@primer/react';
import {
  CheckCircleIcon,
  CopyIcon,
  DownloadIcon,
  LinkExternalIcon,
  LockIcon,
  SearchIcon,
} from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import {
  FilterToolbar,
  MetricCard,
  PageHeader,
} from '../components/ui/index.js';
import { downloadCsv, sanitizeCsvField } from '../lib/export-csv.js';
import type {
  HydratedPostCareCategory,
  HydratedPostCareItem,
  ResultsHydrationData,
} from '../lib/importer.js';

interface PostCareChecklistTabProps {
  bundle: DiscoveryBundle;
  resultsHydration: ResultsHydrationData;
}

type CategoryGroupFilter =
  | 'all'
  | 'secrets'
  | 'github-apps'
  | 'webhooks'
  | 'runners'
  | 'identity'
  | 'governance';

const CATEGORY_GROUP_LABELS: Record<CategoryGroupFilter, string> = {
  all: 'All Action Items',
  secrets: '1. Secrets [SEALED]',
  'github-apps': '2. GitHub Apps',
  webhooks: '3. Webhooks',
  runners: '4. Runners',
  identity: '5. Identity & Access',
  governance: '6. Governance & Failed',
};

function mapCategoryToGroup(
  cat: HydratedPostCareCategory,
): Exclude<CategoryGroupFilter, 'all'> {
  switch (cat) {
    case 'secret':
      return 'secrets';
    case 'github-app':
      return 'github-apps';
    case 'webhook':
      return 'webhooks';
    case 'runner':
      return 'runners';
    case 'idp-team':
    case 'mannequin':
    case 'collaborator':
    case 'deploy-key':
      return 'identity';
    case 'policy':
    case 'package':
    case 'security':
    case 'failed-operation':
      return 'governance';
  }
}

const CATEGORY_GUIDANCE: Record<
  Exclude<CategoryGroupFilter, 'all'>,
  { title: string; body: string }
> = {
  secrets: {
    title: 'Zero-Exposure Secret Boundary (DEC-004)',
    body: 'Source secret values are write-only and never exposed by GitHub APIs. All migrated secrets were initialized as empty [SEALED] placeholders ("") to reserve names and access policies. Populate real values in GitHub Settings or run the copyable gh secret set CLI commands below.',
  },
  'github-apps': {
    title: 'GitHub App Re-Installation & Repository Auto-Binding',
    body: 'Installing each GitHub App on the target organization automatically binds repository access (All repositories or Selected repositories). After installing, verify OAuth callback URLs, webhook endpoints, and private keys.',
  },
  webhooks: {
    title: 'Webhook Re-Activation & Shared Secret Population',
    body: 'Webhooks are created in an Inactive (active: false) state during migration to prevent accidental payload storms. Re-enter the webhook shared secret in GitHub Settings, verify the payload URL, and check [x] Active.',
  },
  runners: {
    title: 'Self-Hosted Runner Re-Registration & Larger Runner Billing',
    body: 'Self-hosted runner daemons must be re-registered on target hosts using a fresh registration token. For GitHub-hosted Larger Runners, confirm target Enterprise/Organization Actions spending limits are enabled under Settings -> Billing and plans.',
  },
  identity: {
    title: 'EMU Identity Provisioning, Teams, Deploy Keys & Mannequins',
    body: 'Ensure target Enterprise Managed Users (EMU) accounts are provisioned via SCIM/IdP before running gh gei reclaim-mannequin --skip-invitation, binding IdP-synced team groups, or cutting over SSH deploy keys (ssh-keygen / gh repo deploy-key add).',
  },
  governance: {
    title: 'Governance Verification & Failed/Skipped Module Remediation',
    body: 'Review custom repository roles, ruleset bypass actors, package registries, and any failed or skipped operations.',
  },
};

const priorityVariant: Record<
  HydratedPostCareItem['priority'],
  'danger' | 'attention' | 'secondary'
> = {
  high: 'danger',
  medium: 'attention',
  low: 'secondary',
};

function generatePostCareItemsCsv(
  items: readonly HydratedPostCareItem[],
  completedIds: ReadonlySet<string>,
): string {
  const headers = [
    'Item ID',
    'Completed',
    'Priority',
    'Category',
    'Scope Level',
    'Target Org',
    'Target Repo',
    'Environment',
    'Sub-Domain',
    'Module ID',
    'Resource Name',
    'Migration Status',
    'Action Required',
    'Settings URL',
    'Secondary URL',
    'CLI Command',
    'Notes',
  ];
  const rows = items.map((item) =>
    [
      item.itemId,
      completedIds.has(item.itemId) ? 'true' : 'false',
      item.priority,
      item.category,
      item.scopeLevel,
      item.targetOrg,
      item.targetRepo ?? '',
      item.environmentName ?? '',
      item.subDomain,
      item.moduleId,
      item.resourceName,
      item.migrationStatus,
      item.actionRequired,
      item.settingsUrl,
      item.secondaryUrl ?? '',
      item.cliCommand ?? '',
      item.notes ?? '',
    ]
      .map((val) => sanitizeCsvField(val))
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

export const PostCareChecklistTab: React.FC<PostCareChecklistTabProps> = ({
  bundle,
  resultsHydration,
}) => {
  const runId = resultsHydration.manifest.runId || bundle.scan.id;
  const sourceOrg = resultsHydration.manifest.sourceOrg;
  const targetOrg = resultsHydration.manifest.targetOrg;
  const storageKey = `ghec:postcare:${runId}`;

  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          return new Set(parsed.map(String));
        }
      }
    } catch {
      // Ignore storage access errors
    }
    return new Set();
  });

  const [categoryGroup, setCategoryGroup] =
    useState<CategoryGroupFilter>('all');
  const [priority, setPriority] = useState<string>('all');
  const [scopeLevel, setScopeLevel] = useState<string>('all');
  const [completionFilter, setCompletionFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<HydratedPostCareItem | null>(
    null,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([...completedIds]),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [completedIds, storageKey]);

  const items = resultsHydration.postCare.items;

  const countsByGroup = useMemo(() => {
    const counts: Record<CategoryGroupFilter, number> = {
      all: items.length,
      secrets: 0,
      'github-apps': 0,
      webhooks: 0,
      runners: 0,
      identity: 0,
      governance: 0,
    };
    for (const item of items) {
      const grp = mapCategoryToGroup(item.category);
      counts[grp] = (counts[grp] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (
        categoryGroup !== 'all' &&
        mapCategoryToGroup(item.category) !== categoryGroup
      ) {
        return false;
      }
      if (priority !== 'all' && item.priority !== priority) return false;
      if (scopeLevel !== 'all' && item.scopeLevel !== scopeLevel) return false;
      if (completionFilter === 'pending' && completedIds.has(item.itemId)) {
        return false;
      }
      if (completionFilter === 'completed' && !completedIds.has(item.itemId)) {
        return false;
      }
      if (needle) {
        const haystack =
          `${item.itemId} ${item.resourceName} ${item.targetRepo ?? ''} ${item.environmentName ?? ''} ${item.subDomain} ${item.moduleId} ${item.actionRequired} ${item.notes ?? ''} ${item.cliCommand ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [
    items,
    categoryGroup,
    priority,
    scopeLevel,
    completionFilter,
    completedIds,
    query,
  ]);

  const toggleItem = (id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const markFilteredDone = () => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      for (const item of filteredItems) {
        next.add(item.itemId);
      }
      return next;
    });
  };

  const resetProgress = () => {
    setCompletedIds(new Set());
  };

  const handleCopyCommand = (id: string, command: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(command);
    }
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 2000);
  };

  const completedCount = useMemo(
    () => items.filter((item) => completedIds.has(item.itemId)).length,
    [items, completedIds],
  );
  const progressPercent =
    items.length > 0 ? Math.round((completedCount / items.length) * 100) : 100;

  const columns: readonly VirtualizedColumn<HydratedPostCareItem>[] = [
    {
      header: 'Done',
      width: '0.45fr',
      cell: (item) => {
        const isDone = completedIds.has(item.itemId);
        return (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isDone}
              onChange={() => toggleItem(item.itemId)}
              aria-label={`Mark ${item.resourceName} (${item.itemId}) as completed`}
              className="h-4 w-4 cursor-pointer accent-[var(--fgColor-accent)]"
            />
            <span className="font-mono text-[11px] text-[var(--fgColor-muted)] truncate max-w-40">
              {item.itemId}
            </span>
          </label>
        );
      },
    },
    {
      header: 'Priority & Category',
      width: '0.95fr',
      cell: (item) => (
        <div className="flex flex-wrap items-center gap-1">
          <Label
            size="small"
            variant={priorityVariant[item.priority]}
            className="uppercase"
          >
            {item.priority}
          </Label>
          <Label size="small" variant="secondary" className="capitalize">
            {item.category}
          </Label>
          {item.category === 'secret' && (
            <Label size="small" variant="attention">
              <LockIcon size={12} className="mr-1" />
              [SEALED]
            </Label>
          )}
        </div>
      ),
    },
    {
      header: 'Scope & Resource',
      width: '1.35fr',
      cell: (item) => (
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setSelectedItem(item)}
            className="text-left font-mono text-xs font-bold text-[var(--fgColor-accent)] hover:underline cursor-pointer break-all"
          >
            {item.resourceName}
          </button>
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--fgColor-muted)]">
            <span className="capitalize font-semibold">{item.scopeLevel}</span>
            {item.targetRepo && (
              <span>
                · {item.targetOrg}/{item.targetRepo}
              </span>
            )}
            {item.environmentName && <span>· env:{item.environmentName}</span>}
            {item.subDomain && <span>· {item.subDomain}</span>}
          </div>
        </div>
      ),
    },
    {
      header: 'Action Required & Operational Notes',
      width: '1.8fr',
      cell: (item) => (
        <div className="space-y-1">
          <div className="text-xs font-medium text-[var(--fgColor-default)]">
            {item.actionRequired}
          </div>
          {item.notes && (
            <div className="text-[11px] text-[var(--fgColor-muted)]">
              {item.notes}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Direct Links & CLI Command',
      width: '1.5fr',
      cell: (item) => (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {item.settingsUrl && (
              <a
                href={item.settingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--fgColor-accent)] hover:underline"
              >
                <span>Open Settings</span>
                <LinkExternalIcon size={12} />
              </a>
            )}
            {item.secondaryUrl && (
              <a
                href={item.secondaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)] hover:underline"
              >
                <span>Secondary Link</span>
                <LinkExternalIcon size={12} />
              </a>
            )}
          </div>
          {item.cliCommand && (
            <div className="flex items-center gap-1.5">
              <code className="truncate rounded bg-[var(--bgColor-muted)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fgColor-default)] max-w-sm">
                {item.cliCommand}
              </code>
              <Button
                size="small"
                leadingVisual={
                  copiedId === item.itemId ? CheckCircleIcon : CopyIcon
                }
                onClick={() => handleCopyCommand(item.itemId, item.cliCommand!)}
                aria-label={`Copy CLI command for ${item.resourceName}`}
              >
                {copiedId === item.itemId ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const activeGuidance =
    categoryGroup !== 'all' ? CATEGORY_GUIDANCE[categoryGroup] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Post-Care Action Checklist"
        description={
          <>
            Interactive operator checklist for manual post-migration cutover
            tasks across secrets, GitHub Apps, webhooks, self-hosted runners,
            identities, and governance ({sourceOrg} ➔ {targetOrg}).
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `post-care-items-${runId}.csv`,
                generatePostCareItemsCsv(filteredItems, completedIds),
              )
            }
          >
            Export Post-Care CSV ({filteredItems.length})
          </Button>
        }
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="small"
              onClick={markFilteredDone}
              disabled={filteredItems.length === 0}
            >
              Mark Filtered Done
            </Button>
            {completedCount > 0 && (
              <Button size="small" onClick={resetProgress}>
                Reset Progress
              </Button>
            )}
          </div>
        }
      />

      {/* Executive Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Checklist Progress"
          value={`${completedCount} / ${items.length}`}
          detail={`${progressPercent}% completed in browser`}
          tone={
            completedCount === items.length && items.length > 0
              ? 'success'
              : 'primary'
          }
        />
        <MetricCard
          label="Secrets [SEALED]"
          value={countsByGroup.secrets}
          detail="Write-only empty placeholders"
          tone={countsByGroup.secrets > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="GitHub Apps & Webhooks"
          value={countsByGroup['github-apps'] + countsByGroup.webhooks}
          detail={`${countsByGroup['github-apps']} apps · ${countsByGroup.webhooks} webhooks`}
          tone={
            countsByGroup['github-apps'] + countsByGroup.webhooks > 0
              ? 'warning'
              : 'default'
          }
        />
        <MetricCard
          label="Runners & Identity"
          value={countsByGroup.runners + countsByGroup.identity}
          detail={`${countsByGroup.runners} runners · ${countsByGroup.identity} identity`}
        />
        <MetricCard
          label="Governance & Archived"
          value={countsByGroup.governance}
          detail={`${resultsHydration.postCare.skippedArchivedRows.length} archived repos skipped`}
        />
      </div>

      {/* Progress Bar */}
      {items.length > 0 && (
        <div className="rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--fgColor-default)]">
            <span>
              Post-Care Cutover Completion ({completedCount} of {items.length}{' '}
              items checked)
            </span>
            <span>{progressPercent}%</span>
          </div>
          <ProgressBar
            progress={progressPercent}
            aria-label="Post-care checklist completion progress"
          />
        </div>
      )}

      {/* Category Navigation Tabs */}
      <UnderlineNav aria-label="Post-care checklist categories">
        {(Object.keys(CATEGORY_GROUP_LABELS) as CategoryGroupFilter[]).map(
          (grp) => (
            <UnderlineNav.Item
              key={grp}
              as="button"
              aria-current={categoryGroup === grp ? 'page' : 'false'}
              className="cursor-pointer"
              onSelect={(e) => {
                e.preventDefault();
                setCategoryGroup(grp);
              }}
            >
              {CATEGORY_GROUP_LABELS[grp]} ({countsByGroup[grp]})
            </UnderlineNav.Item>
          ),
        )}
      </UnderlineNav>

      {/* Contextual Guidance Flash */}
      {activeGuidance ? (
        <Flash variant="warning">
          <div className="text-xs space-y-1">
            <div className="font-bold text-[var(--fgColor-default)]">
              {activeGuidance.title}
            </div>
            <div className="text-[var(--fgColor-default)]">
              {activeGuidance.body}
            </div>
          </div>
        </Flash>
      ) : (
        <Flash variant="default">
          <div className="text-xs text-[var(--fgColor-default)]">
            <strong>Zero-Exposure Secret Boundary (DEC-004):</strong> All
            migrated secrets are created as empty <code>[SEALED]</code>{' '}
            placeholders (<code>&quot;&quot;</code>). Webhooks are created{' '}
            <strong>Inactive</strong> until shared secrets are populated. Select
            a category tab above for specialized cutover instructions.
          </div>
        </Flash>
      )}

      {/* Filter Toolbar */}
      <FilterToolbar
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        resultCount={`${filteredItems.length} of ${items.length} action items`}
      >
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Search
          <TextInput
            leadingVisual={SearchIcon}
            type="search"
            aria-label="Search post-care checklist items"
            placeholder="Search resource, repo, command, notes…"
            size="small"
            block
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Priority
          <Select
            aria-label="Filter by priority"
            size="small"
            block
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <Select.Option value="all">All priorities</Select.Option>
            <Select.Option value="high">High priority</Select.Option>
            <Select.Option value="medium">Medium priority</Select.Option>
            <Select.Option value="low">Low priority</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Scope Level
          <Select
            aria-label="Filter by scope level"
            size="small"
            block
            value={scopeLevel}
            onChange={(e) => setScopeLevel(e.target.value)}
          >
            <Select.Option value="all">All scopes</Select.Option>
            <Select.Option value="organization">Organization</Select.Option>
            <Select.Option value="repository">Repository</Select.Option>
            <Select.Option value="environment">Environment</Select.Option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex flex-col gap-1">
          Completion Status
          <Select
            aria-label="Filter by completion status"
            size="small"
            block
            value={completionFilter}
            onChange={(e) => setCompletionFilter(e.target.value)}
          >
            <Select.Option value="all">All items</Select.Option>
            <Select.Option value="pending">Pending only</Select.Option>
            <Select.Option value="completed">Completed only</Select.Option>
          </Select>
        </label>
      </FilterToolbar>

      {/* Virtualized Post-Care Table */}
      <VirtualizedTable
        ariaLabel="Post-care action checklist table"
        rows={filteredItems}
        columns={columns}
        getRowKey={(item) => item.itemId}
        estimateRowHeight={76}
        emptyMessage="No post-care action items match the current filters."
        minWidth={1050}
      />

      {/* Detail Slide-Over Dialog */}
      {selectedItem && (
        <Dialog
          title={`${selectedItem.itemId}: ${selectedItem.resourceName}`}
          subtitle={`Category: ${selectedItem.category} · Scope: ${selectedItem.scopeLevel}`}
          position="right"
          width="large"
          onClose={() => setSelectedItem(null)}
        >
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label
                variant={priorityVariant[selectedItem.priority]}
                className="uppercase"
              >
                {selectedItem.priority} priority
              </Label>
              <Label variant="secondary" className="capitalize">
                {selectedItem.category}
              </Label>
              <Label variant="secondary" className="font-mono">
                {selectedItem.moduleId}
              </Label>
              {selectedItem.category === 'secret' && (
                <Label variant="attention">[SEALED] Placeholder</Label>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="font-semibold text-[var(--fgColor-muted)]">
                  Target Organization
                </dt>
                <dd className="font-mono text-[var(--fgColor-default)]">
                  {selectedItem.targetOrg}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--fgColor-muted)]">
                  Target Repository
                </dt>
                <dd className="font-mono text-[var(--fgColor-default)]">
                  {selectedItem.targetRepo ?? 'Organization-wide'}
                </dd>
              </div>
              {selectedItem.environmentName && (
                <div>
                  <dt className="font-semibold text-[var(--fgColor-muted)]">
                    Environment
                  </dt>
                  <dd className="font-mono text-[var(--fgColor-default)]">
                    {selectedItem.environmentName}
                  </dd>
                </div>
              )}
              {selectedItem.subDomain && (
                <div>
                  <dt className="font-semibold text-[var(--fgColor-muted)]">
                    Sub-Domain
                  </dt>
                  <dd className="font-mono text-[var(--fgColor-default)]">
                    {selectedItem.subDomain}
                  </dd>
                </div>
              )}
            </dl>

            <div className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-3 space-y-2">
              <div className="text-xs font-bold uppercase text-[var(--fgColor-muted)]">
                Action Required
              </div>
              <p className="text-sm text-[var(--fgColor-default)] m-0">
                {selectedItem.actionRequired}
              </p>
              {selectedItem.notes && (
                <p className="text-xs text-[var(--fgColor-muted)] m-0">
                  {selectedItem.notes}
                </p>
              )}
            </div>

            {selectedItem.cliCommand && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-[var(--fgColor-muted)]">
                    CLI Remediation Command
                  </span>
                  <Button
                    size="small"
                    leadingVisual={
                      copiedId === selectedItem.itemId
                        ? CheckCircleIcon
                        : CopyIcon
                    }
                    onClick={() =>
                      handleCopyCommand(
                        selectedItem.itemId,
                        selectedItem.cliCommand!,
                      )
                    }
                  >
                    {copiedId === selectedItem.itemId
                      ? 'Copied'
                      : 'Copy Command'}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-3 font-mono text-xs text-[var(--fgColor-default)] whitespace-pre-wrap break-all">
                  {selectedItem.cliCommand}
                </pre>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {selectedItem.settingsUrl && (
                <a
                  href={selectedItem.settingsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--fgColor-accent)] hover:underline"
                >
                  <span>Open GitHub Settings Page</span>
                  <LinkExternalIcon size={14} />
                </a>
              )}
              {selectedItem.secondaryUrl && (
                <a
                  href={selectedItem.secondaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)] hover:underline"
                >
                  <span>Open Secondary Page</span>
                  <LinkExternalIcon size={14} />
                </a>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
