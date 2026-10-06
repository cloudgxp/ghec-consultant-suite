import React, { useEffect, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Checkbox,
  FormControl,
  ProgressBar,
  TextInput,
} from '@primer/react';
import { PlayIcon, SearchIcon, SyncIcon } from '@primer/octicons-react';
import { importBundleJson, type ImportResult } from '../lib/importer.js';

function nowMs(): number {
  return Date.now();
}

export interface DiscoveryScanTriggerProps {
  onLoadBundle: (result: ImportResult) => void;
  apiBaseUrl?: string | undefined;
  fetchFn?: typeof fetch | undefined;
  defaultOwner?: string | undefined;
  defaultRepo?: string | undefined;
}

export type ScanStatus =
  | 'idle'
  | 'dispatching'
  | 'queued'
  | 'in_progress'
  | 'unpacking'
  | 'completed'
  | 'failed';

export const DiscoveryScanTrigger: React.FC<DiscoveryScanTriggerProps> = ({
  onLoadBundle,
  apiBaseUrl = '',
  fetchFn = fetch,
  defaultOwner = 'cloudgxp',
  defaultRepo = 'ghec-consultant-suite',
}) => {
  const owner = defaultOwner;
  const repo = defaultRepo;
  const [enterpriseSlug, setEnterpriseSlug] = useState('cloudgxp');
  const [organizations, setOrganizations] = useState('');
  const [modules, setModules] = useState('all');
  const [dryRun, setDryRun] = useState(false);
  const [scanEnterpriseLevel, setScanEnterpriseLevel] = useState(true);

  const [status, setStatus] = useState<ScanStatus>('idle');
  const [runId, setRunId] = useState<number | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        window.clearTimeout(pollingRef.current);
      }
    };
  }, []);

  const handleStartScan = async () => {
    setErrorMsg(null);
    setStatus('dispatching');
    setProgressMsg('Dispatching discovery workflow to GitHub Actions...');

    const workflowId = 'enterprise-multi-org-scan.yml';
    const dispatchTime = nowMs();

    try {
      // 1. Dispatch workflow
      const dispatchRes = await fetchFn(
        `${apiBaseUrl}/api/actions/workflows/${encodeURIComponent(workflowId)}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner,
            repo,
            ref: 'main',
            inputs: {
              enterprise_slug: enterpriseSlug.trim(),
              organizations: organizations.trim(),
              modules: modules.trim(),
              dry_run: dryRun,
              scan_enterprise_level: scanEnterpriseLevel,
            },
          }),
        },
      );

      if (!dispatchRes.ok) {
        const errData = await dispatchRes.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ??
            `Failed to dispatch workflow: ${dispatchRes.statusText}`,
        );
      }

      setStatus('queued');
      setProgressMsg('Workflow dispatched. Resolving run ID...');

      // 2. Poll for the queued run
      let resolvedRunId: number | null = null;
      const pollStart = nowMs();
      while (nowMs() - pollStart < 30000 && !resolvedRunId) {
        await new Promise((r) => setTimeout(r, 1500));
        const runsRes = await fetchFn(
          `${apiBaseUrl}/api/actions/workflows/${encodeURIComponent(workflowId)}/runs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&event=workflow_dispatch&per_page=5`,
        );
        if (runsRes.ok) {
          const runsData = (await runsRes.json()) as {
            workflow_runs?: Array<{ id: number; created_at: string }>;
          };
          if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
            for (const r of runsData.workflow_runs) {
              const runCreated = new Date(r.created_at).getTime();
              if (runCreated >= dispatchTime - 5000) {
                resolvedRunId = r.id;
                break;
              }
            }
            if (!resolvedRunId && runsData.workflow_runs[0]) {
              resolvedRunId = runsData.workflow_runs[0].id;
            }
          }
        }
      }

      if (!resolvedRunId) {
        throw new Error('Timed out waiting for workflow run to register.');
      }

      setRunId(resolvedRunId);
      setStatus('in_progress');
      setProgressMsg(`Monitoring Run #${resolvedRunId}...`);

      // 3. Monitor run until terminal state
      pollRunStatus(resolvedRunId);
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const pollRunStatus = async (activeRunId: number) => {
    try {
      const runRes = await fetchFn(
        `${apiBaseUrl}/api/actions/runs/${activeRunId}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!runRes.ok) {
        throw new Error(`Failed to fetch run details: ${runRes.statusText}`);
      }

      const runData = (await runRes.json()) as {
        status: string;
        conclusion: string | null;
      };

      if (runData.status === 'completed') {
        if (runData.conclusion === 'success') {
          setStatus('unpacking');
          setProgressMsg('Run completed. Downloading and unpacking bundle...');
          await downloadAndHydrate(activeRunId);
        } else {
          setStatus('failed');
          setErrorMsg(
            `Discovery workflow concluded with status: ${runData.conclusion ?? 'unknown'}`,
          );
        }
      } else {
        // Still running or queued
        setProgressMsg(
          `Run #${activeRunId} in progress (status: ${runData.status})...`,
        );
        pollingRef.current = window.setTimeout(
          () => pollRunStatus(activeRunId),
          2000,
        );
      }
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadAndHydrate = async (activeRunId: number) => {
    try {
      const artRes = await fetchFn(
        `${apiBaseUrl}/api/actions/runs/${activeRunId}/artifacts?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!artRes.ok) {
        throw new Error(`Failed to list artifacts: ${artRes.statusText}`);
      }

      const artData = (await artRes.json()) as {
        artifacts?: Array<{ id: number; name: string }>;
      };
      const artifacts = artData.artifacts ?? [];
      const discoveryArtifact =
        artifacts.find(
          (a) =>
            a.name.startsWith('discovery-enterprise-') ||
            a.name.startsWith('discovery-org-') ||
            a.name.includes('discovery'),
        ) ?? artifacts[0];

      if (!discoveryArtifact) {
        throw new Error('No discovery bundle artifact found in workflow run.');
      }

      const unpackRes = await fetchFn(
        `${apiBaseUrl}/api/actions/artifacts/${discoveryArtifact.id}/unpacked?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!unpackRes.ok) {
        throw new Error(
          `Failed to unpack artifact archive: ${unpackRes.statusText}`,
        );
      }

      const unpackedData = (await unpackRes.json()) as {
        files: Record<string, unknown>;
      };

      // Search unpacked files for a valid discovery bundle
      let bundleCandidate: unknown = null;
      for (const [fname, content] of Object.entries(unpackedData.files)) {
        if (
          fname.endsWith('.json') &&
          content &&
          typeof content === 'object' &&
          'schemaVersion' in content &&
          'scan' in content
        ) {
          bundleCandidate = content;
          break;
        }
      }

      if (!bundleCandidate) {
        // Fallback: check any JSON file
        for (const content of Object.values(unpackedData.files)) {
          if (content && typeof content === 'object') {
            const res = importBundleJson(content);
            if (res.success) {
              bundleCandidate = content;
              break;
            }
          }
        }
      }

      if (!bundleCandidate) {
        throw new Error(
          'Discovery bundle payload was not found inside the downloaded artifact.',
        );
      }

      const importResult = importBundleJson(bundleCandidate);
      if (!importResult.success) {
        throw new Error(
          `Failed to parse and validate downloaded discovery bundle: ${importResult.message}`,
        );
      }

      setStatus('completed');
      setProgressMsg('Discovery bundle hydrated successfully!');
      onLoadBundle(importResult);
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const isBusy =
    status === 'dispatching' ||
    status === 'queued' ||
    status === 'in_progress' ||
    status === 'unpacking';

  return (
    <div className="rounded-2xl border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] p-6 shadow-sm">
      <div className="flex items-center space-x-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bgColor-accent-muted)] text-[var(--fgColor-accent)]">
          <SearchIcon size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--fgColor-default)]">
            Automated Discovery Scan via Actions
          </h2>
          <p className="text-sm text-[var(--fgColor-muted)]">
            Trigger a multi-org discovery scan on GitHub Actions and
            automatically ingest the resulting bundle.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4">
          <Banner variant="critical" title="Discovery Scan Failed">
            {errorMsg}
          </Banner>
        </div>
      )}

      {isBusy && (
        <div className="mb-6 space-y-2 rounded-lg border border-[var(--borderColor-accent-muted)] bg-[var(--bgColor-accent-muted)] p-4">
          <div className="flex items-center justify-between text-sm font-semibold text-[var(--fgColor-default)]">
            <span className="flex items-center gap-2">
              <SyncIcon className="animate-spin text-[var(--fgColor-accent)]" />
              {progressMsg}
            </span>
            <span className="capitalize">
              {runId ? `Run #${runId} — ` : ''}
              {status.replace('_', ' ')}
            </span>
          </div>
          <ProgressBar progress={status === 'unpacking' ? 90 : 50} />
        </div>
      )}

      {status === 'completed' && (
        <div className="mb-4">
          <Banner variant="success" title="Ingestion Complete">
            The discovery bundle was successfully unpacked and hydrated into the
            dashboard!
          </Banner>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormControl>
          <FormControl.Label>Enterprise Slug</FormControl.Label>
          <TextInput
            value={enterpriseSlug}
            onChange={(e) => setEnterpriseSlug(e.target.value)}
            placeholder="e.g. cloudgxp"
            disabled={isBusy}
            block
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>
            Organizations (Optional Comma-separated)
          </FormControl.Label>
          <TextInput
            value={organizations}
            onChange={(e) => setOrganizations(e.target.value)}
            placeholder="e.g. org-a, org-b (blank for all)"
            disabled={isBusy}
            block
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>Modules</FormControl.Label>
          <TextInput
            value={modules}
            onChange={(e) => setModules(e.target.value)}
            placeholder="all"
            disabled={isBusy}
            block
          />
        </FormControl>

        <div className="flex flex-col justify-center space-y-2 pt-4">
          <FormControl>
            <Checkbox
              checked={scanEnterpriseLevel}
              onChange={(e) => setScanEnterpriseLevel(e.target.checked)}
              disabled={isBusy}
            />
            <FormControl.Label>
              Include Enterprise-Level Metadata Scan
            </FormControl.Label>
          </FormControl>

          <FormControl>
            <Checkbox
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={isBusy}
            />
            <FormControl.Label>
              Dry-run Mode (simulate collectors)
            </FormControl.Label>
          </FormControl>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          variant="primary"
          leadingVisual={PlayIcon}
          onClick={handleStartScan}
          disabled={isBusy || (!enterpriseSlug && !organizations)}
        >
          {isBusy ? 'Scan in Progress…' : 'Trigger Discovery Scan'}
        </Button>
      </div>
    </div>
  );
};
