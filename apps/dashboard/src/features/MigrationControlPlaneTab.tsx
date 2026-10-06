import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  Banner,
  Button,
  Checkbox,
  FormControl,
  Label,
  TextInput,
} from '@primer/react';
import {
  ClockIcon,
  RocketIcon,
  StopIcon,
  SyncIcon,
} from '@primer/octicons-react';
import {
  JobMatrixGrid,
  type MatrixCohortJob,
} from '../components/JobMatrixGrid.js';
import {
  StepSummaryViewer,
  type UnpackedArtifactsData,
} from '../components/StepSummaryViewer.js';
import { PageHeader } from '../components/ui/index.js';
import { resolveOrgName } from '../lib/formatters.js';

function nowMs(): number {
  return Date.now();
}

export interface MigrationControlPlaneTabProps {
  bundle?: DiscoveryBundle | null | undefined;
  selectedOrgIds?: readonly string[] | undefined;
  apiBaseUrl?: string | undefined;
  fetchFn?: typeof fetch | undefined;
  defaultOwner?: string | undefined;
  defaultRepo?: string | undefined;
}

interface ActiveWaveRun {
  id: number;
  runNumber?: number | undefined;
  workflowId: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | null;
  htmlUrl?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export const MigrationControlPlaneTab: React.FC<
  MigrationControlPlaneTabProps
> = ({
  bundle,
  selectedOrgIds = [],
  apiBaseUrl = '',
  fetchFn = fetch,
  defaultOwner = 'cloudgxp',
  defaultRepo = 'ghec-consultant-suite',
}) => {
  // Dispatch configuration state
  const owner = defaultOwner;
  const repo = defaultRepo;
  const [scopePath, setScopePath] = useState('scopes/test-all-wave.json');
  const [runnerCapacity, setRunnerCapacity] = useState('5');
  const [modules, setModules] = useState('all');
  const [dryRun, setDryRun] = useState(true);
  const [continueOnError, setContinueOnError] = useState(true);
  const [runnerLabels, setRunnerLabels] = useState('ubuntu-latest');
  const [environmentGate, setEnvironmentGate] = useState(
    'production-migration',
  );

  // Active run state
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveWaveRun | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live Cohorts and Job Status
  const [slicerStatus, setSlicerStatus] = useState<
    'pending' | 'in_progress' | 'completed' | 'failed'
  >('pending');
  const [slicerSummary, setSlicerSummary] = useState(
    'Partitioning enterprise scope into runner-balanced cohorts',
  );
  const [aggregateStatus, setAggregateStatus] = useState<
    'pending' | 'in_progress' | 'completed' | 'failed'
  >('pending');
  const [aggregateSummary, setAggregateSummary] = useState(
    'Verification compliance and step summary aggregation',
  );
  const [cohorts, setCohorts] = useState<MatrixCohortJob[]>([]);

  // Cancellation state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  // Artifact and Step Summary State
  const [unpackedArtifacts, setUnpackedArtifacts] =
    useState<UnpackedArtifactsData | null>(null);
  const [stepSummaryMd, setStepSummaryMd] = useState<string>('');

  const pollingTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current !== null)
        window.clearTimeout(pollingTimerRef.current);
      if (elapsedTimerRef.current !== null)
        window.clearInterval(elapsedTimerRef.current);
    };
  }, []);

  // Track elapsed time when run is in progress
  useEffect(() => {
    if (activeRun && activeRun.status !== 'completed') {
      const startTime = new Date(activeRun.createdAt).getTime();
      const initialTimer = window.setTimeout(() => {
        setElapsedSeconds(
          Math.max(0, Math.floor((nowMs() - startTime) / 1000)),
        );
      }, 0);

      const intervalTimer = window.setInterval(() => {
        setElapsedSeconds(
          Math.max(0, Math.floor((nowMs() - startTime) / 1000)),
        );
      }, 1000);
      elapsedTimerRef.current = intervalTimer;

      return () => {
        window.clearTimeout(initialTimer);
        window.clearInterval(intervalTimer);
      };
    } else {
      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
      }
    }

    return () => {
      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
      }
    };
  }, [activeRun]);

  const handleDispatch = async () => {
    setIsDispatching(true);
    setDispatchError(null);
    setCancelMessage(null);
    setUnpackedArtifacts(null);
    setStepSummaryMd('');
    setCohorts([]);
    setSlicerStatus('in_progress');
    setAggregateStatus('pending');

    const workflowId = 'migration-execute-wave.yml';
    const dispatchTime = nowMs();

    try {
      const parsedCapacity = parseInt(runnerCapacity, 10);
      const capacityVal =
        isNaN(parsedCapacity) || parsedCapacity <= 0 ? 5 : parsedCapacity;

      const res = await fetchFn(
        `${apiBaseUrl}/api/actions/workflows/${encodeURIComponent(workflowId)}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner,
            repo,
            ref: 'main',
            inputs: {
              scope: scopePath.trim(),
              runner_capacity: capacityVal,
              batch_size: capacityVal,
              modules: modules.trim(),
              dry_run: dryRun,
              continue_on_error: continueOnError,
              runner_labels: runnerLabels.trim(),
              environment_gate: environmentGate.trim(),
            },
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ??
            `Failed to dispatch wave workflow: ${res.statusText}`,
        );
      }

      // Resolve dispatched run ID by querying workflow runs
      let resolvedRun: ActiveWaveRun | null = null;
      const pollStart = nowMs();
      while (nowMs() - pollStart < 25000 && !resolvedRun) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const runsRes = await fetchFn(
          `${apiBaseUrl}/api/actions/workflows/${encodeURIComponent(workflowId)}/runs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&event=workflow_dispatch&per_page=5`,
        );

        if (runsRes.ok) {
          const runsData = (await runsRes.json()) as {
            workflow_runs?: Array<{
              id: number;
              run_number?: number;
              status: 'queued' | 'in_progress' | 'completed';
              conclusion:
                'success' | 'failure' | 'cancelled' | 'timed_out' | null;
              html_url?: string;
              created_at: string;
              updated_at: string;
            }>;
          };

          if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
            for (const r of runsData.workflow_runs) {
              const runCreated = new Date(r.created_at).getTime();
              if (runCreated >= dispatchTime - 5000) {
                resolvedRun = {
                  id: r.id,
                  runNumber: r.run_number,
                  workflowId,
                  status: r.status,
                  conclusion: r.conclusion,
                  htmlUrl: r.html_url,
                  createdAt: r.created_at,
                  updatedAt: r.updated_at,
                };
                break;
              }
            }
            if (!resolvedRun && runsData.workflow_runs[0]) {
              const r = runsData.workflow_runs[0];
              resolvedRun = {
                id: r.id,
                runNumber: r.run_number,
                workflowId,
                status: r.status,
                conclusion: r.conclusion,
                htmlUrl: r.html_url,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
              };
            }
          }
        }
      }

      if (!resolvedRun) {
        throw new Error(
          'Timed out waiting for migration workflow run to register in Actions.',
        );
      }

      setActiveRun(resolvedRun);
      setIsDispatching(false);
      pollActiveRun(resolvedRun.id);
    } catch (err) {
      setIsDispatching(false);
      setDispatchError(err instanceof Error ? err.message : String(err));
    }
  };

  const pollActiveRun = async (runId: number) => {
    try {
      // 1. Fetch Run Status
      const runRes = await fetchFn(
        `${apiBaseUrl}/api/actions/runs/${runId}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (runRes.ok) {
        const runData = (await runRes.json()) as {
          id: number;
          run_number?: number;
          status: 'queued' | 'in_progress' | 'completed';
          conclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | null;
          html_url?: string;
          created_at: string;
          updated_at: string;
        };

        setActiveRun({
          id: runData.id,
          runNumber: runData.run_number,
          workflowId: 'migration-execute-wave.yml',
          status: runData.status,
          conclusion: runData.conclusion,
          htmlUrl: runData.html_url,
          createdAt: runData.created_at,
          updatedAt: runData.updated_at,
        });

        // 2. Fetch Jobs Status
        const jobsRes = await fetchFn(
          `${apiBaseUrl}/api/actions/runs/${runId}/jobs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        );

        if (jobsRes.ok) {
          const jobsData = (await jobsRes.json()) as {
            jobs?: Array<{
              id: number;
              name: string;
              status: string;
              conclusion: string | null;
              started_at: string;
              completed_at: string | null;
              steps?: Array<{
                name: string;
                status: string;
                conclusion: string | null;
              }>;
            }>;
          };

          const rawJobs = jobsData.jobs ?? [];

          // Slicer job
          const slicerJob = rawJobs.find(
            (j) =>
              j.name.toLowerCase().includes('partition') ||
              j.name.toLowerCase().includes('slicer'),
          );
          if (slicerJob) {
            const sStatus: 'pending' | 'in_progress' | 'completed' | 'failed' =
              slicerJob.status === 'completed'
                ? slicerJob.conclusion === 'success'
                  ? 'completed'
                  : 'failed'
                : slicerJob.status === 'in_progress'
                  ? 'in_progress'
                  : 'pending';
            setSlicerStatus(sStatus);
            setSlicerSummary(
              `Slicer phase: ${slicerJob.conclusion ?? slicerJob.status}`,
            );
          }

          // Aggregator job
          const aggJob = rawJobs.find(
            (j) =>
              j.name.toLowerCase().includes('verify') ||
              j.name.toLowerCase().includes('aggregate') ||
              j.name.toLowerCase().includes('report'),
          );
          if (aggJob) {
            const aStatus: 'pending' | 'in_progress' | 'completed' | 'failed' =
              aggJob.status === 'completed'
                ? aggJob.conclusion === 'success'
                  ? 'completed'
                  : 'failed'
                : aggJob.status === 'in_progress'
                  ? 'in_progress'
                  : 'pending';
            setAggregateStatus(aStatus);
            setAggregateSummary(
              `Aggregator phase: ${aggJob.conclusion ?? aggJob.status}`,
            );
          }

          // Cohort jobs
          const cohortJobs = rawJobs.filter(
            (j) =>
              j.name.toLowerCase().includes('cohort') ||
              j.name.toLowerCase().includes('migrate'),
          );
          const parsedCohorts: MatrixCohortJob[] = cohortJobs.map((j, idx) => {
            const idMatch = j.name.match(/cohort[-_\s]?([0-9a-zA-Z_-]+)/i);
            const cohortId = idMatch
              ? `cohort-${idMatch[1]}`
              : `cohort-${idx + 1}`;
            const cStatus: MatrixCohortJob['status'] =
              j.status === 'completed'
                ? j.conclusion === 'success'
                  ? 'completed'
                  : j.conclusion === 'cancelled'
                    ? 'cancelled'
                    : 'failed'
                : j.status === 'in_progress'
                  ? 'in_progress'
                  : 'queued';

            const currentStep =
              j.steps?.find((s) => s.status === 'in_progress')?.name ??
              (j.status === 'completed' ? 'verify' : 'preflight');
            const startMs = j.started_at
              ? new Date(j.started_at).getTime()
              : nowMs();
            const endMs = j.completed_at
              ? new Date(j.completed_at).getTime()
              : nowMs();
            const elapsed = Math.max(0, Math.floor((endMs - startMs) / 1000));

            return {
              id: cohortId,
              name: j.name,
              status: cStatus,
              repositoryCount: 1,
              currentStep,
              elapsedSeconds: elapsed,
              progressPercent:
                cStatus === 'completed'
                  ? 100
                  : cStatus === 'in_progress'
                    ? 50
                    : 0,
              operations: {
                created: cStatus === 'completed' ? 4 : 0,
                updated: 0,
                noop: 0,
                failed: cStatus === 'failed' ? 1 : 0,
              },
            };
          });

          if (parsedCohorts.length > 0) {
            setCohorts(parsedCohorts);
          }
        }

        // Terminal state handling
        if (runData.status === 'completed') {
          await loadArtifactsAndSummary(runId);
          return;
        }
      }

      // Schedule next poll
      pollingTimerRef.current = window.setTimeout(
        () => pollActiveRun(runId),
        2500,
      );
    } catch {
      pollingTimerRef.current = window.setTimeout(
        () => pollActiveRun(runId),
        3000,
      );
    }
  };

  const handleCancelRun = async () => {
    if (!activeRun) return;
    setIsCancelling(true);
    setCancelMessage(null);

    try {
      const res = await fetchFn(
        `${apiBaseUrl}/api/actions/runs/${activeRun.id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner, repo }),
        },
      );

      if (res.ok) {
        setCancelMessage('Cancellation request sent to GitHub Actions.');
      } else {
        const errText = await res.text();
        throw new Error(`Cancellation failed: ${errText}`);
      }
    } catch (err) {
      setCancelMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCancelling(false);
    }
  };

  const loadArtifactsAndSummary = async (runId: number) => {
    try {
      const artRes = await fetchFn(
        `${apiBaseUrl}/api/actions/runs/${runId}/artifacts?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!artRes.ok) return;

      const artData = (await artRes.json()) as {
        artifacts?: Array<{ id: number; name: string }>;
      };
      const artifacts = artData.artifacts ?? [];
      const waveArtifact =
        artifacts.find(
          (a) => a.name.includes('migration-wave') || a.name.includes('final'),
        ) ?? artifacts[0];

      if (waveArtifact) {
        const unpackRes = await fetchFn(
          `${apiBaseUrl}/api/actions/artifacts/${waveArtifact.id}/unpacked?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        );

        if (unpackRes.ok) {
          const unpacked = (await unpackRes.json()) as {
            files: Record<string, unknown>;
            reports: {
              plan?: Record<string, unknown>;
              verification?: Record<string, unknown>;
              cohorts?: UnpackedArtifactsData['cohorts'];
              preflight?: Record<string, unknown>;
            };
          };

          setUnpackedArtifacts({
            plan: unpacked.reports?.plan,
            verification: unpacked.reports?.verification,
            preflight: unpacked.reports?.preflight,
            cohorts: unpacked.reports?.cohorts ?? [],
            rawFiles: unpacked.files,
          });

          // Generate readable markdown summary
          const md = [
            `# Migration Wave Execution Report — Run #${runId}`,
            `- **Workflow:** \`migration-execute-wave.yml\``,
            `- **Status:** ${activeRun?.conclusion ?? 'completed'}`,
            `- **Scope File:** \`${scopePath}\``,
            `- **Runner Capacity:** ${runnerCapacity} runners`,
            `- **Dry Run:** ${dryRun ? 'true (Simulation)' : 'false (Live Mutation)'}`,
            `- **Target Gate:** \`${environmentGate}\``,
          ].join('\n');
          setStepSummaryMd(md);
        }
      }
    } catch {
      // Non-blocking for UI
    }
  };

  const activeOrgName = useMemo(() => {
    const orgId = selectedOrgIds[0];
    if (selectedOrgIds.length === 1 && orgId && bundle) {
      return resolveOrgName(bundle, orgId);
    }
    return owner;
  }, [bundle, selectedOrgIds, owner]);

  const isRunning =
    activeRun?.status === 'queued' || activeRun?.status === 'in_progress';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Migration Control Plane"
        description={
          <>
            Orchestrate and monitor live migration waves across parallel runner
            cohorts with dynamic runner capacity and real-time cancellation.
          </>
        }
        primaryAction={
          isRunning ? (
            <Button
              variant="danger"
              leadingVisual={StopIcon}
              onClick={handleCancelRun}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling Wave…' : 'Cancel Ongoing Wave'}
            </Button>
          ) : (
            <Button
              variant="primary"
              leadingVisual={RocketIcon}
              onClick={handleDispatch}
              disabled={isDispatching || !scopePath.trim()}
            >
              {isDispatching ? 'Dispatching Wave…' : 'Dispatch Migration Wave'}
            </Button>
          )
        }
      />

      {dispatchError && (
        <Banner variant="critical" title="Wave Dispatch Failed">
          {dispatchError}
        </Banner>
      )}

      {cancelMessage && (
        <Banner variant="warning" title="Wave Cancellation">
          {cancelMessage}
        </Banner>
      )}

      {/* Control Plane Wave Configuration Panel */}
      <div className="rounded-xl border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--fgColor-default)] mb-4">
          Wave Orchestration Parameters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <FormControl>
            <FormControl.Label>Migration Scope File</FormControl.Label>
            <TextInput
              value={scopePath}
              onChange={(e) => setScopePath(e.target.value)}
              placeholder="e.g. scopes/test-all-wave.json"
              disabled={isRunning || isDispatching}
              block
            />
          </FormControl>

          <FormControl>
            <FormControl.Label>Runner Capacity (N Runners)</FormControl.Label>
            <TextInput
              value={runnerCapacity}
              onChange={(e) => setRunnerCapacity(e.target.value)}
              placeholder="e.g. 5"
              disabled={isRunning || isDispatching}
              block
            />
            <FormControl.Caption>
              Partitions workload into up to N parallel runner cohorts.
            </FormControl.Caption>
          </FormControl>

          <FormControl>
            <FormControl.Label>Target Environment Gate</FormControl.Label>
            <TextInput
              value={environmentGate}
              onChange={(e) => setEnvironmentGate(e.target.value)}
              placeholder="e.g. production-migration"
              disabled={isRunning || isDispatching}
              block
            />
          </FormControl>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <FormControl>
            <FormControl.Label>Runner Labels</FormControl.Label>
            <TextInput
              value={runnerLabels}
              onChange={(e) => setRunnerLabels(e.target.value)}
              placeholder="e.g. ubuntu-latest"
              disabled={isRunning || isDispatching}
              block
            />
          </FormControl>

          <FormControl>
            <FormControl.Label>Modules Filter</FormControl.Label>
            <TextInput
              value={modules}
              onChange={(e) => setModules(e.target.value)}
              placeholder="all"
              disabled={isRunning || isDispatching}
              block
            />
          </FormControl>

          <div className="flex flex-col justify-center space-y-2 pt-2">
            <FormControl>
              <Checkbox
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={isRunning || isDispatching}
              />
              <FormControl.Label>
                Dry-run Execution (Simulate Mutations)
              </FormControl.Label>
            </FormControl>

            <FormControl>
              <Checkbox
                checked={continueOnError}
                onChange={(e) => setContinueOnError(e.target.checked)}
                disabled={isRunning || isDispatching}
              />
              <FormControl.Label>
                Continue On Cohort / Module Errors
              </FormControl.Label>
            </FormControl>
          </div>
        </div>
      </div>

      {/* Real-Time Run Status Header */}
      {activeRun && (
        <div className="rounded-xl border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-[var(--fgColor-default)]">
                Active Wave Run #{activeRun.id}
              </span>
              <Label
                variant={
                  activeRun.status === 'completed'
                    ? activeRun.conclusion === 'success'
                      ? 'success'
                      : 'danger'
                    : 'accent'
                }
              >
                {activeRun.status === 'completed'
                  ? (activeRun.conclusion ?? 'completed')
                  : activeRun.status}
              </Label>
              {activeRun.htmlUrl && (
                <a
                  href={activeRun.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--fgColor-accent)] hover:underline"
                >
                  View on GitHub Actions ↗
                </a>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-[var(--fgColor-muted)]">
              <span className="flex items-center gap-1">
                <ClockIcon size={14} />
                Elapsed: <strong>{elapsedSeconds}s</strong>
              </span>
              {isRunning && (
                <span className="flex items-center gap-1 text-[var(--fgColor-accent)]">
                  <SyncIcon size={14} className="animate-spin" />
                  Streaming live telemetry…
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Job Matrix Grid */}
      <div className="rounded-xl border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
        <JobMatrixGrid
          slicerStatus={slicerStatus}
          slicerSummary={slicerSummary}
          cohorts={cohorts}
          aggregateStatus={aggregateStatus}
          aggregateSummary={aggregateSummary}
        />
      </div>

      {/* Live Step Summary & Operations Inspection */}
      {(stepSummaryMd || unpackedArtifacts) && (
        <div className="rounded-xl border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
          <h3 className="text-base font-semibold text-[var(--fgColor-default)] mb-4">
            Wave Execution Summary & Artifact Inspection
          </h3>
          <StepSummaryViewer
            markdownSummary={stepSummaryMd}
            artifacts={unpackedArtifacts ?? undefined}
            runId={activeRun?.id}
            sourceOrg={activeOrgName}
            targetOrg={`${activeOrgName}-target`}
          />
        </div>
      )}
    </div>
  );
};
