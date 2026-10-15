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
import { fetchFileContent, scanCodeownersCandidates } from './scanner.js';
import type {
  CodeownersData,
  CodeownersFileCandidate,
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

    let candidateFiles: readonly CodeownersFileCandidate[];
    if (sourceData?.files && sourceData.files.length > 0) {
      const resolvedFiles: CodeownersFileCandidate[] = [];
      for (const srcFile of sourceData.files) {
        const previewDiff = rewriteTeamReferences(
          srcFile,
          sourceOrg,
          targetOrg,
          this.options.teamSlugMap,
        );
        if (previewDiff.hasChanges) {
          const targetFile = await fetchFileContent(
            ctx,
            targetOrg,
            targetRepo,
            srcFile.path,
          );
          resolvedFiles.push(targetFile ?? srcFile);
        } else {
          resolvedFiles.push(srcFile);
        }
      }
      candidateFiles = resolvedFiles;
    } else {
      const targetFiles = await scanCodeownersCandidates(
        ctx,
        targetOrg,
        targetRepo,
      );
      candidateFiles =
        targetFiles.length > 0 ? targetFiles : (sourceData?.files ?? []);
    }

    const operations: PlannedOperation[] = [];
    const warnings: string[] = [];

    for (const file of candidateFiles) {
      const diff = rewriteTeamReferences(
        file,
        sourceOrg,
        targetOrg,
        this.options.teamSlugMap,
      );

      const isCodeownersFile = /(^|\/)CODEOWNERS$/i.test(diff.path);
      const hasTeamRefs =
        diff.hasChanges ||
        /@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/.test(file.decodedContent);
      if (!isCodeownersFile && !hasTeamRefs) {
        continue;
      }

      const opType = diff.hasChanges ? 'update' : 'noop';
      if (diff.hasChanges) {
        warnings.push(
          `Repaired ${diff.matches.length} team reference(s) in ${diff.path}`,
        );
      }

      const resourceType = isCodeownersFile
        ? 'codeowners-file'
        : diff.path.startsWith('.github/workflows/')
          ? 'workflow-team-ref'
          : 'issue-template-team-ref';
      const reason = diff.hasChanges
        ? `Rewrote ${diff.matches.length} team reference(s) in ${diff.path}`
        : `Team ownership references in ${diff.path} already match target organization`;

      operations.push({
        id: `codeowners:${targetRepo}:${diff.path}`,
        resourceType,
        resourceName: diff.path,
        operation: opType,
        reason,
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
      status: isFailed
        ? 'failed'
        : results.length === 0
          ? 'skipped'
          : 'complete',
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

    const discrepancies: VerificationDiscrepancy[] = [];

    for (const op of plan.operations) {
      const diff = op.payload as CodeownersFileDiff | undefined;
      if (!diff || !diff.hasChanges) {
        continue;
      }

      const currentFile = await fetchFileContent(
        ctx,
        targetOrg,
        targetRepo,
        diff.path,
      );
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
