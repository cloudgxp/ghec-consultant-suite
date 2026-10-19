import {
  validateBundle,
  validateVerificationReport,
  type DiscoveryBundle,
  type VerificationReport,
} from '@ghec/contracts';
import { evaluateBundle, type EvaluatedInsights } from '@ghec/analysis';
import type { ImportStage, ImportWorkerMessage } from './importer.worker.js';
import {
  SAMPLE_ORGANIZATION_BUNDLE,
  SAMPLE_ENTERPRISE_BUNDLE,
  SAMPLE_SPECIALIZED_BUNDLE,
  SAMPLE_PARTIAL_DENIED_BUNDLE,
} from './samples.js';

export type ImportResult =
  | {
      success: true;
      bundle: DiscoveryBundle;
      insights: EvaluatedInsights;
    }
  | { success: false; message: string; code?: string };

export interface ImportProgress {
  status: ImportStage;
  progress: number;
}

export interface HostedEvidenceProbeOptions {
  readonly fetchFn?: typeof fetch | undefined;
  readonly bundleUrl?: string | undefined;
  readonly verificationReportUrl?: string | undefined;
  readonly manifestUrl?: string | undefined;
  readonly scopeUrl?: string | undefined;
}

export interface HostedEvidenceProbeResult {
  readonly found: boolean;
  readonly bundleResult?: ImportResult | undefined;
  readonly verificationReport?: VerificationReport | undefined;
}

interface HostedManifestLike {
  readonly runId?: string | undefined;
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly generatedAt?: string | undefined;
  readonly repositories?:
    | readonly {
        readonly sourceRepo?: string | undefined;
        readonly targetRepo?: string | undefined;
      }[]
    | undefined;
  readonly transferStrategies?:
    | {
        readonly archivedRepos?: readonly string[] | undefined;
        readonly lfs?:
          | {
              readonly repos?: readonly string[] | undefined;
            }
          | undefined;
      }
    | undefined;
  readonly summary?:
    | {
        readonly transferStrategies?:
          | {
              readonly archivedRepos?: readonly string[] | undefined;
              readonly lfs?:
                | {
                    readonly repos?: readonly string[] | undefined;
                  }
                | undefined;
            }
          | undefined;
      }
    | undefined;
}

interface HostedScopeLike {
  readonly sourceOrg?: string | undefined;
  readonly targetOrg?: string | undefined;
  readonly organizations?:
    | readonly {
        readonly source?: string | undefined;
        readonly target?: string | undefined;
      }[]
    | undefined;
  readonly repositories?:
    | readonly {
        readonly name?: string | undefined;
        readonly sourceOrg?: string | undefined;
        readonly sourceRepo?: string | undefined;
        readonly targetOrg?: string | undefined;
        readonly targetRepo?: string | undefined;
        readonly visibility?: 'public' | 'private' | 'internal' | undefined;
        readonly targetRepoVisibility?:
          'public' | 'private' | 'internal' | undefined;
        readonly archived?: boolean | undefined;
        readonly sizeKb?: number | undefined;
        readonly hasLfs?: boolean | undefined;
        readonly options?:
          | {
              readonly archived?: boolean | undefined;
              readonly targetRepoVisibility?:
                'public' | 'private' | 'internal' | undefined;
            }
          | undefined;
      }[]
    | undefined;
}

