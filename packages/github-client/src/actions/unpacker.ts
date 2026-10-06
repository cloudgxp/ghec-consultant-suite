import * as fflate from 'fflate';
import type { WaveRunArtifacts } from './types.js';

export function unpackArtifactZipBuffer(
  buffer: Uint8Array | ArrayBuffer,
): WaveRunArtifacts {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const decompressed = fflate.unzipSync(uint8);

  const rawFiles: Record<string, unknown> = {};
  const cohorts: unknown[] = [];
  let plan: unknown | undefined;
  let verification: unknown | undefined;
  let preflight: unknown | undefined;

  for (const [filename, fileBytes] of Object.entries(decompressed)) {
    if (filename.endsWith('.json')) {
      try {
        const text = fflate.strFromU8(fileBytes);
        const parsed = JSON.parse(text);
        rawFiles[filename] = parsed;

        if (filename === 'migration-plan.json') {
          plan = parsed;
        } else if (filename === 'verification-report.json') {
          verification = parsed;
        } else if (
          filename === 'test-preflight-report.json' ||
          filename === 'preflight-report.json'
        ) {
          preflight = parsed;
        } else if (filename.startsWith('cohort-report-')) {
          cohorts.push(parsed);
        }
      } catch {
        rawFiles[filename] = null;
      }
    }
  }

  return {
    rawFiles,
    plan,
    verification,
    cohorts,
    preflight,
  };
}
