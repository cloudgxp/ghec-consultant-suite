import type { ItemProvisionContext, ItemProvisioner } from './types.js';
import type { SeedItemDefinition } from '@ghec/contracts';

export interface CleanupResult {
  readonly deletedCount: number;
  readonly errors: readonly string[];
}

export async function cleanupDemoResources(
  ctx: ItemProvisionContext,
  items: SeedItemDefinition[],
  provisioners: Map<string, ItemProvisioner>,
): Promise<CleanupResult> {
  const log = ctx.logger;
  let deletedCount = 0;
  const errors: string[] = [];

  log(
    `[Seeder:cleanup] Starting cleanup for prefix "${ctx.prefix}" in org "${ctx.organization}"...`,
  );

  // Reverse topological order: delete dependents before prerequisites
  const reversed = [...items].reverse();

  for (const item of reversed) {
    const prov = provisioners.get(item.id);
    if (!prov?.cleanup) continue;

    try {
      await prov.cleanup(ctx);
      deletedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[cleanup:${item.id}] ${msg}`);
      log(`[Seeder:cleanup] Warning during cleanup of ${item.id}: ${msg}`);
    }
  }

  log(
    `[Seeder:cleanup] Completed cleanup: ${deletedCount} item cleanup routines executed.`,
  );
  return { deletedCount, errors };
}