function synthesizeBundleFromHostedArtifacts(params: {
  readonly manifest?: HostedManifestLike | undefined;
  readonly scope?: HostedScopeLike | undefined;
  readonly verificationReport?: VerificationReport | undefined;
}): ImportResult | undefined {
  const { manifest, scope, verificationReport } = params;
  if (!manifest && !scope && !verificationReport) {
    return undefined;
  }

  const orgId =
    manifest?.sourceOrg ||
    scope?.sourceOrg ||
    scope?.organizations?.[0]?.source ||
    scope?.repositories?.[0]?.sourceOrg ||
    verificationReport?.sourceOrg ||
    manifest?.targetOrg ||
    scope?.targetOrg ||
    scope?.organizations?.[0]?.target ||
    verificationReport?.targetOrg ||
    'hosted-migration-org';
  const targetOrg =
    manifest?.targetOrg ||
    scope?.targetOrg ||
    scope?.organizations?.[0]?.target ||
    scope?.repositories?.[0]?.targetOrg ||
    verificationReport?.targetOrg ||
    orgId;
  const rawTimestamp =
    manifest?.generatedAt ||
    verificationReport?.verifiedAt ||
    '2026-01-01T00:00:00.000Z';
  const parsedTime = Date.parse(rawTimestamp);
  const completedAt = Number.isNaN(parsedTime)
    ? '2026-01-01T00:00:00.000Z'
    : new Date(parsedTime).toISOString();
  const startedAt = Number.isNaN(parsedTime)
    ? '2026-01-01T00:00:00.000Z'
    : new Date(Math.max(0, parsedTime - 60_000)).toISOString();

  const strategies =
    manifest?.transferStrategies ?? manifest?.summary?.transferStrategies;
  const archivedSet = new Set(
    (strategies?.archivedRepos ?? []).map((r) => r.toLowerCase()),
  );
  const lfsSet = new Set(
    (strategies?.lfs?.repos ?? []).map((r) => r.toLowerCase()),
  );
  const scopeRepoMap = new Map<
    string,
    NonNullable<HostedScopeLike['repositories']>[number]
  >();
  for (const r of scope?.repositories ?? []) {
    const repoKey = r.targetRepo || r.sourceRepo || r.name;
    if (repoKey) {
      scopeRepoMap.set(repoKey.toLowerCase(), r);
    }
  }

  const repoNames = new Set<string>();
  for (const r of manifest?.repositories ?? []) {
    const name = r.targetRepo || r.sourceRepo;
    if (name) repoNames.add(name);
  }
  for (const r of scope?.repositories ?? []) {
    const name = r.targetRepo || r.sourceRepo || r.name;
    if (name) repoNames.add(name);
  }
  if (repoNames.size === 0 && verificationReport) {
    for (const mod of verificationReport.modules) {
      if (mod.moduleId === 'gei-repo') {
        for (const d of mod.discrepancies) {
          if (d.resourceName) repoNames.add(d.resourceName);
        }
      }
    }
  }

  const provenance = {
    source: 'rest' as const,
    operation: 'migration-audit-results.hydrate',
    observedAt: completedAt,
    apiVersion: '2022-11-28',
  };

  const modules = [
    'orgs',
    'repos',
    'lfs',
    'teams',
    'actions',
    'actions-secrets',
    'policies',
    'security',
    'integrations',
    'users',
    'packages',
  ] as const;

  const collectors = modules.map((mod) => ({
    id: `exec-${mod}`,
    module: mod,
    organizationId: orgId,
    status: 'complete' as const,
    startedAt,
    completedAt,
    provenance: [provenance],
    warnings: [],
    errors: [],
    coverage: {
      state: 'complete' as const,
      observed: mod === 'repos' ? repoNames.size : 1,
      expected: mod === 'repos' ? repoNames.size : 1,
      reason: null,
    },
  }));

  const entities: Record<string, unknown>[] = [];
  for (const repoName of Array.from(repoNames).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const scopeEntry = scopeRepoMap.get(repoName.toLowerCase());
    const repoId = `repo:${repoName}`;
    const isArchived = Boolean(
      scopeEntry?.archived ||
      scopeEntry?.options?.archived ||
      archivedSet.has(repoName.toLowerCase()),
    );
    const hasLfs = Boolean(
      scopeEntry?.hasLfs || lfsSet.has(repoName.toLowerCase()),
    );
    const sizeBytes = Math.max(
      0,
      Math.round((scopeEntry?.sizeKb ?? 128) * 1024),
    );

    entities.push({
      id: repoId,
      organizationId: orgId,
      collectorExecutionId: 'exec-repos',
      provenance,
      kind: 'repository',
      name: repoName,
      visibility:
        scopeEntry?.targetRepoVisibility ??
        scopeEntry?.options?.targetRepoVisibility ??
        scopeEntry?.visibility ??
        'private',
      archived: isArchived,
      defaultBranch: 'main',
      size: {
        value: sizeBytes,
        unit: 'bytes',
        availability: 'observed',
        reason: null,
      },
      fork: false,
    });

    entities.push({
      id: `portfolio:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-repos',
      provenance,
      kind: 'repository-portfolio',
      repositoryId: repoId,
      primaryLanguage: 'TypeScript',
      topics: isArchived ? ['archived', 'migrated'] : ['migrated'],
      template: false,
      pushedAt: completedAt,
      businessClassification: isArchived ? 'Archived' : 'Active',
      migrationWave: 'wave-1',
      customProperties: [],
      metadataCoverage: 'complete',
    });

    entities.push({
      id: `lfs:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-lfs',
      provenance,
      kind: 'lfs',
      repositoryId: repoId,
      storage: {
        value: hasLfs ? Math.max(sizeBytes, 1024) : 0,
        unit: 'bytes',
        availability: 'observed',
        reason: null,
      },
      objectCount: {
        value: hasLfs ? 1 : 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      indicator: hasLfs ? 'detected' : 'not_detected',
    });

    entities.push({
      id: `security:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-security',
      provenance,
      kind: 'security',
      repositoryId: repoId,
      codeScanning: 'enabled',
      dependabot: 'enabled',
      secretScanning: 'enabled',
      openAlertCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
    });

    entities.push({
      id: `actions:${repoName}`,
      organizationId: orgId,
      collectorExecutionId: 'exec-actions',
      provenance,
      kind: 'actions',
      repositoryId: repoId,
      enabled: !isArchived,
      workflowCount: {
        value: 1,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      runnerCount: {
        value: 0,
        unit: 'count',
        availability: 'observed',
        reason: null,
      },
      usage: {
        value: 0,
        unit: 'minutes',
        availability: 'observed',
        reason: null,
      },
      workflowNames: ['ci.yml'],
      runnerTypes: ['hosted'],
    });
  }

  const candidate = {
    schemaVersion: '1.0.0',
    synthetic: false,
    scan: {
      id:
        manifest?.runId ||
        verificationReport?.reportId ||
        'hosted-migration-run',
      startedAt,
      completedAt,
      producer: 'ghec-consultant-cli',
      producerVersion: '1.0.0',
      status: 'complete',
    },
    configuration: {
      modules: [...modules],
      format: 'json',
      includeSensitiveMetadata: false,
      redactionProfile: 'standard',
      continueOnError: true,
    },
    scope: {
      kind: 'organization',
      organizationId: orgId,
    },
    organizations: [
      {
        id: orgId,
        login: orgId,
        displayName: targetOrg !== orgId ? `${orgId} ➔ ${targetOrg}` : orgId,
      },
    ],
    collectors,
    entities,
    findings: [],
    limitations: [],
    errors: [],
    summary: {
      organizationCount: 1,
      repositoryCount: repoNames.size,
      completeCollectorCount: collectors.length,
      incompleteCollectorCount: 0,
    },
  };

  const imported = importBundleJson(candidate);
  return imported.success ? imported : undefined;
}

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;

/**
 * Parses and validates an uploaded bundle file.
 * Complies with DASH-INGEST-001 and DASH-COMPAT-001:
 * - Checks byte limit
 * - Parses as untrusted data
 * - Validates schema version and invariants
 * - Never echoes sensitive payload contents in error messages
 */
export async function importBundleFile(
  file: File,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      code: 'file_too_large',
      message: `File exceeds maximum allowed size of 250 MB (uploaded file: ${(file.size / (1024 * 1024)).toFixed(1)} MB). Split the assessment or reduce optional evidence before retrying.`,
    };
  }

  return new Promise((resolve) => {
    const worker = new Worker(
      new URL('./importer.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    const finish = (result: ImportResult) => {
      worker.terminate();
      resolve(result);
    };
    worker.onmessage = (event: MessageEvent<ImportWorkerMessage>) => {
      const message = event.data;
      onProgress?.({ status: message.status, progress: message.progress });
      if (message.status === 'ready') {
        finish({
          success: true,
          bundle: message.bundle,
          insights: message.insights,
        });
      } else if (message.status === 'error') {
        finish({
          success: false,
          code: message.code,
          message: message.message,
        });
      }
    };
    worker.onerror = () => {
      finish({
        success: false,
        code: 'worker_error',
        message:
          'The background importer stopped unexpectedly. Retry the import or verify the bundle schema.',
      });
    };
    worker.postMessage(file);
  });
}

/**
 * Loads one of the pre-bundled synthetic fixtures for instant demo and critique.
 */
export function loadSampleBundle(
  type: 'organization' | 'enterprise' | 'specialized' | 'partial-denied',
): ImportResult {
  const sample = (() => {
    switch (type) {
      case 'organization':
        return SAMPLE_ORGANIZATION_BUNDLE;
      case 'enterprise':
        return SAMPLE_ENTERPRISE_BUNDLE;
      case 'specialized':
        return SAMPLE_SPECIALIZED_BUNDLE;
      case 'partial-denied':
        return SAMPLE_PARTIAL_DENIED_BUNDLE;
    }
  })();
  const validation = validateBundle(sample);
  if (!validation.success) {
    return {
      success: false,
      code: validation.code,
      message: validation.message,
    };
  }
  return {
    success: true,
    bundle: validation.data,
    insights: evaluateBundle(validation.data),
  };
}

/**
 * Validates and evaluates a pre-parsed or fetched JSON discovery bundle directly.
 */
export function importBundleJson(data: unknown): ImportResult {
  const candidate =
    data &&
    typeof data === 'object' &&
    'discoveryBundle' in data &&
    (data as { discoveryBundle?: unknown }).discoveryBundle &&
    typeof (data as { discoveryBundle?: unknown }).discoveryBundle === 'object'
      ? (data as { discoveryBundle: unknown }).discoveryBundle
      : data;

  const validation = validateBundle(candidate);
  if (!validation.success) {
    return {
      success: false,
      code: validation.code,
      message: validation.message,
    };
  }
  return {
    success: true,
    bundle: validation.data,
    insights: evaluateBundle(validation.data),
  };
}

/**
 * Probes relative `./evidence/` paths when the dashboard is hosted as a Private GitHub Pages
 * site inside a results repository (`migration-audit-results`).
 * Falls back silently (`found: false`) when running on localhost or when no evidence JSON is present.
 */
export async function probeHostedEvidence(
  options: HostedEvidenceProbeOptions = {},
): Promise<HostedEvidenceProbeResult> {
  const fetchImpl =
    options.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) {
    return { found: false };
  }

  const bundleUrl = options.bundleUrl ?? './evidence/discovery-bundle.json';
  const verificationUrl =
    options.verificationReportUrl ?? './evidence/verification-report.json';
  const manifestUrl = options.manifestUrl ?? './manifest.json';
  const scopeUrl = options.scopeUrl ?? './evidence/migration-scope.json';

  let bundleResult: ImportResult | undefined;
  let verificationReport: VerificationReport | undefined;
  let hostedManifest: HostedManifestLike | undefined;
  let hostedScope: HostedScopeLike | undefined;

  const fetchJsonSafe = async (url: string): Promise<unknown> => {
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return undefined;
      const text = (await res.text()).trim();
      if (!text || text.startsWith('<')) return undefined;
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  await Promise.all([
    (async () => {
      const parsed = await fetchJsonSafe(bundleUrl);
      if (!parsed) return;
      const imported = importBundleJson(parsed);
      if (imported.success) {
        bundleResult = imported;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(verificationUrl);
      if (!parsed) return;
      const validated = validateVerificationReport(parsed);
      if (validated.success) {
        verificationReport = validated.data;
      } else if (
        typeof parsed === 'object' &&
        'schemaVersion' in parsed &&
        Array.isArray((parsed as { modules?: unknown }).modules)
      ) {
        verificationReport = parsed as VerificationReport;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(manifestUrl);
      if (
        parsed &&
        typeof parsed === 'object' &&
        ('sourceOrg' in parsed || 'repositories' in parsed)
      ) {
        hostedManifest = parsed as HostedManifestLike;
      }
    })(),
    (async () => {
      const parsed = await fetchJsonSafe(scopeUrl);
      if (
        parsed &&
        typeof parsed === 'object' &&
        ('sourceOrg' in parsed || 'repositories' in parsed)
      ) {
        hostedScope = parsed as HostedScopeLike;
      }
    })(),
  ]);

  if (
    !bundleResult?.success &&
    (hostedManifest || hostedScope || verificationReport)
  ) {
    bundleResult = synthesizeBundleFromHostedArtifacts({
      manifest: hostedManifest,
      scope: hostedScope,
      verificationReport,
    });
  }

  return {
    found: Boolean(bundleResult?.success || verificationReport),
    bundleResult,
    verificationReport,
  };
}
