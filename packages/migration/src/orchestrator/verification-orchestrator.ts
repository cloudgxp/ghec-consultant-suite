import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, basename, join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationPlan,
  type MigrationScope,
  type ModulePlan,
  type ModuleVerificationResult,
  type VerificationDiscrepancy,
  type VerificationReport,
  validateMigrationPlan,
  validateVerificationReport,
} from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import { ModuleRegistry } from '../core/registry.js';
import type {
  MigrationContext,
  MigrationScopeTarget,
  StructuredLogger,
} from '../core/types.js';
import type {
  VerificationOrchestratorOptions,
  VerificationOrchestratorResult,
} from './types.js';

const defaultLogger: StructuredLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class VerificationOrchestrator {
  private readonly registry: ModuleRegistry;
  private readonly targetClient: GitHubReadAdapter;
  private readonly sourceClient?: GitHubReadAdapter | undefined;
  private readonly plan: MigrationPlan;
  private readonly scope?: MigrationScope | undefined;
  private readonly runId: string;
  private readonly logger: StructuredLogger;
  private readonly signal: AbortSignal;

  constructor(options: VerificationOrchestratorOptions) {
    const planValidation = validateMigrationPlan(options.plan);
    if (!planValidation.success) {
      throw new Error(
        `Invalid migration plan: ${planValidation.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    this.plan = planValidation.data;
    this.registry = options.registry;
    this.targetClient = options.targetClient;
    this.sourceClient = options.sourceClient;
    this.scope = options.scope;
    this.runId =
      options.runId ?? `verify-${Date.now()}-${randomBytes(4).toString('hex')}`;
    this.logger = options.logger ?? defaultLogger;
    this.signal = options.signal ?? new AbortController().signal;
  }

  async run(): Promise<VerificationOrchestratorResult> {
    if (this.signal.aborted) {
      throw this.signal.reason ?? new Error('Verification aborted');
    }

    const aggregatedByModuleId = new Map<
      string,
      { verified: boolean; discrepancies: VerificationDiscrepancy[] }
    >();

    for (const modulePlan of this.plan.modules) {
      if (this.signal.aborted) {
        throw this.signal.reason ?? new Error('Verification aborted');
      }

      const mod = this.registry.getOrThrow(modulePlan.moduleId);
      const scopeTarget = this.resolveScopeTarget(modulePlan);

      const ctx: MigrationContext = {
        runId: this.runId,
        scope: scopeTarget,
        sourceClient: this.sourceClient ?? this.targetClient,
        targetClient: this.targetClient,
        signal: this.signal,
        dryRun: true,
        continueOnError: true,
        logger: this.logger,
      };

      this.logger.info(
        `Verifying module "${modulePlan.moduleId}" on target "${modulePlan.targetIdentifier}"`,
      );
      const res = await mod.verify(ctx, modulePlan);

      let existing = aggregatedByModuleId.get(modulePlan.moduleId);
      if (!existing) {
        existing = { verified: true, discrepancies: [] };
        aggregatedByModuleId.set(modulePlan.moduleId, existing);
      }

      if (!res.verified) {
        existing.verified = false;
      }
      for (const disc of res.discrepancies) {
        existing.discrepancies.push(disc);
      }
    }

    const moduleResults: ModuleVerificationResult[] = [];
    let verifiedCount = 0;
    let discrepancyTotal = 0;

    for (const [moduleId, agg] of aggregatedByModuleId.entries()) {
      const isVerified = agg.verified && agg.discrepancies.length === 0;
      if (isVerified) {
        verifiedCount++;
      }
      discrepancyTotal += agg.discrepancies.length;

      moduleResults.push({
        moduleId: moduleId as ModuleVerificationResult['moduleId'],
        verified: isVerified,
        discrepancies: agg.discrepancies,
      });
    }

    const unverifiedCount = moduleResults.length - verifiedCount;

    // Resolve sourceOrg and targetOrg from scope or fallback
    const sourceOrg =
      this.scope?.organizations[0]?.source ??
      this.scope?.repositories[0]?.sourceOrg ??
      'source-org';
    const targetOrg =
      this.scope?.organizations[0]?.target ??
      this.scope?.repositories[0]?.targetOrg ??
      'target-org';

    const report: VerificationReport = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      reportId: this.runId,
      verifiedAt: new Date().toISOString(),
      scopeName: this.plan.scopeName,
      sourceOrg,
      targetOrg,
      modules: moduleResults,
      summary: {
        verifiedModuleCount: verifiedCount,
        unverifiedModuleCount: unverifiedCount,
        discrepancyCount: discrepancyTotal,
      },
    };

    const validatedReport = validateVerificationReport(report);
    if (!validatedReport.success) {
      throw new Error(
        `Generated verification report failed validation: ${validatedReport.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    const exitCode: 0 | 1 =
      unverifiedCount === 0 && discrepancyTotal === 0 ? 0 : 1;

    return {
      report: validatedReport.data,
      exitCode,
    };
  }

  private resolveScopeTarget(modulePlan: ModulePlan): MigrationScopeTarget {
    const targetId = modulePlan.targetIdentifier;
    if (targetId.includes('/')) {
      const [targetOrg, targetRepo] = targetId.split('/');
      const repoMapping = this.scope?.repositories.find(
        (r) => r.targetOrg === targetOrg && r.targetRepo === targetRepo,
      );
      return {
        level: 'repository',
        sourceOrg: repoMapping?.sourceOrg ?? targetOrg!,
        targetOrg: targetOrg!,
        sourceRepo: repoMapping?.sourceRepo ?? targetRepo!,
        targetRepo: targetRepo!,
      };
    }

    const orgMapping = this.scope?.organizations.find(
      (o) => o.target === targetId,
    );
    return {
      level: 'organization',
      sourceOrg: orgMapping?.source ?? targetId,
      targetOrg: targetId,
    };
  }
}

export function writeVerificationReportFile(
  filePath: string,
  report: VerificationReport,
  options: { overwrite?: boolean } = {},
): string {
  if (existsSync(filePath) && !options.overwrite) {
    throw new Error(
      `Verification report file "${filePath}" already exists. Set overwrite: true or specify a unique path.`,
    );
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const tempPath = join(
    dir,
    `.${basename(filePath)}.tmp.${Date.now()}.${randomBytes(4).toString('hex')}`,
  );
  writeFileSync(tempPath, JSON.stringify(report, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(tempPath, filePath);
  return filePath;
}
