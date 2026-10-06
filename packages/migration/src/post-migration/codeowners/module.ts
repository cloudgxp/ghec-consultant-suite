import { MIGRATION_SCHEMA_VERSION } from '@ghec/contracts';
import type { MigrationModule } from '../../core/module.js';
import type {
  MigrationContext,
  MigrationScopeLevel,
  ModuleExecutionResult,
  ModulePlan,
  ModuleVerificationResult,
  OperationExecutionResult,
  PlannedOperation,
  VerificationDiscrepancy,
} from '../../core/types.js';
import { applyFileRepair } from './git-committer.js';
import { rewriteTeamReferences } from './rewriter.js';
import { scanCodeownersCandidates } from './scanner.js';
import type {
  CodeownersData,
  CodeownersFileDiff,
  CodeownersModuleOptions,
} from './types.js';

export class CodeownersRepairModule implements MigrationModule<CodeownersData> {
  readonly id = 'post-migration-codeowners';
  readonly displayName = 'CODEOWNERS & Team References Repair';
  readonly scopeLevel: MigrationScopeLevel = 'repository';
  readonly dependencies: readonly string[] = ['gei-repo'];

  constructor(private readonly options: CodeownersModuleOptions = {}) {}

  async discover(ctx: MigrationContext): Promise<CodeownersData> {
    const sourceRepo = ctx.scope.sourceRepo ?? '';
    const files = await scanCodeownersCandidates(
      ctx,
      ctx.scope.sourceOrg,
      sourceRepo,
    );

    return {
      repository: sourceRepo,
      defaultBranch: this.options.defaultBranch ?? 'main',
      files,
    };
  }

  async plan(
    ctx: MigrationContext,
    sourceData: CodeownersData,
  ): Promise<ModulePlan> {
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const targetOrg = ctx.scope.targetOrg;
    const sourceOrg = ctx.scope.sourceOrg;

    // Scan target repository candidates (reconciling post-GEI state)
    const targetFiles = await scanCodeownersCandidates(
      ctx,
      targetOrg,
      targetRepo,
    );

    const candidateFiles =
      targetFiles.length > 0 ? targetFiles : (sourceData?.files ?? []);

    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    for (const file of candidateFiles) {
      const diff = rewriteTeamReferences(
        file,
        sourceOrg,
        targetOrg,
        this.options.teamSlugMap,
      );

      const opType = diff.hasChanges ? 'update' : 'noop';
      if (diff.hasChanges) {
        warnings.push(
          `Repaired ${diff.matches.length} team reference(s) in ${diff.path}`,
        );
      }

      operations.push({
        id: `codeowners:${targetRepo}:${diff.path}`,
        resourceType: 'codeowners-file',
        resourceName: diff.path,
        operation: opType,
        sourceState: { path: diff.path, matches: diff.matches },
        destinationCurrentState: {
          path: file.path,
          hasSourceRefs: diff.hasChanges,
        },
        payload: diff,
      });
    }

    return {
      moduleId: this.id,
      scopeLevel: this.scopeLevel,
      targetIdentifier: `${targetOrg}/${targetRepo}`,
      operations,
      warnings,
    };
  }

  async apply(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleExecutionResult> {
    if (!ctx.targetWriteClient && !ctx.dryRun) {
      throw new Error(
        'TargetWriteClient must be provided in MigrationContext to apply mutations.',
      );
    }

    const startedAt = Date.now();
    const results: OperationExecutionResult[] = [];
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';

    for (const operation of plan.operations) {
      const diff = operation.payload as CodeownersFileDiff | undefined;
      const completedAt = new Date().toISOString();

      if (operation.operation === 'noop' || !diff || !diff.hasChanges) {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          completedAt,
        });
        continue;
      }

      if (ctx.dryRun) {
        results.push({
          operationId: operation.id,
          status: 'succeeded',
          httpStatus: 200,
          completedAt,
        });
        continue;
      }

      const applyRes = await applyFileRepair(
        ctx,
        targetOrg,
        targetRepo,
        diff,
        this.options,
      );

      results.push({
        operationId: operation.id,
        status: applyRes.status,
        httpStatus: applyRes.httpStatus,
        error: applyRes.error,
        completedAt,
      });
    }

    const isFailed = results.some((r) => r.status === 'failed');

    return {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      moduleId: this.id,
      status: isFailed ? 'failed' : 'complete',
      results,
      durationMs: Date.now() - startedAt,
    };
  }

  async verify(
    ctx: MigrationContext,
    plan: ModulePlan,
  ): Promise<ModuleVerificationResult> {
    const targetOrg = ctx.scope.targetOrg;
    const targetRepo = ctx.scope.targetRepo ?? ctx.scope.sourceRepo ?? '';
    const sourceOrg = ctx.scope.sourceOrg;
    const sourceOrgPattern = new RegExp(`@${sourceOrg}/`, 'i');

    const targetFiles = await scanCodeownersCandidates(
      ctx,
      targetOrg,
      targetRepo,
    );

    const discrepancies: VerificationDiscrepancy[] = [];

    for (const op of plan.operations) {
      const diff = op.payload as CodeownersFileDiff | undefined;
      if (!diff || !diff.hasChanges) {
        continue;
      }

      const currentFile = targetFiles.find((f) => f.path === diff.path);
      if (!currentFile) {
        discrepancies.push({
          resourceName: diff.path,
          expected: 'repaired file present on target',
          actual: 'file missing',
          message: `Target file ${diff.path} was not found during verification.`,
        });
        continue;
      }

      if (sourceOrgPattern.test(currentFile.decodedContent)) {
        discrepancies.push({
          resourceName: diff.path,
          expected: `zero references to @${sourceOrg}/`,
          actual: 'untranslated source team references remain',
          message: `File ${diff.path} still contains untranslated source team references.`,
        });
      }
    }

    return {
      moduleId: this.id,
      verified: discrepancies.length === 0,
      discrepancies,
    };
  }
}
