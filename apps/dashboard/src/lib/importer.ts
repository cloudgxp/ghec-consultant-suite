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
}

export interface HostedEvidenceProbeResult {
  readonly found: boolean;
  readonly bundleResult?: ImportResult | undefined;
  readonly verificationReport?: VerificationReport | undefined;
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

  let bundleResult: ImportResult | undefined;
  let verificationReport: VerificationReport | undefined;

  await Promise.all([
    (async () => {
      try {
        const res = await fetchImpl(bundleUrl, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const text = (await res.text()).trim();
        if (!text || text.startsWith('<')) return;
        const parsed: unknown = JSON.parse(text);
        const imported = importBundleJson(parsed);
        if (imported.success) {
          bundleResult = imported;
        }
      } catch {
        // Ignore missing or non-JSON responses in local dev mode
      }
    })(),
    (async () => {
      try {
        const res = await fetchImpl(verificationUrl, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const text = (await res.text()).trim();
        if (!text || text.startsWith('<')) return;
        const parsed: unknown = JSON.parse(text);
        const validated = validateVerificationReport(parsed);
        if (validated.success) {
          verificationReport = validated.data;
        } else if (
          parsed &&
          typeof parsed === 'object' &&
          'schemaVersion' in parsed &&
          Array.isArray((parsed as { modules?: unknown }).modules)
        ) {
          verificationReport = parsed as VerificationReport;
        }
      } catch {
        // Ignore missing verification report
      }
    })(),
  ]);

  return {
    found: Boolean(bundleResult?.success || verificationReport),
    bundleResult,
    verificationReport,
  };
}
