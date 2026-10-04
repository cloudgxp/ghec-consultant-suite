import { useEffect, useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  Button,
  Flash,
  Label,
  ProgressBar,
  TextInput,
  UnderlineNav,
} from '@primer/react';
import { DownloadIcon, SearchIcon } from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import {
  FilterToolbar,
  MetricCard,
  PageHeader,
  SurfaceCard,
} from '../components/ui/index.js';
import {
  environmentPolicyInventory,
  operationsInventory,
  runnersInventory,
  workflowInventory,
  type EnvironmentPolicyRecord,
  type RunnerRecord,
  type WorkflowRecord,
} from '../lib/action-operations.js';
import {
  downloadCsv,
  generateActionsOperationsCsv,
} from '../lib/export-csv.js';
import { resolveOrgName } from '../lib/formatters.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type View = 'overview' | 'workflows' | 'runners' | 'policies';

function DistributionChart({
  title,
  values,
  selected,
  onSelect,
}: {
  title: string;
  values: readonly { label: string; value: number }[];
  selected: string;
  onSelect: (label: string) => void;
}) {
  const max = Math.max(1, ...values.map((item) => item.value));
  return (
    <SurfaceCard className="p-5">
      <h3 className="font-bold text-[var(--fgColor-default)]">{title}</h3>
      <div
        className="mt-4 space-y-3"
        role="group"
        aria-label={`${title}: ${values.map((item) => `${item.label} ${item.value}`).join(', ')}`}
      >
        {values.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`grid w-full grid-cols-[7rem_1fr_3rem] items-center gap-2 rounded p-1 text-left text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-outlineColor)] ${selected === item.label ? 'bg-[var(--bgColor-accent-muted)]/30' : ''}`}
            onClick={() =>
              onSelect(selected === item.label ? 'all' : item.label)
            }
          >
            <span className="capitalize text-[var(--fgColor-default)]">
              {item.label}
            </span>
            <ProgressBar
              progress={(item.value / max) * 100}
              aria-label={`${item.label}: ${item.value}`}
            />
            <strong className="text-right text-[var(--fgColor-default)]">
              {item.value}
            </strong>
          </button>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title} tabular equivalent</caption>
        <tbody>
          {values.map((item) => (
            <tr key={item.label}>
              <th>{item.label}</th>
              <td>{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SurfaceCard>
  );
}

export function ActionsTab({ bundle, selectedOrgIds }: Props) {
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [workflowState, setWorkflowState] = useState('all');
  const [runnerType, setRunnerType] = useState('all');
  useEffect(() => {
    const focus = (event: Event) => {
      const subview = (event as CustomEvent<{ subview?: string }>).detail
        .subview;
      if (
        subview === 'workflows' ||
        subview === 'runners' ||
        subview === 'policies'
      )
        setView(subview);
    };
    window.addEventListener('ghec:focus-entity', focus);
    return () => window.removeEventListener('ghec:focus-entity', focus);
  }, []);
  const inScope = (organizationId: string) =>
    selectedOrgIds.length === 0 || selectedOrgIds.includes(organizationId);
  const workflows = useMemo(
    () =>
      workflowInventory(bundle).filter((item) => inScope(item.organizationId)),
    [bundle, selectedOrgIds],
  );
  const runners = useMemo(
    () =>
      runnersInventory(bundle).filter((item) => inScope(item.organizationId)),
    [bundle, selectedOrgIds],
  );
  const operations = useMemo(
    () =>
      operationsInventory(bundle).filter((item) =>
        inScope(item.organizationId),
      ),
    [bundle, selectedOrgIds],
  );
  const policies = useMemo(
    () =>
      environmentPolicyInventory(bundle).filter((item) =>
        inScope(item.organizationId),
      ),
    [bundle, selectedOrgIds],
  );
  const summaries = bundle.entities.filter(
    (
      entity,
    ): entity is Extract<
      DiscoveryBundle['entities'][number],
      { kind: 'action-run-summary' }
    > => entity.kind === 'action-run-summary' && inScope(entity.organizationId),
  );
  const filteredWorkflows = workflows.filter(
    (item) =>
      (!query ||
        `${item.name} ${item.repositoryId}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (workflowState === 'all' || item.state === workflowState),
  );
  const filteredRunners = runners.filter((item) => {
    const name = item.name.toLowerCase();
    const matchesQuery = !query || name.includes(query.toLowerCase());
    return (
      matchesQuery &&
      (runnerType === 'all' ||
        (item.kind === 'action-runner' && item.runnerType === runnerType))
    );
  });
  const workflowDistribution = ['active', 'disabled', 'unknown'].map(
    (label) => ({
      label,
      value: workflows.filter((item) => item.state === label).length,
    }),
  );
  const runnerDistribution = ['hosted', 'self-hosted', 'unknown'].map(
    (label) => ({
      label,
      value: runners.filter(
        (item) => item.kind === 'action-runner' && item.runnerType === label,
      ).length,
    }),
  );
  const workflowColumns: readonly VirtualizedColumn<WorkflowRecord>[] = [
    {
      header: 'Workflow',
      width: '1.4fr',
      cell: (item) => (
        <div>
          <strong className="text-[var(--fgColor-default)]">{item.name}</strong>
          {item.compatibility === 'v1-summary' && (
            <Label variant="attention" size="small" className="ml-2">
              v1 summary
            </Label>
          )}
        </div>
      ),
    },
    { header: 'Repository', width: '1.3fr', cell: (item) => item.repositoryId },
    {
      header: 'Organization',
      cell: (item) => resolveOrgName(bundle, item.organizationId),
    },
    {
      header: 'State',
      cell: (item) => (
        <Label variant="secondary" size="small" className="capitalize">
          {item.state}
        </Label>
      ),
    },
    { header: 'Runs', cell: (item) => item.runCount ?? 'Unknown' },
    {
      header: 'Last activity',
      cell: (item) =>
        item.lastActivityAt ? (
          new Date(item.lastActivityAt).toLocaleDateString()
        ) : (
          <span className="text-[var(--fgColor-attention)]">Unknown</span>
        ),
    },
    {
      header: 'Reusable',
      cell: (item) =>
        item.reusable === null ? 'Unknown' : item.reusable ? 'Yes' : 'No',
    },
  ];
  const runnerColumns: readonly VirtualizedColumn<RunnerRecord>[] = [
    {
      header: 'Runner / Group',
      width: '1.4fr',
      cell: (item) => (
        <strong className="text-[var(--fgColor-default)]">{item.name}</strong>
      ),
    },
    {
      header: 'Kind',
      cell: (item) =>
        item.kind === 'action-runner' ? 'Runner' : 'Runner group',
    },
    {
      header: 'Type / Scope',
      cell: (item) =>
        item.kind === 'action-runner' ? item.runnerType : item.scope,
    },
    {
      header: 'OS / Visibility',
      cell: (item) =>
        item.kind === 'action-runner'
          ? (item.operatingSystem ?? 'Unknown')
          : item.visibility,
    },
    {
      header: 'Labels / Count',
      width: '1.4fr',
      cell: (item) =>
        item.kind === 'action-runner'
          ? item.labels.join(', ') || 'None reported'
          : (item.runnerCount.value ?? 'Unknown'),
    },
    {
      header: 'Operational state',
      cell: (item) =>
        item.kind === 'action-runner'
          ? `${item.status}${item.busy === true ? ', busy' : ''}`
          : `${item.repositoryCount.value ?? 'Unknown'} repositories`,
    },
    {
      header: 'Risk signal',
      cell: (item) =>
        item.kind === 'action-runner' &&
        (item.runnerType === 'self-hosted' || item.customImage) ? (
          <Label variant="attention" size="small">
            Review
          </Label>
        ) : (
          '—'
        ),
    },
  ];
  const policyColumns: readonly VirtualizedColumn<EnvironmentPolicyRecord>[] = [
    {
      header: 'Type',
      cell: (item) =>
        item.kind === 'action-environment' ? 'Environment' : 'Actions policy',
    },
    {
      header: 'Target',
      width: '1.4fr',
      cell: (item) =>
        item.kind === 'action-environment'
          ? item.name
          : (item.repositoryId ?? 'Organization'),
    },
    {
      header: 'Repository',
      width: '1.3fr',
      cell: (item) => item.repositoryId ?? 'Organization-wide',
    },
    {
      header: 'Protection / Allowed',
      cell: (item) =>
        item.kind === 'action-environment'
          ? `${item.protectionRuleCount.value ?? 'Unknown'} rules`
          : item.allowedActions,
    },
    {
      header: 'Reviewers / Token',
      cell: (item) =>
        item.kind === 'action-environment'
          ? `${item.reviewerCount.value ?? 'Unknown'} reviewers`
          : item.defaultTokenPermission,
    },
    {
      header: 'Deployment / Fork policy',
      cell: (item) =>
        item.kind === 'action-environment'
          ? item.deploymentBranchPolicy
          : item.forkPolicy,
    },
  ];
  const observedWindows = summaries.map(
    (item) =>
      `${new Date(item.windowStartedAt).toLocaleDateString()}–${new Date(item.windowEndedAt).toLocaleDateString()}${item.truncated ? ' (truncated)' : ''}`,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actions"
        description="Automation, activity, runners, caches, artifacts, environments, and policy metadata. Workflow source, logs, artifact contents, tokens, and secret values are never collected."
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `actions-${bundle.scan.id}.csv`,
                generateActionsOperationsCsv(bundle),
              )
            }
          >
            Export metadata CSV
          </Button>
        }
      />
      <FilterToolbar className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <UnderlineNav aria-label="Actions views">
          {(['overview', 'workflows', 'runners', 'policies'] as const).map(
            (item) => (
              <UnderlineNav.Item
                key={item}
                as="button"
                aria-current={view === item ? 'page' : 'false'}
                className="capitalize cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  setView(item);
                }}
              >
                {item === 'policies' ? 'Environments & Policies' : item}
              </UnderlineNav.Item>
            ),
          )}
        </UnderlineNav>
        <label className="text-xs font-semibold text-[var(--fgColor-default)] flex items-center gap-2 lg:ml-auto">
          <span>Search inventory</span>
          <TextInput
            leadingVisual={SearchIcon}
            aria-label="Search current inventory"
            placeholder="Search current inventory…"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </FilterToolbar>
      {view === 'overview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard label="Workflows" value={workflows.length} />
            <MetricCard
              label="Runs observed"
              value={
                summaries.reduce(
                  (sum, item) => sum + (item.total.value ?? 0),
                  0,
                ) || 'Unknown'
              }
            />
            <MetricCard
              label="Usage minutes"
              value={
                summaries.reduce(
                  (sum, item) => sum + (item.usage.value ?? 0),
                  0,
                ) || 'Unknown'
              }
            />
            <MetricCard
              label="Runners"
              value={
                runners.filter((item) => item.kind === 'action-runner')
                  .length || 'Unknown'
              }
            />
            <MetricCard
              label="Caches"
              value={
                operations.filter((item) => item.kind === 'action-cache')
                  .length || 'Unknown'
              }
            />
            <MetricCard
              label="Artifacts"
              value={
                operations.filter((item) => item.kind === 'action-artifact')
                  .length || 'Unknown'
              }
            />
          </div>
          <Flash variant="default" className="text-sm">
            Observation window:{' '}
            {observedWindows.length
              ? observedWindows.join('; ')
              : 'Not collected. Run outcomes and usage cannot be inferred from workflow metadata.'}
          </Flash>
          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionChart
              title="Workflow state"
              values={workflowDistribution}
              selected={workflowState}
              onSelect={(value) => {
                setWorkflowState(value);
                setView('workflows');
              }}
            />
            <DistributionChart
              title="Runner mix"
              values={runnerDistribution}
              selected={runnerType}
              onSelect={(value) => {
                setRunnerType(value);
                setView('runners');
              }}
            />
          </div>
        </>
      )}
      {view === 'workflows' && (
        <VirtualizedTable
          ariaLabel="Actions workflows and runs"
          rows={filteredWorkflows}
          columns={workflowColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No workflows match the active filters."
          minWidth={1050}
        />
      )}
      {view === 'runners' && (
        <VirtualizedTable
          ariaLabel="Actions runners and images"
          rows={filteredRunners}
          columns={runnerColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No runner metadata was collected or matches the active filters."
          minWidth={1050}
        />
      )}
      {view === 'policies' && (
        <VirtualizedTable
          ariaLabel="Actions environments and policies"
          rows={policies}
          columns={policyColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No environment or Actions policy metadata was collected."
          minWidth={1050}
        />
      )}
    </div>
  );
}
