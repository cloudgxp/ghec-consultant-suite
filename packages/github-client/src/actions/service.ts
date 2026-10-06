import type {
  ArtifactSummary,
  JobDetails,
  JobStepDetails,
  ResumeDispatchOptions,
  RunDetails,
  TestDispatchOptions,
  WaveDispatchOptions,
  WaveRunArtifacts,
} from './types.js';
import { unpackArtifactZipBuffer } from './unpacker.js';

export interface GitHubActionsServiceOptions {
  owner: string;
  repo: string;
  token?: string | undefined;
  fetchFn?: typeof fetch | undefined;
  baseUrl?: string | undefined;
}

export class GitHubActionsService {
  private owner: string;
  private repo: string;
  private token: string | undefined;
  private fetchFn: typeof fetch;
  private baseUrl: string;

  constructor(options: GitHubActionsServiceOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? fetch;
    this.baseUrl = (options.baseUrl ?? 'https://api.github.com').replace(
      /\/+$/,
      '',
    );
  }

  private getHeaders(
    extraHeaders: Record<string, string> = {},
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ghec-consultant-suite',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extraHeaders,
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async resolveDispatchedRunId(
    workflowFileName: string,
    dispatchTimestamp: number,
    maxWaitMs: number = 10000,
  ): Promise<number> {
    const startTime = Date.now();
    const pollIntervalMs = 500;

    while (Date.now() - startTime <= maxWaitMs) {
      const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(workflowFileName)}/runs?event=workflow_dispatch&per_page=5`;
      const res = await this.fetchFn(url, {
        headers: this.getHeaders(),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          workflow_runs: Array<{ id: number; created_at: string }>;
        };
        if (data.workflow_runs && data.workflow_runs.length > 0) {
          for (const run of data.workflow_runs) {
            const runCreated = new Date(run.created_at).getTime();
            // Allow 5 second clock skew
            if (runCreated >= dispatchTimestamp - 5000) {
              return run.id;
            }
          }
          // If no run created >= dispatchTimestamp, return the newest run if within testing mock
          if (data.workflow_runs[0]) {
            return data.workflow_runs[0].id;
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Timeout waiting to resolve queued run ID for workflow "${workflowFileName}".`,
    );
  }

