import { randomUUID } from 'node:crypto';
import {
  SEEDER_SCHEMA_VERSION,
  type ExecutionCounts,
  type SeedDispatchRequest,
  type SeedExecutionSummary,
  type SeedItemExecutionResult,
  validateSeedExecutionSummary,
} from '@ghec/contracts';
import { SeederGitHubClient } from './client.js';
import { resolveSeederItems } from './catalog.js';
import { validateTokenPermissions } from './preflight.js';
import { cleanupDemoResources } from './cleanup.js';
import type {
  ItemProvisionContext,
  ItemProvisioner,
  SeederRunOptions,
} from './types.js';

export class SeedingOrchestrator {
  private readonly defaultProvisioners: Map<string, ItemProvisioner>;

  constructor(provisioners: ItemProvisioner[] = []) {
    this.defaultProvisioners = new Map(provisioners.map((p) => [p.id, p]));
  }

  registerProvisioner(provisioner: ItemProvisioner): void {
    this.defaultProvisioners.set(provisioner.id, provisioner);
  }

  async run(
    request: SeedDispatchRequest,
    options: SeederRunOptions = {},
  ): Promise<SeedExecutionSummary> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const runId = `seed-${randomUUID().slice(0, 8)}`;
    const log = options.logger ?? ((msg: string) => console.log(msg));

    const token = process.env.GHEC_TOKEN ?? process.env[request.patSecretName];
    const client =
      options.client ??
      new SeederGitHubClient({
        token,
        dryRun: request.dryRun,
        logger: log,
      });

    const activeProvisioners = options.provisioners ?? this.defaultProvisioners;
    const itemsToProcess = resolveSeederItems(
      request.scopeLevel,
      request.contentType,
    );

    log(
      `[Seeder] Starting run ${runId} for org="${request.organization}" repo="${request.repository ?? '(none)'}" scope="${request.scopeLevel}" (mode: ${request.dryRun ? 'DRY-RUN' : 'LIVE'})`,
    );

    const context: ItemProvisionContext = {
      client,
      organization: request.organization,
      repository: request.repository,
      prefix: request.resourcePrefix,
      dryRun: request.dryRun,
      logger: log,
    };

    const warnings: string[] = [];
    const errors: string[] = [];

    // Pre-flight permissions & organization check
    const preflight = await validateTokenPermissions(
      client,
      request.organization,
    );
    if (!preflight.valid && preflight.error) {
      log(`[Seeder:preflight] ${preflight.error}`);
      warnings.push(`[preflight] ${preflight.error}`);
    } else if (preflight.warning) {
      log(`[Seeder:preflight] ${preflight.warning}`);
      warnings.push(`[preflight] ${preflight.warning}`);
    }

    const counts: ExecutionCounts = {
      total: itemsToProcess.length,
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0,
    };

    // If cleanup requested, execute cleanup in reverse order
    if (request.cleanupExisting) {
      const cleanupRes = await cleanupDemoResources(
        context,
        itemsToProcess,
        activeProvisioners,
      );
      counts.deleted += cleanupRes.deletedCount;
      if (cleanupRes.errors.length > 0) {
        warnings.push(...cleanupRes.errors);
      }
    }

    const itemResults: SeedItemExecutionResult[] = [];

    for (const item of itemsToProcess) {
      const provisioner = activeProvisioners.get(item.id);
      const itemStart = Date.now();

      if (!provisioner) {
        const durationMs = Date.now() - itemStart;
        counts.skipped++;
        const warnMsg = `No provisioner registered for module ${item.id}; skipped.`;
        warnings.push(warnMsg);
        itemResults.push({
          itemId: item.id,
          itemName: item.name,
          scope: item.scopeLevel,
          action: 'skipped',
          durationMs,
          resourceIdentifier: item.id,
          warning: warnMsg,
        });
        continue;
      }

      try {
        const res = await provisioner.provision(context);
        const durationMs = Date.now() - itemStart;

        if (res.action === 'created' || res.action === 'dry-run-create')
          counts.created++;
        else if (res.action === 'updated' || res.action === 'dry-run-update')
          counts.updated++;
        else if (res.action === 'deleted') counts.deleted++;
        else if (res.action === 'skipped' || res.action === 'dry-run-skip')
          counts.skipped++;
        else if (res.action === 'failed') counts.failed++;

        if (res.warning) warnings.push(`[${item.id}] ${res.warning}`);
        if (res.error) errors.push(`[${item.id}] ${res.error}`);

        itemResults.push({
          itemId: item.id,
          itemName: item.name,
          scope: item.scopeLevel,
          action: res.action,
          durationMs,
          resourceIdentifier: res.resourceIdentifier,
          details: res.details ?? null,
          warning: res.warning ?? null,
          error: res.error ?? null,
        });
      } catch (err: unknown) {
        const durationMs = Date.now() - itemStart;
        counts.failed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`[${item.id}] ${errorMsg}`);

        itemResults.push({
          itemId: item.id,
          itemName: item.name,
          scope: item.scopeLevel,
          action: 'failed',
          durationMs,
          resourceIdentifier: item.id,
          error: errorMsg,
        });
      }
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    const summary: SeedExecutionSummary = {
      schemaVersion: SEEDER_SCHEMA_VERSION,
      runId,
      organization: request.organization,
      repository: request.repository ?? null,
      scopeLevel: request.scopeLevel,
      contentType: request.contentType,
      dryRun: request.dryRun,
      cleanupExisting: request.cleanupExisting,
      startedAt,
      completedAt,
      totalDurationMs,
      counts,
      items: itemResults,
      warnings,
      errors,
    };

    return validateSeedExecutionSummary(summary);
  }
}
