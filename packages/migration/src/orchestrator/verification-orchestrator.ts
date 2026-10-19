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
import { buildOrganizationScopeTarget } from '../core/org-item-filter.js';
import {
  VERIFY_READ_ERROR_PREFIX,
  formatSanitizedReadError,
} from '../core/read-error-classifier.js';
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
  private readonly sandboxRehearsal: boolean;
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
    this.sandboxRehearsal = Boolean(
      options.sandboxRehearsal ||
      options.scope?.sandboxRehearsal ||
      this.plan.sandboxRehearsal,
    );
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
      {
        verified: boolean;
        discrepancies: VerificationDiscrepancy[];
        warnings: string[];
      }
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
        ...(this.sandboxRehearsal || scopeTarget.sandboxRehearsal
          ? { sandboxRehearsal: true }
          : {}),
        logger: this.logger,
      };

      this.logger.info(
        `Verifying module "${modulePlan.moduleId}" on target "${modulePlan.targetIdentifier}"`,
      );

      const allPlanWarnings = modulePlan.warnings ?? [];
      const planReadErrorWarnings = allPlanWarnings.filter((w) =>
        w.startsWith(VERIFY_READ_ERROR_PREFIX),
      );
      const nonReadErrorWarnings = allPlanWarnings.filter(
        (w) => !w.startsWith(VERIFY_READ_ERROR_PREFIX),
      );

      for (const w of nonReadErrorWarnings) {
        this.logger.warn(
          `Plan warning for module "${modulePlan.moduleId}" on "${modulePlan.targetIdentifier}": ${w}`,
        );
      }

      let res: ModuleVerificationResult;
      try {
        res = await mod.verify(ctx, modulePlan);
      } catch (err: unknown) {
        if (this.signal.aborted) {
          throw this.signal.reason ?? err;
        }
        const sanitizedMsg = formatSanitizedReadError(
          `verify() for module "${modulePlan.moduleId}" on "${modulePlan.targetIdentifier}"`,
          err,
        );
        this.logger.error(sanitizedMsg);
        res = {
          moduleId: modulePlan.moduleId,
          verified: false,
          discrepancies: [
            {
              resourceName: modulePlan.targetIdentifier || modulePlan.moduleId,
              expected: 'verifiable source and target state',
              actual: 'read_error',
              message: sanitizedMsg,
            },
          ],
        };
      }

      if (planReadErrorWarnings.length > 0) {
        const readErrorDiscrepancies: VerificationDiscrepancy[] =
          planReadErrorWarnings.map((w) => ({
            resourceName: modulePlan.targetIdentifier || modulePlan.moduleId,
            expected: 'verifiable source and target state',
            actual: 'read_error',
            message: w,
          }));
        res = {
          ...res,
          verified: false,
          discrepancies: [...readErrorDiscrepancies, ...res.discrepancies],
        };
      }

      let existing = aggregatedByModuleId.get(modulePlan.moduleId);
      if (!existing) {
        existing = { verified: true, discrepancies: [], warnings: [] };
        aggregatedByModuleId.set(modulePlan.moduleId, existing);
      }

      for (const w of allPlanWarnings) {
        const prefixedWarning = modulePlan.targetIdentifier
          ? `[${modulePlan.targetIdentifier}] ${w}`
          : w;
        if (!existing.warnings.includes(prefixedWarning)) {
          existing.warnings.push(prefixedWarning);
        }
      }

      if (!res.verified) {
        existing.verified = false;
      }
      for (const disc of res.discrepancies) {
        const repoName =
          scopeTarget.level === 'repository'
            ? scopeTarget.targetRepo
            : undefined;
        const shouldPrefix =
          Boolean(repoName) &&
          disc.resourceName !== repoName &&
          !disc.resourceName.startsWith(`${repoName}:`) &&
          !disc.resourceName.startsWith(`${scopeTarget.targetOrg}/${repoName}`);
        existing.discrepancies.push(
          shouldPrefix
            ? {
                ...disc,
                resourceName: `${repoName}:${disc.resourceName}`,
              }
            : disc,
        );
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
        ...(agg.warnings.length > 0 ? { warnings: agg.warnings } : {}),
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
      const sourceOrg = repoMapping?.sourceOrg ?? targetOrg!;
      const sourceRepo = repoMapping?.sourceRepo ?? targetRepo!;
      const repoKey = `${sourceOrg}/${sourceRepo}`;
      const baseRepoOptions =
        repoMapping?.options ??
        this.scope?.repositoryOptions?.[repoKey] ??
        this.scope?.repositoryOptions?.[sourceRepo] ??
        (repoMapping?.skipReleases !== undefined ||
        repoMapping?.lfsStrategy !== undefined ||
        repoMapping?.targetRepoVisibility !== undefined ||
        repoMapping?.gitTransferStrategy !== undefined ||
        repoMapping?.mirrorPushMode !== undefined ||
        repoMapping?.sandboxRehearsal !== undefined
          ? {
              skipReleases: repoMapping.skipReleases,
              lfsStrategy: repoMapping.lfsStrategy,
              targetRepoVisibility: repoMapping.targetRepoVisibility,
              gitTransferStrategy: repoMapping.gitTransferStrategy,
              mirrorPushMode: repoMapping.mirrorPushMode,
              sandboxRehearsal: repoMapping.sandboxRehearsal,
            }
          : undefined);
      const effectiveMirrorPushMode =
        baseRepoOptions?.mirrorPushMode ??
        repoMapping?.mirrorPushMode ??
        this.scope?.mirrorPushMode;
      const repoOptions =
        effectiveMirrorPushMode !== undefined
          ? { ...baseRepoOptions, mirrorPushMode: effectiveMirrorPushMode }
          : baseRepoOptions;

      const matchingOrg =
        this.scope?.organizations.find(
          (o) => o.source === sourceOrg && o.target === targetOrg,
        ) ?? this.scope?.organizations.find((o) => o.target === targetOrg);
      const effectiveTargetType =
        matchingOrg?.targetType ??
        this.scope?.targetType ??
        (this.scope?.identityMapping?.strategy === 'pass-through'
          ? 'ghec'
          : 'emu');
      const effectiveSandboxRehearsal = Boolean(
        this.sandboxRehearsal ||
        repoMapping?.sandboxRehearsal ||
        repoOptions?.sandboxRehearsal ||
        matchingOrg?.sandboxRehearsal ||
        this.scope?.sandboxRehearsal,
      );

      return {
        level: 'repository',
        sourceOrg,
        targetOrg: targetOrg!,
        sourceRepo,
        targetRepo: targetRepo!,
        targetType: effectiveTargetType,
        identityMapping: this.scope?.identityMapping,
        ...(effectiveSandboxRehearsal ? { sandboxRehearsal: true } : {}),
        options: repoOptions,
      };
    }

    const orgMapping =
      (modulePlan.sourceIdentifier
        ? this.scope?.organizations.find(
            (o) =>
              o.source === modulePlan.sourceIdentifier && o.target === targetId,
          )
        : undefined) ??
      this.scope?.organizations.find((o) => o.target === targetId);

    return buildOrganizationScopeTarget(this.scope, {
      source: modulePlan.sourceIdentifier ?? orgMapping?.source ?? targetId,
      target: targetId,
      targetType: orgMapping?.targetType,
      orgItemsMode: orgMapping?.orgItemsMode,
      sandboxRehearsal:
        this.sandboxRehearsal || orgMapping?.sandboxRehearsal || undefined,
    });
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