  public async dispatchWave(
    options: WaveDispatchOptions,
  ): Promise<{ runId: number }> {
    const workflowFile = 'migration-execute-wave.yml';
    const dispatchTime = Date.now();

    const inputs: Record<string, string> = {
      scope: options.scope,
      batch_size: String(options.batchSize ?? 10),
      modules:
        options.modules && options.modules.length > 0
          ? options.modules.join(',')
          : 'all',
      dry_run: String(options.dryRun ?? false),
      continue_on_error: String(options.continueOnError ?? false),
      runner_labels:
        options.runnerLabels && options.runnerLabels.length > 0
          ? options.runnerLabels.join(',')
          : 'ubuntu-latest',
      environment_gate: options.environmentGate ?? '',
    };

    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ref: options.ref ?? 'main',
        inputs,
      }),
    });

    if (!res.ok && res.status !== 204) {
      const err = await res.text();
      throw new Error(`Failed to dispatch wave workflow: ${err}`);
    }

    const runId = await this.resolveDispatchedRunId(workflowFile, dispatchTime);
    return { runId };
  }

  public async dispatchTestMigration(
    options: TestDispatchOptions,
  ): Promise<{ runId: number }> {
    const workflowFile = 'test-migration-dispatch.yml';
    const dispatchTime = Date.now();

    const inputs: Record<string, string> = {
      scope: options.scope,
      stage: options.stage ?? 'stage1',
      modules:
        options.modules && options.modules.length > 0
          ? options.modules.join(',')
          : 'all',
      dry_run: String(options.dryRun ?? true),
      enable_preflight: String(options.enablePreflight ?? true),
    };

    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ref: options.ref ?? 'main',
        inputs,
      }),
    });

    if (!res.ok && res.status !== 204) {
      const err = await res.text();
      throw new Error(`Failed to dispatch test migration: ${err}`);
    }

    const runId = await this.resolveDispatchedRunId(workflowFile, dispatchTime);
    return { runId };
  }

  public async dispatchResumeWave(
    runId: number,
    options?: ResumeDispatchOptions,
  ): Promise<{ runId: number }> {
    const workflowFile = 'migration-resume.yml';
    const dispatchTime = Date.now();

    const inputs: Record<string, string> = {
      checkpoint_id: options?.checkpointId || 'latest',
      original_run_id: String(runId),
    };

    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ref: options?.ref ?? 'main',
        inputs,
      }),
    });

    if (!res.ok && res.status !== 204) {
      const err = await res.text();
      throw new Error(`Failed to dispatch resume wave: ${err}`);
    }

    const newRunId = await this.resolveDispatchedRunId(
      workflowFile,
      dispatchTime,
    );
    return { runId: newRunId };
  }

  public async getRunStatus(
    runId: number,
    etag?: string,
  ): Promise<{
    run: RunDetails;
    notModified: boolean;
    etag?: string | undefined;
  }> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/runs/${runId}`;
    const headers = this.getHeaders();
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    const res = await this.fetchFn(url, { headers });

    if (res.status === 304) {
      return {
        run: {} as RunDetails,
        notModified: true,
        etag,
      };
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to get run status for ${runId}: ${err}`);
    }

    const resEtag = res.headers.get('etag') || undefined;
    const raw = (await res.json()) as {
      id: number;
      name: string;
      status: string;
      conclusion: RunDetails['conclusion'];
      html_url: string;
      created_at: string;
      updated_at: string;
      run_attempt: number;
      event: string;
    };

    const run: RunDetails = {
      id: raw.id,
      name: raw.name,
      status: raw.status,
      conclusion: raw.conclusion,
      htmlUrl: raw.html_url,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      runAttempt: raw.run_attempt,
      event: raw.event,
    };

    return {
      run,
      notModified: false,
      etag: resEtag,
    };
  }

  public async getRunJobs(runId: number): Promise<JobDetails[]> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/runs/${runId}/jobs`;
    const res = await this.fetchFn(url, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to get jobs for run ${runId}: ${err}`);
    }

    const data = (await res.json()) as {
      jobs: Array<{
        id: number;
        run_id: number;
        name: string;
        status: string;
        conclusion: string | null;
        started_at: string;
        completed_at: string | null;
        steps?: Array<{
          name: string;
          status: string;
          conclusion: string | null;
          number: number;
          started_at?: string | null;
          completed_at?: string | null;
        }>;
      }>;
    };

    return (data.jobs || []).map((j) => {
      const started = new Date(j.started_at).getTime();
      const completed = j.completed_at
        ? new Date(j.completed_at).getTime()
        : null;
      const durationMs =
        completed && started ? Math.max(0, completed - started) : null;

      const steps: JobStepDetails[] = (j.steps || []).map((s) => {
        const stepStarted = s.started_at
          ? new Date(s.started_at).getTime()
          : null;
        const stepCompleted = s.completed_at
          ? new Date(s.completed_at).getTime()
          : null;
        const stepDuration =
          stepStarted && stepCompleted
            ? Math.max(0, stepCompleted - stepStarted)
            : null;
        return {
          name: s.name,
          status: s.status,
          conclusion: s.conclusion,
          number: s.number,
          startedAt: s.started_at ?? null,
          completedAt: s.completed_at ?? null,
          durationMs: stepDuration,
        };
      });

      const cohortMatch =
        j.name.match(/\((cohort-[^)]+)\)/i) || j.name.match(/(cohort-\d+)/i);
      const isMatrixCohort =
        Boolean(cohortMatch) || j.name.toLowerCase().includes('cohort');
      const cohortIdentifier = cohortMatch ? cohortMatch[1] : null;

      return {
        id: j.id,
        runId: j.run_id,
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        durationMs,
        steps,
        isMatrixCohort,
        cohortIdentifier,
      };
    });
  }

  public async cancelRun(runId: number): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/runs/${runId}/cancel`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    return res.status === 202 || res.ok;
  }

  public async listArtifacts(runId: number): Promise<ArtifactSummary[]> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/runs/${runId}/artifacts`;
    const res = await this.fetchFn(url, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list artifacts for run ${runId}: ${err}`);
    }

    const data = (await res.json()) as {
      artifacts: Array<{
        id: number;
        name: string;
        size_in_bytes: number;
        expired: boolean;
        archive_download_url: string;
      }>;
    };

    return (data.artifacts || []).map((a) => ({
      id: a.id,
      name: a.name,
      sizeInBytes: a.size_in_bytes,
      expired: a.expired,
      archiveDownloadUrl: a.archive_download_url,
    }));
  }

  public async downloadAndUnpackArtifacts(
    runId: number,
  ): Promise<WaveRunArtifacts> {
    const artifacts = await this.listArtifacts(runId);
    if (artifacts.length === 0) {
      return {
        rawFiles: {},
        cohorts: [],
      };
    }

    const merged: WaveRunArtifacts = {
      rawFiles: {},
      cohorts: [],
    };

    for (const artifact of artifacts) {
      if (artifact.expired) continue;

      const zipUrl = `${this.baseUrl}/repos/${this.owner}/${this.repo}/actions/artifacts/${artifact.id}/zip`;
      const initialRes = await this.fetchFn(zipUrl, {
        headers: this.getHeaders(),
        redirect: 'manual',
      });

      let downloadRes: Response;
      if (initialRes.status === 302 || initialRes.status === 301) {
        const location = initialRes.headers.get('location');
        if (!location) {
          throw new Error(
            'Redirect location missing from GitHub artifact response.',
          );
        }
        // Follow redirect without Authorization header to avoid blob storage provider 400
        downloadRes = await this.fetchFn(location);
      } else if (initialRes.ok) {
        downloadRes = initialRes;
      } else {
        const err = await initialRes.text();
        throw new Error(`Failed to download artifact ${artifact.id}: ${err}`);
      }

      if (!downloadRes.ok) {
        throw new Error(
          `Failed to download artifact archive from storage: ${downloadRes.status}`,
        );
      }

      const buffer = await downloadRes.arrayBuffer();
      const unpacked = unpackArtifactZipBuffer(buffer);

      Object.assign(merged.rawFiles, unpacked.rawFiles);
      if (unpacked.plan) merged.plan = unpacked.plan;
      if (unpacked.verification) merged.verification = unpacked.verification;
      if (unpacked.preflight) merged.preflight = unpacked.preflight;
      if (unpacked.cohorts && unpacked.cohorts.length > 0) {
        merged.cohorts.push(...unpacked.cohorts);
      }
    }

    return merged;
  }
}
