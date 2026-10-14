import type { z } from 'zod';
import {
  CapabilityGapEntrySchema,
  ResourceCategorySchema,
  MigrationMechanismSchema,
  ImplementationStatusSchema,
  SecretHandlingStrategySchema,
  EmuConstraintTypeSchema,
  EmuGovernanceConstraintSchema,
} from './entry.schema.js';
import {
  ModuleDecompositionBlueprintSchema,
  DiscrepancySeveritySchema,
} from './blueprint.schema.js';
import {
  GapLedgerManifestSchema,
  GapSummarySchema,
  ImplementationRoadmapWaveSchema,
  WavePrioritySchema,
} from './manifest.schema.js';
import type {
  CapabilityGapEntry,
  ModuleDecompositionBlueprint,
  GapLedgerManifest,
} from './types.js';

export * from './types.js';
export * from './boundary-matrix.js';
export * from './catalog.js';
export * from './emu-constraints.js';
export * from './roadmap.js';
export * from './generator.js';
export {
  CapabilityGapEntrySchema,
  ResourceCategorySchema,
  MigrationMechanismSchema,
  ImplementationStatusSchema,
  SecretHandlingStrategySchema,
  EmuConstraintTypeSchema,
  EmuGovernanceConstraintSchema,
  ModuleDecompositionBlueprintSchema,
  DiscrepancySeveritySchema,
  GapLedgerManifestSchema,
  GapSummarySchema,
  ImplementationRoadmapWaveSchema,
  WavePrioritySchema,
};

export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: z.ZodError };

/**
 * Validates a raw object against the GapLedgerManifestSchema.
 */
export function validateGapLedger(
  data: unknown,
): ValidationResult<GapLedgerManifest> {
  const result = GapLedgerManifestSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as GapLedgerManifest };
  }
  return { success: false, error: result.error };
}

/**
 * Validates a raw object against the ModuleDecompositionBlueprintSchema.
 */
export function validateModuleBlueprint(
  data: unknown,
): ValidationResult<ModuleDecompositionBlueprint> {
  const result = ModuleDecompositionBlueprintSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as ModuleDecompositionBlueprint };
  }
  return { success: false, error: result.error };
}

/**
 * Validates a raw object against the CapabilityGapEntrySchema.
 */
export function validateCapabilityGapEntry(
  data: unknown,
): ValidationResult<CapabilityGapEntry> {
  const result = CapabilityGapEntrySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as CapabilityGapEntry };
  }
  return { success: false, error: result.error };
}
