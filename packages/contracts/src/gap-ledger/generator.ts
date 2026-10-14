import type {
  CapabilityGapEntry,
  GapLedgerManifest,
  GapSummary,
  ImplementationRoadmapWave,
} from './types.js';
import { GAP_LEDGER_CATALOG } from './catalog.js';
import { DEFAULT_ROADMAP_WAVES } from './roadmap.js';
import { validateGapLedger } from './index.js';

export interface GapLedgerGeneratorOptions {
  readonly catalog?: readonly CapabilityGapEntry[];
  readonly waves?: readonly ImplementationRoadmapWave[];
  readonly generatedAt?: string;
}

/**
 * Computes statistical summaries from a capability catalog.
 */
export function computeGapSummary(
  catalog: readonly CapabilityGapEntry[],
): GapSummary {
  let implementedCount = 0;
  let partialCount = 0;
  let missingCount = 0;
  const categoryCounts: Record<string, number> = {};

  for (const entry of catalog) {
    if (entry.status === 'implemented') {
      implementedCount++;
    } else if (entry.status === 'partial') {
      partialCount++;
    } else if (entry.status === 'missing') {
      missingCount++;
    }

    categoryCounts[entry.category] = (categoryCounts[entry.category] ?? 0) + 1;
  }

  return {
    totalResources: catalog.length,
    implementedCount,
    partialCount,
    missingCount,
    categoryCounts,
  };
}

/**
 * Generates an authoritative, schema-validated GapLedgerManifest.
 */
export function generateGapLedgerManifest(
  options: GapLedgerGeneratorOptions = {},
): GapLedgerManifest {
  const catalog = options.catalog ?? GAP_LEDGER_CATALOG;
  const waves = options.waves ?? DEFAULT_ROADMAP_WAVES;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const summary = computeGapSummary(catalog);

  const manifest: GapLedgerManifest = {
    schemaVersion: '1.0.0',
    generatedAt,
    summary,
    resources: catalog,
    waves,
  };

  const validation = validateGapLedger(manifest);
  if (!validation.success) {
    throw new Error(
      `Generated GapLedgerManifest failed schema validation: ${validation.error.message}`,
    );
  }

  return validation.data;
}
