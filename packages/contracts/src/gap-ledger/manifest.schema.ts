import { z } from 'zod';
import {
  MIGRATION_SCHEMA_VERSION,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  TimestampSchema,
} from '../migration-common.js';
import { CapabilityGapEntrySchema } from './entry.schema.js';

export const WavePrioritySchema = z.enum(['P1', 'P2', 'P3']);

export const ImplementationRoadmapWaveSchema = z
  .object({
    wave: z.number().int().min(1),
    name: NonEmptyStringSchema,
    priority: WavePrioritySchema,
    moduleIds: z.array(z.string().trim().min(1)),
    rationale: NonEmptyStringSchema,
  })
  .strict();

export const GapSummarySchema = z
  .object({
    totalResources: NonNegativeIntegerSchema,
    implementedCount: NonNegativeIntegerSchema,
    partialCount: NonNegativeIntegerSchema,
    missingCount: NonNegativeIntegerSchema,
    categoryCounts: z.record(z.string(), NonNegativeIntegerSchema),
  })
  .strict();

export const GapLedgerManifestSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION),
    generatedAt: TimestampSchema,
    summary: GapSummarySchema,
    resources: z.array(CapabilityGapEntrySchema),
    waves: z.array(ImplementationRoadmapWaveSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const { totalResources, implementedCount, partialCount, missingCount } =
      manifest.summary;

    if (implementedCount + partialCount + missingCount !== totalResources) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Summary counts (${implementedCount} + ${partialCount} + ${missingCount} = ${
          implementedCount + partialCount + missingCount
        }) do not equal totalResources (${totalResources}).`,
        path: ['summary'],
      });
    }

    if (manifest.resources.length !== totalResources) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Resource list length (${manifest.resources.length}) does not match totalResources (${totalResources}).`,
        path: ['resources'],
      });
    }

    const seenIds = new Set<string>();
    manifest.resources.forEach((entry, idx) => {
      if (seenIds.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate resource ID "${entry.id}" found in gap ledger.`,
          path: ['resources', idx, 'id'],
        });
      }
      seenIds.add(entry.id);
    });
  });
