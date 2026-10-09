import React, { useEffect, useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, Dialog, Flash, Label } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  HistoryIcon,
  PlayIcon,
  RocketIcon,
  StopIcon,
  SyncIcon,
} from '@primer/octicons-react';
import { LinearPipelineTimeline } from '../components/LinearPipelineTimeline.js';
import { JobMatrixGrid } from '../components/JobMatrixGrid.js';
import {
  StepSummaryViewer,
  type UnpackedArtifactsData,
} from '../components/StepSummaryViewer.js';
import {
  type PipelineStageInfo,
  type MatrixCohortJob,
} from '../lib/execution-console.js';
import { PageHeader } from '../components/ui/index.js';
import { resolveOrgName } from '../lib/formatters.js';

export interface WorkflowRunRecord {
  id: number;
  runNumber: number;
  workflowId: string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | null;
  actor: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl?: string;
  topology?: 'linear' | 'matrix';
  stages?: PipelineStageInfo[];
  cohorts?: MatrixCohortJob[];
}

export interface LiveConsoleTabProps {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
  apiBaseUrl?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

const SAMPLE_ACTIVE_RUN: WorkflowRunRecord = {
  id: 12849102,
  runNumber: 42,
  workflowId: 'migration-execute-wave.yml',
  name: 'Migration Wave Execution: Phoenix Wave 1',
  status: 'in_progress',
  conclusion: null,
  actor: 'ghec-operator',
  headSha: 'a7c9f82d',
  createdAt: '2026-10-06T08:45:00.000Z',
  updatedAt: '2026-10-06T08:47:25.000Z',
  topology: 'matrix',
  cohorts: [
    {
      id: 'cohort-1',
      name: 'Cohort 1: Core Services',
      status: 'completed',
      repositoryCount: 4,
      currentStep: 'verify',
      elapsedSeconds: 62,
      progressPercent: 100,
      operations: { created: 12, updated: 4, noop: 38, failed: 0 },
    },
    {
      id: 'cohort-2',
      name: 'Cohort 2: Supporting APIs',
      status: 'in_progress',
      repositoryCount: 5,
      currentStep: 'rulesets-and-protection',
      elapsedSeconds: 48,
      progressPercent: 65,
      operations: { created: 8, updated: 2, noop: 14, failed: 0 },
    },
    {
      id: 'cohort-3',
      name: 'Cohort 3: Tooling & Documentation',
      status: 'in_progress',
      repositoryCount: 6,
      currentStep: 'gei-repo-migration',
      elapsedSeconds: 24,
      progressPercent: 30,
      operations: { created: 2, updated: 0, noop: 5, failed: 0 },
    },
  ],
  stages: [
    {
      id: 'preflight',
      name: '1. Preflight Validation',
      status: 'completed',
      durationSeconds: 12,
      summary: 'Source & target preflight checks passed with 0 blockers.',
    },
    {
      id: 'plan',
      name: '2. Migration Planning',
      status: 'completed',
      durationSeconds: 8,
      summary: 'Target boundary and dependency graph computed.',
    },
    {
      id: 'gei-repo',
      name: '3. GEI Repositories',
      status: 'in_progress',
      durationSeconds: 45,
      summary: 'GEI git repository streaming in progress.',
    },
    {
      id: 'releases-lfs',
      name: '4. Releases & Git LFS',
      status: 'pending',
    },
    {
      id: 'rulesets-keys',
      name: '5. Rulesets & Deploy Keys',
      status: 'pending',
    },
    {
      id: 'teams-collaborators',
      name: '6. Teams & Collaborators',
      status: 'pending',
    },
    {
      id: 'verify',
      name: '7. Post-Migration Verification',
      status: 'pending',
    },
  ],
};

const SAMPLE_HISTORY_RUNS: WorkflowRunRecord[] = [
  SAMPLE_ACTIVE_RUN,
  {
    id: 12848900,
    runNumber: 41,
    workflowId: 'migration-execute-wave.yml',
    name: 'Migration Wave Execution: Dry-Run Rehearsal',
    status: 'completed',
    conclusion: 'success',
    actor: 'ghec-operator',
    headSha: '8df1b23',
    createdAt: '2026-10-06T07:45:00.000Z',
    updatedAt: '2026-10-06T07:50:00.000Z',
    topology: 'linear',
  },
  {
    id: 12847210,
    runNumber: 40,
    workflowId: 'migration-execute-wave.yml',
    name: 'Migration Wave Execution: Canary Wave',
    status: 'completed',
    conclusion: 'failure',
    actor: 'ghec-operator',
    headSha: '419cb7e',
    createdAt: '2026-10-06T06:45:00.000Z',
    updatedAt: '2026-10-06T06:50:00.000Z',
    topology: 'matrix',
  },
];

const SAMPLE_STEP_SUMMARY_MD = `## 🚀 Migration Execution Summary

### Overview
| Metric | Value |
| :--- | :--- |
| **Run ID** | \`12849102\` |
| **Overall Status** | 🟢 **Complete** |
| **Mode** | 🧪 Dry-Run (Simulation) |
| **Source Organization** | \`source-org\` |
| **Target Organization** | \`target-org\` |
| **Duration** | 145.00s |
| **Started At** | \`2026-10-06T08:45:00.000Z\` |
| **Completed At** | \`2026-10-06T08:47:25.000Z\` |

### 🔍 Stage 1: Preflight Assessment
| Total Repositories | Ready | Ready w/ Follow-up | Requires Strategy | Blocked | Ruleset Bypass |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **15** | 🟢 12 | 🟡 2 | 🟠 1 | 🔴 0 | ✅ Exempt |

### 📦 Stage 2–4: Core Transfers & Fallback Strategies
| Stage / Strategy | Total Repos | Succeeded | Failed | Key Metrics |
| :--- | :---: | :---: | :---: | :--- |
| **GEI Repository Transfer** | 15 | 15 | 0 | Standard GEI |
| **Git LFS Mirroring** | 2 | 2 | 0 | 48 objects (312.45 MiB) |
| **Large Releases Fallback** | 1 | 1 | 0 | 4 assets streamed (1.20 GiB) |

### ⚙️ Stage 5: Configuration Rehydration
| Component | Planned | Succeeded | Failed | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Repository Variables** | 24 | 24 | 0 | ✅ Complete |
| **Repository Secrets (DEC-004)** | 18 | 18 | 0 | ✅ Complete |
| **Deployment Environments** | 6 | 6 | 0 | ✅ Complete |
| **Repository Rulesets** | 5 | 5 | 0 | ✅ Complete |
| **Branch Protection Rules** | 2 | 2 | 0 | ✅ Complete |
| **Teams & Permissions** | 8 | 8 | 0 | ✅ Complete |

### 👥 Stage 6: Post-Migration Reconciliations
| Metric | Count |
| :--- | :---: |
| Total Mannequins Discovered | 14 |
| Reclaimed / Attributed | 🟢 14 |
| Unmapped Contributors | 0 |

### 🛡️ Stage 7: Target State Verification
✅ **Verification Passed:** Target enterprise configuration strictly matches planned specification with 0 discrepancies.
`;

const SAMPLE_UNPACKED_ARTIFACTS: UnpackedArtifactsData = {
  plan: {
    schemaVersion: '1.0.0',
    waveName: 'Phoenix Wave 1',
    repositoriesCount: 15,
    modules: {
      'repo-variables': { planned: 24 },
      'repo-secrets': { planned: 18 },
      teams: { planned: 8 },
    },
  },
  verification: {
    verified: true,
    totalDiscrepancies: 0,
    discrepancies: [],
  },
  preflight: {
    totalRepositories: 15,
    ready: 12,
    readyWithFollowUp: 2,
    requiresSpecialStrategy: 1,
    blocked: 0,
    rulesetBypassExempt: true,
  },
  cohorts: [
    {
      id: 'cohort-1',
      name: 'Cohort 1: Core Services',
      modules: {
        'gei-repo': { creates: 4, updates: 0, noops: 0, skips: 0, failures: 0 },
        'repo-variables': {
          creates: 8,
          updates: 2,
          noops: 4,
          skips: 0,
          failures: 0,
        },
        'repo-secrets': {
          creates: 6,
          updates: 0,
          noops: 0,
          skips: 0,
          failures: 0,
        },
      },
    },
    {
      id: 'cohort-2',
      name: 'Cohort 2: Supporting APIs',
      modules: {
        'gei-repo': { creates: 5, updates: 0, noops: 0, skips: 0, failures: 0 },
        rulesets: { creates: 3, updates: 1, noops: 2, skips: 0, failures: 0 },
        environments: {
          creates: 4,
          updates: 0,
          noops: 1,
          skips: 0,
          failures: 0,
        },
      },
    },
    {
      id: 'cohort-3',
      name: 'Cohort 3: Tooling & Documentation',
      modules: {
        'gei-repo': { creates: 6, updates: 0, noops: 0, skips: 0, failures: 0 },
        lfs: { creates: 2, updates: 0, noops: 0, skips: 0, failures: 0 },
        releases: { creates: 1, updates: 0, noops: 0, skips: 0, failures: 0 },
      },
    },
  ],
};

export const LiveConsoleTab: React.FC<LiveConsoleTabProps> = ({
  bundle,
  selectedOrgIds,
  apiBaseUrl = '',
  fetchFn = fetch,
}) => {
  const sourceOrg = selectedOrgIds[0]
    ? resolveOrgName(bundle, selectedOrgIds[0])
    : bundle.organizations[0]?.login || 'source-org';

  const [activeRun, setActiveRun] =
    useState<WorkflowRunRecord>(SAMPLE_ACTIVE_RUN);
  const [historyRuns] = useState<WorkflowRunRecord[]>(SAMPLE_HISTORY_RUNS);

  const [consoleSection, setConsoleSection] = useState<'topology' | 'summary'>(
    'topology',
  );
  const [viewTopology, setViewTopology] = useState<
    'auto' | 'linear' | 'matrix'
  >('auto');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(
    null,
  );
  const [etagCache, setEtagCache] = useState<string | null>(null);

  // Auto-detect topology
  const effectiveTopology = useMemo(() => {
    if (viewTopology !== 'auto') return viewTopology;
    if (activeRun.cohorts && activeRun.cohorts.length > 0) return 'matrix';
    return activeRun.topology || 'matrix';
  }, [viewTopology, activeRun]);

  // Compute elapsed time string
  const elapsedTime = useMemo(() => {
    const start = new Date(activeRun.createdAt).getTime();
    const end = new Date(activeRun.updatedAt).getTime();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins}m ${secs}s`;
  }, [activeRun.createdAt, activeRun.updatedAt]);

  // SSE & Adaptive Polling with Visibility Pause
  useEffect(() => {
    let sse: EventSource | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    const setupSSE = () => {
      try {
        sse = new EventSource(`${apiBaseUrl}/api/events`);
        sse.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(event.data);
            if (data && data.run) {
              setActiveRun((prev) => ({
                ...prev,
                ...data.run,
              }));
            }
          } catch {
            // non-json keepalive
          }
        };
        sse.onerror = () => {
          if (sse) {
            sse.close();
            sse = null;
          }
        };
      } catch {
        // SSE not supported or blocked
      }
    };

    const pollRun = async () => {
      if (document.visibilityState === 'hidden') return;
      if (!activeRun.id) return;

      try {
        const headers: Record<string, string> = {};
        if (etagCache) headers['If-None-Match'] = etagCache;

        const res = await fetchFn(
          `${apiBaseUrl}/api/actions/runs/${activeRun.id}?owner=${encodeURIComponent(sourceOrg)}&repo=ghec-consultant-suite`,
          { headers },
        );

        if (res.status === 304) return;
        if (!res.ok) return;

        const newEtag = res.headers.get('etag');
        if (newEtag) setEtagCache(newEtag);

        const data = await res.json();
        if (data && isSubscribed) {
          setActiveRun((prev) => ({
            ...prev,
            status: data.status ?? prev.status,
            conclusion: data.conclusion ?? prev.conclusion,
            updatedAt: data.updated_at ?? prev.updatedAt,
          }));
        }
      } catch {
        // network error handled gracefully
      }
    };

    setupSSE();
    pollTimer = setInterval(pollRun, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pollRun();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isSubscribed = false;
      if (sse) sse.close();
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [apiBaseUrl, activeRun.id, sourceOrg, etagCache, fetchFn]);

  // Cancel Handler
  const handleCancelRun = async () => {
    setIsCancelling(true);
    try {
      const res = await fetchFn(
        `${apiBaseUrl}/api/actions/runs/${activeRun.id}/cancel?owner=${encodeURIComponent(sourceOrg)}&repo=ghec-consultant-suite`,
        { method: 'POST' },
      );
      if (!res.ok && res.status !== 200 && res.status !== 202) {
        const text = await res.text();
        throw new Error(text || `Failed with status ${res.status}`);
      }

      setActiveRun((prev) => ({
        ...prev,
        status: 'completed',
        conclusion: 'cancelled',
      }));
      setStatusNotification(
        `Workflow run #${activeRun.runNumber} cancellation requested.`,
      );
      setShowCancelModal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusNotification(`Cancellation failed: ${msg}`);
    } finally {
      setIsCancelling(false);
    }
  };

  // Resumption Handler (--resume latest)
  const handleResumeWave = async () => {
    setIsResuming(true);
    setStatusNotification(null);
    try {
      const res = await fetchFn(
        `${apiBaseUrl}/api/actions/workflows/${encodeURIComponent('migration-resume.yml')}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: sourceOrg,
            repo: 'ghec-consultant-suite',
            ref: 'main',
            inputs: {
              resume_ref: 'latest',
              runner_labels: 'ubuntu-latest',
            },
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          text || `Resume dispatch failed with status ${res.status}`,
        );
      }

      setStatusNotification(
        'Successfully dispatched resumption wave via migration-resume.yml (--resume latest). Cohorts will pick up from the latest recorded checkpoint.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusNotification(`Resumption failed: ${msg}`);
    } finally {
      setIsResuming(false);
    }
  };

  // Status Styling
  const getGlobalStatusBadge = () => {
    if (activeRun.status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--bgColor-accent-muted)] text-[var(--fgColor-accent)] border border-[var(--borderColor-accent-emphasis)]">
          <SyncIcon size={12} className="animate-spin" /> In Progress
        </span>
      );
    }
    if (activeRun.status === 'queued') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] border border-[var(--borderColor-default)]">
          <ClockIcon size={12} /> Queued
        </span>
      );
    }
    if (activeRun.conclusion === 'success') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--bgColor-success-muted)] text-[var(--fgColor-success)] border border-[var(--borderColor-success-emphasis)]">
          <CheckCircleIcon size={12} /> Succeeded
        </span>
      );
    }
    if (activeRun.conclusion === 'failure') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--bgColor-danger-muted)] text-[var(--fgColor-danger)] border border-[var(--borderColor-danger-emphasis)]">
          <AlertIcon size={12} /> Failed
        </span>
      );
    }
    if (activeRun.conclusion === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--canvas-subtle)] text-[var(--fgColor-muted)] border border-[var(--borderColor-default)]">
          <StopIcon size={12} /> Cancelled
        </span>
      );
    }
    return <Label size="small">{activeRun.status}</Label>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Execution Console"
        description="Real-time operational command cockpit for live GitHub Actions migration waves and resumption workflows."
        status={getGlobalStatusBadge()}
        primaryAction={
          activeRun.status === 'in_progress' ? (
            <Button
              variant="danger"
              size="small"
              leadingVisual={StopIcon}
              onClick={() => setShowCancelModal(true)}
            >
              Cancel Run
            </Button>
          ) : activeRun.conclusion === 'failure' ||
            activeRun.conclusion === 'cancelled' ? (
            <Button
              variant="primary"
              size="small"
              leadingVisual={RocketIcon}
              onClick={handleResumeWave}
              disabled={isResuming}
            >
              {isResuming
                ? 'Dispatching Resumption...'
                : 'Resume Migration Wave'}
            </Button>
          ) : (
            <Button
              variant="default"
              size="small"
              leadingVisual={SyncIcon}
              onClick={handleResumeWave}
              disabled={isResuming}
            >
              Dispatch Resumption (--resume latest)
            </Button>
          )
        }
      />

      {statusNotification && (
        <Flash
          variant={statusNotification.includes('failed') ? 'danger' : 'success'}
        >
          <div className="flex items-center justify-between text-xs">
            <span>{statusNotification}</span>
            <Button size="small" onClick={() => setStatusNotification(null)}>
              Dismiss
            </Button>
          </div>
        </Flash>
      )}

      {/* Global Run Details Card */}
      <div className="p-4 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
        <div>
          <span className="text-[var(--fgColor-muted)] block mb-0.5">
            Run Number
          </span>
          <span className="font-bold text-sm text-[var(--fgColor-default)] font-mono">
            #{activeRun.runNumber}
          </span>
        </div>
        <div>
          <span className="text-[var(--fgColor-muted)] block mb-0.5">
            Run ID
          </span>
          <span className="font-mono text-[var(--fgColor-default)]">
            {activeRun.id}
          </span>
        </div>
        <div>
          <span className="text-[var(--fgColor-muted)] block mb-0.5">
            Triggered By
          </span>
          <span className="font-medium text-[var(--fgColor-default)]">
            @{activeRun.actor}
          </span>
        </div>
        <div>
          <span className="text-[var(--fgColor-muted)] block mb-0.5">
            Elapsed Time
          </span>
          <span className="font-mono font-medium text-[var(--fgColor-default)] flex items-center gap-1">
            <ClockIcon size={12} /> {elapsedTime}
          </span>
        </div>
        <div>
          <span className="text-[var(--fgColor-muted)] block mb-0.5">
            Commit SHA
          </span>
          <span className="font-mono text-[var(--fgColor-accent)]">
            {activeRun.headSha}
          </span>
        </div>
        <div>
          <span className="text-[var(--fgColor-muted)] block mb-0.5">
            Topology
          </span>
          <span className="capitalize font-semibold text-[var(--fgColor-default)]">
            {effectiveTopology} (
            {viewTopology === 'auto' ? 'Auto-detected' : 'Manual'})
          </span>
        </div>
      </div>

      <Flash variant="warning" className="mb-4">
        <div className="flex flex-col gap-1 text-sm">
          <strong>Migration Warnings & Limitations</strong>
          <ul className="list-disc pl-4 mt-1 text-[var(--fgColor-muted)]">
            <li>
              <strong>Sub-issues:</strong> Sub-issue relationships and
              hierarchies are NOT migrated by GEI. They will be converted to
              standard issues or drop their parent linking.
            </li>
            <li>
              <strong>Packages:</strong> GitHub Packages (npm, docker, maven,
              rubygems, nuget) cannot be migrated automatically using GEI. They
              must be migrated manually.
            </li>
            <li>
              <strong>Dependabot & Code Scanning:</strong> Open alerts and their
              historical statuses do not migrate. The tools must re-run on the
              target to regenerate alerts.
            </li>
            <li>
              <strong>Code Search:</strong> Code search indexing may be delayed
              for up to 48 hours post-migration for large mono-repos.
            </li>
            <li>
              <strong>LFS Push:</strong> You may need to manually run{' '}
              <code className="text-xs">git lfs push --all</code> post-migration
              if LFS assets exceed GEI timeouts.
            </li>
            <li>
              <strong>Repository Size:</strong> Repositories exceeding 400MB may
              experience significant delays or require split migration waves.
            </li>
            <li>
              <strong>Invitations & Access:</strong> Pending invitations, team
              memberships, and granular user repo access are not migrated.
            </li>
            <li>
              <strong>Metadata:</strong> Repository discussions, fork parent
              relationships, tag protection rules, webhook states, PR settings,
              stars, and watchers are unsupported by GEI and must be manually
              recreated.
            </li>
          </ul>
        </div>
      </Flash>

      <Flash variant="default">
        <div className="flex flex-col gap-1 text-sm">
          <strong>Mannequin Reclamation Planning</strong>
          <span className="text-[var(--fgColor-muted)]">
            Post-migration, GEI generates placeholder mannequins for unmapped
            contributors. If migrating to{' '}
            <strong>Enterprise Managed Users (EMU)</strong>, you can instantly
            reclaim these mannequins without sending email invitations by using
            the CLI:
            <br />
            <code className="text-xs px-1.5 py-0.5 bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] rounded mt-1 inline-block">
              gh gei reclaim-mannequin --skip-invitation
            </code>
          </span>
        </div>
      </Flash>

      {/* Checkpoint Resumption Alert Banner (When Failed/Cancelled) */}
      {(activeRun.conclusion === 'failure' ||
        activeRun.conclusion === 'cancelled') && (
        <div className="p-4 rounded-lg border border-[var(--borderColor-attention-emphasis)] bg-[var(--canvas-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="pt-0.5 text-[var(--fgColor-attention)]">
              <AlertIcon size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--fgColor-default)]">
                Interrupted Migration Execution
              </h4>
              <p className="text-xs text-[var(--fgColor-muted)] mt-0.5">
                The previous run halted. Checkpointed state manifests are stored
                in GitHub Actions artifacts. You can resume safely with{' '}
                <code>--resume latest</code>.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="small"
            leadingVisual={PlayIcon}
            onClick={handleResumeWave}
            disabled={isResuming}
            className="shrink-0"
          >
            {isResuming ? 'Dispatching...' : 'Resume Migration Wave'}
          </Button>
        </div>
      )}

      {/* Console Section Switcher */}
      <div className="flex border-b border-[var(--borderColor-default)] gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => setConsoleSection('topology')}
          className={`pb-2.5 transition-colors border-b-2 ${
            consoleSection === 'topology'
              ? 'border-[var(--borderColor-accent-emphasis)] text-[var(--fgColor-accent)] font-semibold'
              : 'border-transparent text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
          }`}
        >
          Live Pipeline & Matrix Topology
        </button>
        <button
          type="button"
          onClick={() => setConsoleSection('summary')}
          className={`pb-2.5 transition-colors border-b-2 ${
            consoleSection === 'summary'
              ? 'border-[var(--borderColor-accent-emphasis)] text-[var(--fgColor-accent)] font-semibold'
              : 'border-transparent text-[var(--fgColor-muted)] hover:text-[var(--fgColor-default)]'
          }`}
        >
          Step Summary & Artifact Explorer
        </button>
      </div>

      {consoleSection === 'topology' ? (
        <>
          {/* View Options & Topology Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-md bg-[var(--canvas-default)] border border-[var(--borderColor-default)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--fgColor-muted)]">
                View Topology:
              </span>
              <div className="inline-flex rounded-md shadow-xs" role="group">
                <button
                  type="button"
                  onClick={() => setViewTopology('auto')}
                  className={`px-3 py-1 text-xs font-medium rounded-l-md border transition-colors ${
                    viewTopology === 'auto'
                      ? 'bg-[var(--canvas-subtle)] text-[var(--fgColor-default)] border-[var(--borderColor-default)] font-bold'
                      : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] border-[var(--borderColor-default)] hover:bg-[var(--canvas-subtle)]'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setViewTopology('matrix')}
                  className={`px-3 py-1 text-xs font-medium border-t border-b border-r transition-colors ${
                    viewTopology === 'matrix'
                      ? 'bg-[var(--canvas-subtle)] text-[var(--fgColor-default)] border-[var(--borderColor-default)] font-bold'
                      : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] border-[var(--borderColor-default)] hover:bg-[var(--canvas-subtle)]'
                  }`}
                >
                  Parallel Matrix
                </button>
                <button
                  type="button"
                  onClick={() => setViewTopology('linear')}
                  className={`px-3 py-1 text-xs font-medium rounded-r-md border-t border-b border-r transition-colors ${
                    viewTopology === 'linear'
                      ? 'bg-[var(--canvas-subtle)] text-[var(--fgColor-default)] border-[var(--borderColor-default)] font-bold'
                      : 'bg-[var(--canvas-default)] text-[var(--fgColor-muted)] border-[var(--borderColor-default)] hover:bg-[var(--canvas-subtle)]'
                  }`}
                >
                  Single-Runner Linear
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--fgColor-muted)]">Active Run:</span>
              <select
                aria-label="Select workflow run"
                value={activeRun.id}
                onChange={(e) => {
                  const runId = Number(e.target.value);
                  const found = historyRuns.find((r) => r.id === runId);
                  if (found) setActiveRun(found);
                }}
                className="text-xs py-1 px-2 rounded border border-[var(--borderColor-default)] bg-[var(--canvas-default)] text-[var(--fgColor-default)]"
              >
                {historyRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    Run #{r.runNumber} ({r.conclusion ?? r.status}) -{' '}
                    {new Date(r.createdAt).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Main Dual-Topology Visualizer */}
          <div className="p-5 rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] shadow-xs">
            {effectiveTopology === 'linear' ? (
              <LinearPipelineTimeline
                stages={activeRun.stages}
                activeStageId="gei-repo"
                overallStatus={activeRun.conclusion ?? activeRun.status}
              />
            ) : (
              <JobMatrixGrid
                cohorts={activeRun.cohorts}
                slicerStatus="completed"
                slicerSummary="Scope Matrix Slicer created 3 balanced repository cohort manifests."
                aggregateStatus={
                  activeRun.status === 'completed'
                    ? activeRun.conclusion === 'success'
                      ? 'completed'
                      : 'failed'
                    : 'in_progress'
                }
                aggregateSummary="Aggregate verification step will compare all cohort results against source."
              />
            )}
          </div>
        </>
      ) : (
        <StepSummaryViewer
          markdownSummary={SAMPLE_STEP_SUMMARY_MD}
          artifacts={SAMPLE_UNPACKED_ARTIFACTS}
          runId={activeRun.id}
          sourceOrg={sourceOrg}
          targetOrg="target-org"
        />
      )}

      {/* Historical Runs Browser */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <HistoryIcon size={16} className="text-[var(--fgColor-muted)]" />
          <h3 className="text-sm font-bold text-[var(--fgColor-default)]">
            Recent Workflow Runs
          </h3>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[var(--bgColor-muted)] text-[var(--fgColor-muted)] font-semibold border-b border-[var(--borderColor-default)]">
              <tr>
                <th className="px-3.5 py-2.5">Run</th>
                <th className="px-3.5 py-2.5">Workflow Name</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Actor</th>
                <th className="px-3.5 py-2.5">Commit</th>
                <th className="px-3.5 py-2.5">Date</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--borderColor-default)]">
              {historyRuns.map((run) => (
                <tr
                  key={run.id}
                  className={`hover:bg-[var(--canvas-subtle)] transition-colors ${
                    run.id === activeRun.id
                      ? 'bg-[var(--canvas-subtle)] font-medium'
                      : ''
                  }`}
                >
                  <td className="px-3.5 py-2.5 font-mono">#{run.runNumber}</td>
                  <td className="px-3.5 py-2.5 font-medium text-[var(--fgColor-default)]">
                    {run.name}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Label
                      size="small"
                      variant={
                        run.conclusion === 'success'
                          ? 'success'
                          : run.conclusion === 'failure'
                            ? 'danger'
                            : run.status === 'in_progress'
                              ? 'accent'
                              : 'secondary'
                      }
                    >
                      {run.conclusion ?? run.status}
                    </Label>
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--fgColor-muted)]">
                    @{run.actor}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[var(--fgColor-muted)]">
                    {run.headSha}
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--fgColor-muted)]">
                    {new Date(run.createdAt).toLocaleDateString()}{' '}
                    {new Date(run.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <Button
                      size="small"
                      onClick={() => setActiveRun(run)}
                      variant={run.id === activeRun.id ? 'primary' : 'default'}
                    >
                      {run.id === activeRun.id ? 'Viewing' : 'Inspect'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <Dialog
          title="Confirm Run Cancellation"
          onClose={() => setShowCancelModal(false)}
          footerButtons={[
            {
              buttonType: 'default',
              content: 'Dismiss',
              onClick: () => setShowCancelModal(false),
              disabled: isCancelling,
            },
            {
              buttonType: 'danger',
              content: isCancelling ? 'Cancelling...' : 'Cancel Workflow Run',
              onClick: handleCancelRun,
              disabled: isCancelling,
            },
          ]}
        >
          <div className="p-4 space-y-3 text-xs text-[var(--fgColor-default)]">
            <p>
              Are you sure you want to cancel active migration run{' '}
              <strong>#{activeRun.runNumber}</strong> (ID: {activeRun.id})?
            </p>
            <p className="text-[var(--fgColor-muted)]">
              In-flight API mutations for active cohorts will be terminated.
              Checkpointed state manifests will remain intact in Actions
              artifacts so the wave can be safely resumed later.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
};
