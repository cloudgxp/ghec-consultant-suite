import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';
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
  const validation = validateBundle(data);
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
