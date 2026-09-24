import { validateBundle, type DiscoveryBundle } from '@ghec/contracts';
import {
  SAMPLE_ORGANIZATION_BUNDLE,
  SAMPLE_ENTERPRISE_BUNDLE,
} from './samples.js';

export type ImportResult =
  | { success: true; bundle: DiscoveryBundle }
  | { success: false; message: string; code?: string };

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB safeguard

/**
 * Parses and validates an uploaded bundle file.
 * Complies with DASH-INGEST-001 and DASH-COMPAT-001:
 * - Checks byte limit
 * - Parses as untrusted data
 * - Validates schema version and invariants
 * - Never echoes sensitive payload contents in error messages
 */
export async function importBundleFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      code: 'file_too_large',
      message: `File exceeds maximum allowed size of 50 MB (uploaded file: ${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      success: false,
      code: 'read_error',
      message: 'Failed to read local file contents from browser.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      success: false,
      code: 'malformed_json',
      message:
        'Invalid JSON file: file content could not be parsed as valid JSON.',
    };
  }

  const validation = validateBundle(parsed);
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
  };
}

/**
 * Loads one of the pre-bundled synthetic fixtures for instant demo and critique.
 */
export function loadSampleBundle(
  type: 'organization' | 'enterprise',
): ImportResult {
  const sample =
    type === 'organization'
      ? SAMPLE_ORGANIZATION_BUNDLE
      : SAMPLE_ENTERPRISE_BUNDLE;
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
  };
}
