import React, { useEffect, useMemo, useState } from 'react';
import {
  ActiveFilters,
  FilterToolbar,
  PageHeader,
} from '../components/ui/index.js';
import { Button, Flash, Label, TextInput, UnderlineNav } from '@primer/react';
import { DownloadIcon, SearchIcon } from '@primer/octicons-react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import {
  formatCountMetric,
  formatMinutesMetric,
  formatTimestamp,
  resolveOrgName,
} from '../lib/formatters.js';
import {
  generateActionsAndSecretsCsv,
  downloadCsv,
} from '../lib/export-csv.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Action = Extract<DiscoveryBundle['entities'][number], { kind: 'actions' }>;
type Secret = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'actions-secret' }
>;

export const ActionsAndSecretsTab: React.FC<Props> = ({
  bundle,
  selectedOrgIds,
}) => {
  const [tab, setTab] = useState<'actions' | 'secrets'>('actions');
  useEffect(() => {
    const focus = (event: Event) => {
      const subview = (event as CustomEvent<{ subview?: string }>).detail
        .subview;
      if (subview === 'actions' || subview === 'secrets') setTab(subview);
    };
    window.addEventListener('ghec:focus-entity', focus);
    return () => window.removeEventListener('ghec:focus-entity', focus);
  }, []);
  const [query, setQuery] = useState('');
  const actions = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Action =>
          entity.kind === 'actions' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const secrets = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Secret =>
          entity.kind === 'actions-secret' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const needle = query.trim().toLowerCase();
  const filteredActions = useMemo(
    () =>
      actions.filter(
        (item) =>
          !needle ||
          item.repositoryId.toLowerCase().includes(needle) ||
          item.workflowNames.some((name) =>
            name.toLowerCase().includes(needle),
          ),
      ),
    [actions, needle],
  );
  const filteredSecrets = useMemo(
    () =>
      secrets.filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          item.repositoryId?.toLowerCase().includes(needle),
      ),
    [secrets, needle],
  );
  const actionColumns = useMemo<readonly VirtualizedColumn<Action>[]>(
    () => [
      {
        header: 'Target Repository',
        width: '1.3fr',
        className: 'font-mono text-xs font-bold',
        cell: (item) => item.repositoryId,
      },
      {
        header: 'Organization',
        cell: (item) => (
          <span className="text-xs">
            {resolveOrgName(bundle, item.organizationId)}
          </span>
        ),
      },
      {
        header: 'Workflows',
        width: '0.7fr',
        cell: (item) => (
          <span className="text-xs font-semibold">
            {formatCountMetric(item.workflowCount)}
          </span>
        ),
      },
      {
        header: 'Workflow Names',
        width: '1.5fr',
        cell: (item) => (
          <div className="flex flex-wrap gap-1">
            {item.workflowNames.map((name) => (
              <Label
                key={name}
                size="small"
                variant="secondary"
                className="font-mono"
              >
                {name}
              </Label>
            ))}
          </div>
        ),
      },
      {
        header: 'Runners',
        width: '0.7fr',
        className: 'text-xs font-mono',
        cell: (item) => formatCountMetric(item.runnerCount),
      },
      {
        header: 'Runner Infrastructure',
        width: '1.2fr',
        cell: (item) => (
          <div className="flex flex-wrap gap-1">
            {item.runnerTypes.map((type) => (
              <Label
                key={type}
                size="small"
                variant={type === 'self-hosted' ? 'danger' : 'secondary'}
              >
                {type}
              </Label>
            ))}
          </div>
        ),
      },
      {
        header: 'Usage',
        className: 'text-xs font-mono',
        cell: (item) => formatMinutesMetric(item.usage),
      },
    ],
    [bundle],
  );
  const secretColumns = useMemo<readonly VirtualizedColumn<Secret>[]>(
    () => [
      {
        header: 'Name',
        width: '1.3fr',
        className: 'font-mono text-xs font-bold',
        cell: (item) => item.name,
      },
      {
        header: 'Configuration Kind',
        cell: (item) => (
          <Label
            size="small"
            variant={
              item.configurationKind === 'secret' ? 'attention' : 'accent'
            }
          >
            {item.configurationKind}
          </Label>
        ),
      },
      {
        header: 'Scope Level',
        cell: (item) => (
          <Label size="small" variant="secondary" className="capitalize">
            {item.level}
          </Label>
        ),
      },
      {
        header: 'Target Repository / Scope',
        width: '1.5fr',
        className: 'font-mono text-xs',
        cell: (item) => item.repositoryId ?? 'Organization-wide',
      },
      {
        header: 'Organization',
        cell: (item) => (
          <span className="text-xs">
            {resolveOrgName(bundle, item.organizationId)}
          </span>
        ),
      },
      {
        header: 'Last Updated',
        width: '1.2fr',
        className: 'text-xs',
        cell: (item) => formatTimestamp(item.updatedAt),
      },
    ],
    [bundle],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Actions, Runners & Configuration"
        description="Audit workflow automation, runner environments, and secrets/variables inventories."
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `actions-and-secrets-${bundle.scan.id}.csv`,
                generateActionsAndSecretsCsv(
                  bundle,
                  selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
                ),
              )
            }
          >
            Export Workflows & Secrets (CSV)
          </Button>
        }
      />
      <FilterToolbar>
        <UnderlineNav aria-label="Actions and secrets views">
          <UnderlineNav.Item
            as="button"
            aria-current={tab === 'actions' ? 'page' : 'false'}
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              setTab('actions');
            }}
          >
            Workflows & Runners ({actions.length})
          </UnderlineNav.Item>
          <UnderlineNav.Item
            as="button"
            aria-current={tab === 'secrets' ? 'page' : 'false'}
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              setTab('secrets');
            }}
          >
            Secrets & Variables ({secrets.length})
          </UnderlineNav.Item>
        </UnderlineNav>
        <TextInput
          leadingVisual={SearchIcon}
          type="search"
          aria-label={`Search ${tab}`}
          placeholder={`Search ${tab}…`}
          size="small"
          className="w-full sm:w-72"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </FilterToolbar>
      <ActiveFilters
        filters={
          query
            ? [
                {
                  id: 'query',
                  label: `Search: ${query}`,
                  onRemove: () => setQuery(''),
                },
              ]
            : []
        }
      />
      {tab === 'actions' ? (
        <VirtualizedTable
          ariaLabel="Actions workflows table"
          rows={filteredActions}
          columns={actionColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No actions entities found matching criteria."
          estimateRowHeight={68}
          minWidth={1000}
        />
      ) : (
        <div className="space-y-4">
          <Flash variant="default">
            <span className="text-xs">
              <strong>Zero Secret Values Stored:</strong> Only names, scopes,
              and timestamps are displayed.
            </span>
          </Flash>
          <VirtualizedTable
            ariaLabel="Secrets and variables inventory table"
            rows={filteredSecrets}
            columns={secretColumns}
            getRowKey={(row) => row.id}
            emptyMessage="No configuration items found matching criteria."
            minWidth={900}
          />
        </div>
      )}
    </div>
  );
};
