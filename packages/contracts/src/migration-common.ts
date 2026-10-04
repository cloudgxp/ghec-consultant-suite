import { z } from 'zod';

/** The only registered reader/writer version for migration artifacts. */
export const MIGRATION_SCHEMA_VERSION = '1.0.0' as const;

export const NonEmptyStringSchema = z.string().trim().min(1).max(256);
export const TimestampSchema = z.string().datetime({ offset: true });
export const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const MigrationModuleIdSchema = z.string().trim().min(1).max(128);
export const MigrationScopeLevelSchema = z.enum(['organization', 'repository']);
export const PlannedOperationTypeSchema = z.enum([
  'create',
  'update',
  'noop',
  'skip',
  'warn',
]);
