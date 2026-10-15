import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  type MigrationPlan,
  type MigrationResultsManifest,
  type MigrationResultsSummary,
  type MigrationScope,
  type ModuleExecutionResult,
  type OperationExecutionResult,
  type OrgModuleResultSummary,
  type PlannedOperation,
  type RepoModuleResultSummary,
  type RepositoryMigrationRecord,
  type VerificationReport,
  validateMigrationResultsManifest,
} from '@ghec/contracts';
import { ALL_ORGANIZATION_MODULES } from '../orchestrator/module-resolver.js';
import type {
  MigrationExecutionReport,
  RepositoryPipelineResult,
} from '../orchestrator/types.js';
import {
  type GranularMigrationItemRow,
  type OrgModuleDetailModel,
  type RepositoryDiscrepancyDetail,
  type RepositoryFailureDetails,
  type RepositoryModuleDetailModel,
  type RepositorySuccessDetails,
  formatFailureRepoMarkdown,
  formatOrgModuleDetailMarkdown,
  formatRepoModuleDetailMarkdown,
  formatResultsReadmeMarkdown,
  formatSuccessRepoMarkdown,
  isSecretResource,
} from './results-markdown-formatter.js';

export interface RemediationPlanLike {
  readonly actions?:
    | readonly {
        readonly id?: string | undefined;
        readonly moduleId?: string | undefined;
        readonly resourceName?: string | undefined;
        readonly description?: string | undefined;
        readonly command?: string | undefined;
        readonly severity?: string | undefined;
      }[]
    | undefined;
}

export interface GenerateResultsOptions {
  readonly runId?: string | undefined;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly targetResultsRepo?: string | undefined;
  readonly executionMode: 'dry-run' | 'live';
  readonly executionReport?: MigrationExecutionReport | undefined;
  readonly verificationReport?: VerificationReport | undefined;
  readonly remediationPlan?: RemediationPlanLike | undefined;
  readonly scope?: MigrationScope | undefined;
  readonly plan?: MigrationPlan | undefined;
  readonly pipelineResults?: readonly RepositoryPipelineResult[] | undefined;
  readonly repositoryRecords?: readonly RepositoryMigrationRecord[] | undefined;
  readonly durationMs?: number | undefined;
  readonly generatedAt?: string | undefined;
  readonly nextSteps?: readonly string[] | undefined;
}

export interface GeneratedResults {
  readonly manifest: MigrationResultsManifest;
  readonly files: Record<string, string>;
}

const KNOWN_ORG_MODULE_IDS = new Set<string>([
  ...ALL_ORGANIZATION_MODULES,
  'custom-properties',
  'rulesets-org',
  'org-custom-roles',
  'org-projects-v2',
  'actions-secrets',
  'mannequins',
]);

const DEFAULT_RESOURCE_TYPE_BY_MODULE: Readonly<Record<string, string>> = {
  teams: 'team',
  'org-variables': 'org-variable',
  'org-secrets': 'org-secret',
  'actions-secrets': 'org-secret',
  'org-custom-properties': 'custom-property-definition',
  'custom-properties': 'custom-property-definition',
  'post-migration-mannequins': 'mannequin',
  mannequins: 'mannequin',
  packages: 'package',
  'custom-roles': 'custom-role',
  'org-custom-roles': 'custom-role',
  'org-settings': 'org-setting',
  'actions-policies': 'actions-policy',
  'actions-runners': 'actions-runner',
  'ip-allow-lists': 'ip-allow-list-entry',
  'apps-inventory': 'github-app-installation',
  'projects-v2': 'project-v2',
  'org-projects-v2': 'project-v2',
  'rulesets-org': 'org-ruleset',
  'org-rulesets': 'org-ruleset',
  'org-webhooks': 'org-webhook',
  'gei-repo': 'repository',
  'repo-variables': 'repo-variable',
  'repo-secrets': 'repo-secret',
  environments: 'environment',
  webhooks: 'webhook',
  'repo-settings': 'repo-setting',
  'repo-custom-properties': 'repo-custom-property',
  rulesets: 'ruleset',
  'branch-protection': 'branch-protection',
  'post-migration-codeowners': 'codeowners',
  codeowners: 'codeowners',
  'post-migration-security': 'security-policy',
  security: 'security-policy',
  releases: 'release',
  'deploy-keys': 'deploy-key',
  collaborators: 'collaborator',
  lfs: 'lfs-object',
  issues: 'issue',
  'pull-requests': 'pull-request',
  autolinks: 'autolink',
  discussions: 'discussion',
};

function inferDefaultResourceType(moduleId: string): string {
  return DEFAULT_RESOURCE_TYPE_BY_MODULE[moduleId] ?? moduleId;
}

function getCanonicalOperationDedupKey(op: OperationExecutionResult): string {
  if (op.resourceType && op.resourceName) {
    return `${(op.targetIdentifier ?? '').toLowerCase()}::${op.resourceType.toLowerCase()}::${op.resourceName.toLowerCase()}`;
  }
  return op.operationId.replace(
    /:(create|update|noop|skip|warn)(-org|-repo)?:/i,
    ':op$2:',
  );
}

/**
 * Deduplicates OperationExecutionResult items by canonical resource key or operationId
 * across multiple runs (e.g. pre-cohort, cohort, post-cohort reconcile, or remediation),
 * ensuring 'succeeded' results supersede 'skipped' or 'failed' results, and preserving
 * active 'create'/'update' operations over subsequent 'noop' reconciliation checks.
 */
function deduplicateOperationResults(
  ops: readonly OperationExecutionResult[],
): OperationExecutionResult[] {
  const byKey = new Map<string, OperationExecutionResult>();
  for (const op of ops) {
    if (
      op.operationId.startsWith('op-autolink-noop-empty-') ||
      op.reason === 'No autolinks defined on source repository'
    ) {
      continue;
    }
    if (
      op.operationId.startsWith('codeowners:') &&
      op.operationType === 'noop' &&
      !op.reason &&
      op.resourceType === 'codeowners-file' &&
      Boolean(op.resourceName) &&
      !/(^|\/)CODEOWNERS$/i.test(op.resourceName ?? '')
    ) {
      continue;
    }
    const key = getCanonicalOperationDedupKey(op);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, op);
      continue;
    }
    if (op.status === 'succeeded' && existing.status !== 'succeeded') {
      byKey.set(key, op);
      continue;
    }
    if (existing.status === 'succeeded' && op.status !== 'succeeded') {
      continue;
    }
    if (existing.status === 'succeeded' && op.status === 'succeeded') {
      const existingAct =
        existing.operationType === 'create' ||
        existing.operationType === 'update';
      const incomingNoop = op.operationType === 'noop';
      if (existingAct && incomingNoop) {
        continue;
      }
      byKey.set(key, op);
      continue;
    }
    if (op.status === 'skipped' && existing.status === 'failed') {
      byKey.set(key, op);
    } else {
      byKey.set(key, op);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Determines whether a ModuleExecutionResult (or moduleId) represents an organization-scoped module.
 */
export function isOrganizationScopedModuleResult(
  modResult: {
    readonly moduleId: string;
    readonly scopeLevel?: 'organization' | 'repository' | undefined;
    readonly targetIdentifier?: string | undefined;
    readonly results?: readonly OperationExecutionResult[] | undefined;
  },
  context: {
    readonly sourceOrg: string;
    readonly targetOrg: string;
    readonly knownRepoNames: ReadonlySet<string>;
  },
): boolean {
  if (modResult.scopeLevel === 'organization') {
    return true;
  }
  if (modResult.scopeLevel === 'repository') {
    return false;
  }

  const { moduleId } = modResult;
  if (KNOWN_ORG_MODULE_IDS.has(moduleId) || moduleId.startsWith('org-')) {
    return true;
  }

  if (moduleId === 'rulesets') {
    if (modResult.targetIdentifier) {
      const targetId = modResult.targetIdentifier;
      if (
        !targetId.includes('/') &&
        (targetId.toLowerCase() === context.targetOrg.toLowerCase() ||
          targetId.toLowerCase() === context.sourceOrg.toLowerCase()) &&
        !context.knownRepoNames.has(targetId.toLowerCase())
      ) {
        return true;
      }
      if (targetId.includes('/')) {
        return false;
      }
    }
    if (modResult.results && modResult.results.length > 0) {
      const hasOrgOp = modResult.results.some(
        (op) =>
          op.resourceType === 'org-ruleset' ||
          op.operationId.includes('-org:') ||
          op.operationId.startsWith('org-ruleset'),
      );
      if (hasOrgOp) {
        return true;
      }
    }
  }

  return false;
}

function inferOperationType(
  operationId: string,
  status: 'succeeded' | 'failed' | 'skipped',
): 'create' | 'update' | 'noop' | 'skip' | 'warn' {
  const lower = operationId.toLowerCase();
  if (lower.includes(':update') || lower.startsWith('update-')) {
    return 'update';
  }
  if (lower.includes(':noop') || lower.startsWith('noop-')) {
    return 'noop';
  }
  if (lower.includes(':warn') || lower.startsWith('warn-')) {
    return 'warn';
  }
  if (
    lower.includes(':skip') ||
    lower.startsWith('skip-') ||
    status === 'skipped'
  ) {
    return 'skip';
  }
  return 'create';
}

function parseResourceNameFromOperationId(
  operationId: string,
  moduleId: string,
  knownSkipTokens: ReadonlySet<string>,
): string {
  if (!operationId.includes(':')) {
    const prefix = `${moduleId}-`;
    if (operationId.startsWith(prefix) && operationId.length > prefix.length) {
      return operationId.slice(prefix.length);
    }
    return operationId;
  }

  const parts = operationId
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean);
  const filtered = parts.filter((part, idx) => {
    const lower = part.toLowerCase();
    if (idx === 0 && lower === moduleId.toLowerCase()) {
      return false;
    }
    if (
      idx <= 2 &&
      (lower === 'create' ||
        lower === 'update' ||
        lower === 'noop' ||
        lower === 'skip' ||
        lower === 'warn' ||
        lower === 'create-org' ||
        lower === 'update-org' ||
        lower === 'noop-org' ||
        lower === 'skip-org' ||
        lower === 'create-repo' ||
        lower === 'update-repo' ||
        lower === 'noop-repo' ||
        lower === 'skip-repo' ||
        lower === 'migrate' ||
        lower === 'transfer')
    ) {
      return false;
    }
    if (idx <= 2 && knownSkipTokens.has(lower)) {
      return false;
    }
    return true;
  });

  if (filtered.length > 0) {
    return filtered.join(':');
  }
  return parts[parts.length - 1] ?? operationId;
}

function stripRepoPrefix(
  resourceName: string,
  repoNames: readonly string[],
): string {
  for (const repo of repoNames) {
    if (!repo) continue;
    for (const sep of [':', '/']) {
      const prefix = `${repo}${sep}`;
      if (resourceName.toLowerCase().startsWith(prefix.toLowerCase())) {
        return resourceName.slice(prefix.length);
      }
    }
  }
  return resourceName;
}

function formatStateValue(val: unknown): string {
  if (typeof val === 'string') {
    return val;
  }
  return JSON.stringify(val);
}

function buildGranularItemsForModule(params: {
  readonly moduleId: string;
  readonly operations: readonly OperationExecutionResult[];
  readonly discrepancies: readonly RepositoryDiscrepancyDetail[];
  readonly isModuleVerified: boolean;
  readonly planOpsById: ReadonlyMap<string, PlannedOperation>;
  readonly knownSkipTokens: ReadonlySet<string>;
  readonly repoNames: readonly string[];
}): GranularMigrationItemRow[] {
  const {
    moduleId,
    operations,
    discrepancies,
    isModuleVerified,
    planOpsById,
    knownSkipTokens,
    repoNames,
  } = params;

  const matchedDiscrepancyIndices = new Set<number>();
  const rows: GranularMigrationItemRow[] = [];

  for (const op of operations) {
    const planned = planOpsById.get(op.operationId);
    const rawResourceName =
      op.resourceName ??
      planned?.resourceName ??
      parseResourceNameFromOperationId(
        op.operationId,
        moduleId,
        knownSkipTokens,
      );
    const resourceName = stripRepoPrefix(rawResourceName, repoNames);
    const resourceType =
      op.resourceType ??
      planned?.resourceType ??
      inferDefaultResourceType(moduleId);
    const operationType =
      op.operationType ??
      planned?.operation ??
      inferOperationType(op.operationId, op.status);
    const secretFlag = isSecretResource(moduleId, resourceType);

    let matchedDisc: RepositoryDiscrepancyDetail | undefined;
    for (const [idx, disc] of discrepancies.entries()) {
      const strippedDiscName = stripRepoPrefix(disc.resourceName, repoNames);
      if (
        strippedDiscName.toLowerCase() === resourceName.toLowerCase() ||
        disc.resourceName.toLowerCase() === rawResourceName.toLowerCase()
      ) {
        matchedDisc = disc;
        matchedDiscrepancyIndices.add(idx);
        break;
      }
    }

    const verificationStatus: 'verified' | 'discrepancy' | 'not-verified' =
      matchedDisc
        ? 'discrepancy'
        : isModuleVerified && op.status === 'succeeded'
          ? 'verified'
          : 'not-verified';

    const noteParts: string[] = [];
    if (op.error) {
      noteParts.push(op.error);
    }
    const reason = op.reason ?? planned?.reason;
    if (reason && !op.error) {
      const isPreApplyAbsenceOrDriftReason =
        op.status === 'succeeded' &&
        !matchedDisc &&
        (operationType === 'create' || operationType === 'update') &&
        /\b(is missing|does not exist|differ(?:s)?|not found on target|missing in destination)\b/i.test(
          reason,
        );
      if (isPreApplyAbsenceOrDriftReason) {
        if (secretFlag) {
          noteParts.push('[SEALED] Write-only secret placeholder');
        } else {
          noteParts.push(
            operationType === 'create'
              ? verificationStatus === 'verified'
                ? 'Created and verified on target.'
                : 'Created on target.'
              : verificationStatus === 'verified'
                ? 'Updated and verified on target.'
                : 'Updated on target.',
          );
        }
      } else {
        noteParts.push(reason);
      }
    }
    if (matchedDisc) {
      noteParts.push(
        `${matchedDisc.message} (expected: ${formatStateValue(matchedDisc.expected)}, actual: ${formatStateValue(matchedDisc.actual)})`,
      );
    }
    if (noteParts.length === 0 && secretFlag) {
      noteParts.push('[SEALED] Write-only secret placeholder');
    } else if (noteParts.length === 0 && op.status === 'succeeded') {
      if (operationType === 'noop') {
        noteParts.push(
          verificationStatus === 'verified'
            ? 'Configuration already matches target; verified parity.'
            : 'Configuration already matches target; no changes required.',
        );
      } else if (operationType === 'create') {
        noteParts.push(
          verificationStatus === 'verified'
            ? 'Created and verified on target.'
            : 'Created on target.',
        );
      } else if (operationType === 'update') {
        noteParts.push(
          verificationStatus === 'verified'
            ? 'Updated and verified on target.'
            : 'Updated on target.',
        );
      } else if (op.httpStatus !== undefined) {
        noteParts.push(`HTTP ${op.httpStatus}`);
      }
    } else if (noteParts.length === 0 && op.httpStatus !== undefined) {
      noteParts.push(`HTTP ${op.httpStatus}`);
    }

    rows.push({
      resourceName,
      resourceType,
      operationType,
      status: op.status,
      ...(op.completedAt ? { completedAt: op.completedAt } : {}),
      verificationStatus,
      ...(noteParts.length > 0 ? { notes: noteParts.join(' — ') } : {}),
      isSecret: secretFlag,
    });
  }

  // Append any discrepancies that were not matched to an execution operation
  for (const [idx, disc] of discrepancies.entries()) {
    if (matchedDiscrepancyIndices.has(idx)) {
      continue;
    }
    const resourceName = stripRepoPrefix(disc.resourceName, repoNames);
    const resourceType = inferDefaultResourceType(moduleId);
    const secretFlag = isSecretResource(moduleId, resourceType);

    rows.push({
      resourceName,
      resourceType,
      operationType: 'verify',
      status: 'failed',
      verificationStatus: 'discrepancy',
      notes: `${disc.message} (expected: ${formatStateValue(disc.expected)}, actual: ${formatStateValue(disc.actual)})`,
      isSecret: secretFlag,
    });
  }

  return rows;
}

function deriveModuleStatus(
  results: readonly OperationExecutionResult[],
  discrepancyCount: number,
  explicitStatus?: 'complete' | 'partial' | 'failed' | 'skipped',
): 'complete' | 'partial' | 'failed' | 'skipped' {
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const succeededCount = results.filter((r) => r.status === 'succeeded').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  if (
    explicitStatus === 'failed' ||
    (failedCount > 0 && succeededCount === 0)
  ) {
    return 'failed';
  }
  if (failedCount > 0 || discrepancyCount > 0 || explicitStatus === 'partial') {
    return succeededCount > 0 ? 'partial' : 'failed';
  }
  if (
    explicitStatus === 'skipped' ||
    (results.length === 0 && discrepancyCount === 0) ||
    (results.length > 0 && skippedCount === results.length)
  ) {
    return 'skipped';
  }
  return explicitStatus ?? 'complete';
}

/**
 * Compiles migration execution outputs, verification results, and remediation actions
 * into a complete 3-tier MigrationResultsManifest and GFM markdown file map.
 */
export function generateMigrationResults(
  options: GenerateResultsOptions,
): GeneratedResults {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const runId =
    options.runId ?? options.executionReport?.planId ?? `run-${Date.now()}`;
  const targetResultsRepo =
    options.targetResultsRepo ?? 'migration-audit-results';

  // Build lookup structures from scope and plan
  const repoSourceToTarget = new Map<string, string>();
  const repoTargetToSource = new Map<string, string>();
  const knownRepoNames = new Set<string>();

  if (options.scope?.repositories) {
    for (const r of options.scope.repositories) {
      repoSourceToTarget.set(r.sourceRepo.toLowerCase(), r.targetRepo);
      repoSourceToTarget.set(r.targetRepo.toLowerCase(), r.targetRepo);
      repoSourceToTarget.set(
        `${r.sourceOrg}/${r.sourceRepo}`.toLowerCase(),
        r.targetRepo,
      );
      repoSourceToTarget.set(
        `${r.targetOrg}/${r.targetRepo}`.toLowerCase(),
        r.targetRepo,
      );
      repoTargetToSource.set(r.targetRepo.toLowerCase(), r.sourceRepo);
      knownRepoNames.add(r.sourceRepo.toLowerCase());
      knownRepoNames.add(r.targetRepo.toLowerCase());
    }
  }

  if (options.pipelineResults) {
    for (const pr of options.pipelineResults) {
      repoSourceToTarget.set(pr.sourceRepo.toLowerCase(), pr.targetRepo);
      repoSourceToTarget.set(pr.targetRepo.toLowerCase(), pr.targetRepo);
      repoTargetToSource.set(pr.targetRepo.toLowerCase(), pr.sourceRepo);
      knownRepoNames.add(pr.sourceRepo.toLowerCase());
      knownRepoNames.add(pr.targetRepo.toLowerCase());
    }
  }

  if (options.repositoryRecords) {
    for (const rr of options.repositoryRecords) {
      repoSourceToTarget.set(rr.sourceRepo.toLowerCase(), rr.targetRepo);
      repoSourceToTarget.set(rr.targetRepo.toLowerCase(), rr.targetRepo);
      repoTargetToSource.set(rr.targetRepo.toLowerCase(), rr.sourceRepo);
      knownRepoNames.add(rr.sourceRepo.toLowerCase());
      knownRepoNames.add(rr.targetRepo.toLowerCase());
    }
  }

  const planOpsById = new Map<string, PlannedOperation>();
  const planTargetByOpId = new Map<string, string>();
  const planScopeByOpId = new Map<string, 'organization' | 'repository'>();
  if (options.plan?.modules) {
    for (const mp of options.plan.modules) {
      for (const op of mp.operations) {
        planOpsById.set(op.id, op);
        planTargetByOpId.set(op.id, mp.targetIdentifier);
        planScopeByOpId.set(op.id, mp.scopeLevel);
      }
    }
  }

  const resolveCanonicalTargetRepo = (
    rawIdentifier?: string | undefined,
  ): string | undefined => {
    if (!rawIdentifier) return undefined;
    const trimmed = rawIdentifier.trim();
    const direct = repoSourceToTarget.get(trimmed.toLowerCase());
    if (direct) return direct;

    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      const repoPart = parts[parts.length - 1]!;
      const mapped = repoSourceToTarget.get(repoPart.toLowerCase());
      if (mapped) return mapped;
      return repoPart;
    }

    if (
      trimmed.toLowerCase() !== options.sourceOrg.toLowerCase() &&
      trimmed.toLowerCase() !== options.targetOrg.toLowerCase()
    ) {
      return trimmed;
    }
    return undefined;
  };

  // Verified module lookup from VerificationReport
  const verifiedModulesSet = new Set<string>();
  const orgDiscrepanciesByModule = new Map<
    string,
    RepositoryDiscrepancyDetail[]
  >();
  const repoDiscrepancies = new Map<string, RepositoryDiscrepancyDetail[]>();
  const repoModuleDiscrepancies = new Map<
    string,
    RepositoryDiscrepancyDetail[]
  >();
  const orgWarningsByModule = new Map<string, string[]>();
  const repoWarnings = new Map<string, string[]>();
  const repoModuleWarnings = new Map<string, string[]>();

  if (options.verificationReport?.modules) {
    for (const mod of options.verificationReport.modules) {
      if (mod.verified) {
        verifiedModulesSet.add(mod.moduleId);
      }
      const isOrgMod = isOrganizationScopedModuleResult(
        { moduleId: mod.moduleId },
        {
          sourceOrg: options.sourceOrg,
          targetOrg: options.targetOrg,
          knownRepoNames,
        },
      );

      if (mod.warnings && mod.warnings.length > 0) {
        if (isOrgMod) {
          const existing = orgWarningsByModule.get(mod.moduleId) ?? [];
          for (const w of mod.warnings) {
            if (!existing.includes(w)) {
              existing.push(w);
            }
          }
          orgWarningsByModule.set(mod.moduleId, existing);
        } else {
          for (const w of mod.warnings) {
            const bracketMatch = /^\[([^\]]+)\]\s*(.*)$/.exec(w);
            const prefixCandidate = bracketMatch?.[1];
            const cleanWarning = bracketMatch?.[2] || w;
            const matchedTargetRepo = prefixCandidate
              ? (resolveCanonicalTargetRepo(prefixCandidate) ?? prefixCandidate)
              : options.scope?.repositories.length === 1
                ? options.scope.repositories[0]!.targetRepo
                : undefined;
            if (matchedTargetRepo) {
              const rWarns = repoWarnings.get(matchedTargetRepo) ?? [];
              if (!rWarns.includes(cleanWarning)) {
                rWarns.push(cleanWarning);
              }
              repoWarnings.set(matchedTargetRepo, rWarns);

              const modKey = `${matchedTargetRepo}::${mod.moduleId}`;
              const mWarns = repoModuleWarnings.get(modKey) ?? [];
              if (!mWarns.includes(cleanWarning)) {
                mWarns.push(cleanWarning);
              }
              repoModuleWarnings.set(modKey, mWarns);
            }
          }
        }
      }

      for (const disc of mod.discrepancies) {
        const detail: RepositoryDiscrepancyDetail = {
          moduleId: mod.moduleId,
          resourceName: disc.resourceName,
          expected: disc.expected,
          actual: disc.actual,
          message: disc.message,
        };

        const colonIdx = disc.resourceName.indexOf(':');
        const slashIdx = disc.resourceName.indexOf('/');
        const splitIdx =
          colonIdx !== -1 && slashIdx !== -1
            ? Math.min(colonIdx, slashIdx)
            : colonIdx !== -1
              ? colonIdx
              : slashIdx;

        const prefixCandidate =
          splitIdx !== -1
            ? disc.resourceName.slice(0, splitIdx)
            : disc.resourceName;

        const matchedTargetRepo =
          repoSourceToTarget.get(prefixCandidate.toLowerCase()) ??
          (!isOrgMod && splitIdx !== -1 ? prefixCandidate : undefined) ??
          (!isOrgMod && options.scope?.repositories.length === 1
            ? options.scope.repositories[0]!.targetRepo
            : undefined);

        if (isOrgMod && !matchedTargetRepo) {
          const list = orgDiscrepanciesByModule.get(mod.moduleId) ?? [];
          list.push(detail);
          orgDiscrepanciesByModule.set(mod.moduleId, list);
        } else {
          const repoKey = matchedTargetRepo ?? prefixCandidate;
          const existing = repoDiscrepancies.get(repoKey) ?? [];
          existing.push(detail);
          repoDiscrepancies.set(repoKey, existing);

          const modKey = `${repoKey}::${mod.moduleId}`;
          const modList = repoModuleDiscrepancies.get(modKey) ?? [];
          modList.push(detail);
          repoModuleDiscrepancies.set(modKey, modList);
        }
      }
    }
  }

  // Correlate Remediation Commands per repository
  const repoRemediationCommands = new Map<string, string[]>();
  if (options.remediationPlan?.actions) {
    for (const action of options.remediationPlan.actions) {
      if (action.command && action.resourceName) {
        const colonIdx = action.resourceName.indexOf(':');
        const rawPrefix =
          colonIdx !== -1
            ? action.resourceName.slice(0, colonIdx)
            : action.resourceName;
        const repoKey =
          repoSourceToTarget.get(rawPrefix.toLowerCase()) ?? rawPrefix;
        const cmds = repoRemediationCommands.get(repoKey) ?? [];
        if (!cmds.includes(action.command)) {
          cmds.push(action.command);
        }
        repoRemediationCommands.set(repoKey, cmds);
      }
    }
  }

  // 1. Partition Execution Report Results into Org Modules vs Per-Repo Modules
  const orgExecResultsByModule = new Map<string, ModuleExecutionResult[]>();
  const repoExecResultsByRepo = new Map<
    string,
    Map<string, ModuleExecutionResult[]>
  >();

  const recordRepoModuleExec = (
    targetRepo: string,
    modResult: ModuleExecutionResult,
  ): void => {
    knownRepoNames.add(targetRepo.toLowerCase());
    if (!repoSourceToTarget.has(targetRepo.toLowerCase())) {
      repoSourceToTarget.set(targetRepo.toLowerCase(), targetRepo);
    }
    let modMap = repoExecResultsByRepo.get(targetRepo);
    if (!modMap) {
      modMap = new Map<string, ModuleExecutionResult[]>();
      repoExecResultsByRepo.set(targetRepo, modMap);
    }
    const list = modMap.get(modResult.moduleId) ?? [];
    list.push(modResult);
    modMap.set(modResult.moduleId, list);
  };

  if (options.executionReport?.results) {
    for (const modResult of options.executionReport.results) {
      const firstOpId = modResult.results[0]?.operationId;
      const effectiveScopeLevel =
        modResult.scopeLevel ??
        (firstOpId ? planScopeByOpId.get(firstOpId) : undefined);
      const effectiveTargetId =
        modResult.targetIdentifier ??
        modResult.results.find((r) => r.targetIdentifier)?.targetIdentifier ??
        (firstOpId ? planTargetByOpId.get(firstOpId) : undefined);

      const isOrg = isOrganizationScopedModuleResult(
        {
          ...modResult,
          scopeLevel: effectiveScopeLevel,
          targetIdentifier: effectiveTargetId,
        },
        {
          sourceOrg: options.sourceOrg,
          targetOrg: options.targetOrg,
          knownRepoNames,
        },
      );

      if (isOrg) {
        const list = orgExecResultsByModule.get(modResult.moduleId) ?? [];
        list.push(modResult);
        orgExecResultsByModule.set(modResult.moduleId, list);
      } else {
        let targetRepo = resolveCanonicalTargetRepo(effectiveTargetId);
        if (!targetRepo) {
          // Try matching operationId tokens against known repositories
          for (const op of modResult.results) {
            const tokens = op.operationId.toLowerCase().split(/[:/]/);
            for (const token of tokens) {
              const mapped = repoSourceToTarget.get(token);
              if (mapped) {
                targetRepo = mapped;
                break;
              }
            }
            if (targetRepo) break;
          }
        }
        if (!targetRepo && options.scope?.repositories.length === 1) {
          targetRepo = options.scope.repositories[0]!.targetRepo;
        }
        if (targetRepo) {
          recordRepoModuleExec(targetRepo, modResult);
        }
      }
    }
  }

  if (options.pipelineResults) {
    for (const pipeResult of options.pipelineResults) {
      for (const modResult of pipeResult.moduleResults) {
        if (
          isOrganizationScopedModuleResult(modResult, {
            sourceOrg: options.sourceOrg,
            targetOrg: options.targetOrg,
            knownRepoNames,
          })
        ) {
          const list = orgExecResultsByModule.get(modResult.moduleId) ?? [];
          list.push(modResult);
          orgExecResultsByModule.set(modResult.moduleId, list);
        } else {
          recordRepoModuleExec(pipeResult.targetRepo, modResult);
        }
      }
    }
  }

  // Also include any organization module that had verification discrepancies without execution results
  for (const moduleId of orgDiscrepanciesByModule.keys()) {
    if (!orgExecResultsByModule.has(moduleId)) {
      orgExecResultsByModule.set(moduleId, []);
    }
  }

  // 2. Build Org Modules Summary & Tier 2 Organization Module Detail Models
  const orgModulesSummary: Record<string, OrgModuleResultSummary> = {};
  const orgModuleDetailModels = new Map<string, OrgModuleDetailModel>();
  const orgSkipTokens = new Set<string>([
    options.sourceOrg.toLowerCase(),
    options.targetOrg.toLowerCase(),
  ]);

  for (const [moduleId, modExecList] of orgExecResultsByModule.entries()) {
    const discrepancies = orgDiscrepanciesByModule.get(moduleId) ?? [];
    const rawDedupedOps = deduplicateOperationResults(
      modExecList.flatMap((m) => m.results),
    );
    const isVerifiedClean =
      verifiedModulesSet.has(moduleId) && discrepancies.length === 0;
    const allOps = isVerifiedClean
      ? rawDedupedOps.map((o) =>
          o.status === 'failed'
            ? { ...o, status: 'succeeded' as const, error: undefined }
            : o,
        )
      : rawDedupedOps;
    const total = allOps.length;
    const succeeded = allOps.filter(
      (o: OperationExecutionResult) => o.status === 'succeeded',
    ).length;
    const failed = allOps.filter(
      (o: OperationExecutionResult) => o.status === 'failed',
    ).length;
    const skipped = allOps.filter(
      (o: OperationExecutionResult) => o.status === 'skipped',
    ).length;
    const durationMs = modExecList.reduce(
      (acc, m) => acc + (m.durationMs || 0),
      0,
    );
    const rawExplicitStatus =
      modExecList.length > 0
        ? modExecList[modExecList.length - 1]!.status
        : undefined;
    const explicitStatus =
      isVerifiedClean &&
      (rawExplicitStatus === 'partial' || rawExplicitStatus === 'failed')
        ? 'complete'
        : rawExplicitStatus;
    const status = deriveModuleStatus(
      allOps,
      discrepancies.length,
      explicitStatus,
    );
    const relativeFilePath = `organization/${moduleId}.md`;
    const firstFailedOp = allOps.find((o) => o.status === 'failed' && o.error);

    const summaryEntry: OrgModuleResultSummary = {
      status,
      totalOperations: total,
      succeededOperations: succeeded,
      failedOperations: failed,
      skippedOperations: skipped,
      discrepancyCount: discrepancies.length,
      durationMs,
      relativeFilePath,
      ...(firstFailedOp?.error ? { error: firstFailedOp.error } : {}),
    };
    orgModulesSummary[moduleId] = summaryEntry;

    const items = buildGranularItemsForModule({
      moduleId,
      operations: allOps,
      discrepancies,
      isModuleVerified: isVerifiedClean,
      planOpsById,
      knownSkipTokens: orgSkipTokens,
      repoNames: [options.sourceOrg, options.targetOrg],
    });

    const orgModWarnings = orgWarningsByModule.get(moduleId);
    orgModuleDetailModels.set(moduleId, {
      moduleId,
      sourceOrg: options.sourceOrg,
      targetOrg: options.targetOrg,
      summary: summaryEntry,
      items,
      discrepancies,
      ...(orgModWarnings && orgModWarnings.length > 0
        ? { warnings: orgModWarnings }
        : {}),
    });
  }

  // 3. Construct RepositoryMigrationRecords & Per-Repository Module Summaries
  const repositories: RepositoryMigrationRecord[] = [];
  const repoSuccessDetails = new Map<string, RepositorySuccessDetails>();
  const repoFailureDetails = new Map<string, RepositoryFailureDetails>();
  const repoModuleDetailModels = new Map<string, RepositoryModuleDetailModel>();

  const buildRepoModuleSummariesAndModels = (params: {
    readonly sourceRepo: string;
    readonly targetRepo: string;
    readonly repoStatus: 'succeeded' | 'failed';
    readonly defaultDurationMs: number;
    readonly geiMigrationId?: string | undefined;
    readonly repoError?: string | undefined;
  }): Record<string, RepoModuleResultSummary> => {
    const {
      sourceRepo,
      targetRepo,
      repoStatus,
      defaultDurationMs,
      geiMigrationId,
      repoError,
    } = params;

    const modExecMap =
      repoExecResultsByRepo.get(targetRepo) ??
      new Map<string, ModuleExecutionResult[]>();

    // Ensure any module with verification discrepancies for this repo is represented
    const allRepoDiscs =
      repoDiscrepancies.get(targetRepo) ??
      repoDiscrepancies.get(sourceRepo) ??
      [];
    for (const disc of allRepoDiscs) {
      if (disc.moduleId && !modExecMap.has(disc.moduleId)) {
        modExecMap.set(disc.moduleId, []);
      }
    }

    // Find earliest operation completedAt across all modules for this repository
    let earliestRepoOpCompletedAt: string | undefined;
    for (const execList of modExecMap.values()) {
      for (const m of execList) {
        for (const op of m.results) {
          if (
            op.completedAt &&
            (!earliestRepoOpCompletedAt ||
              op.completedAt < earliestRepoOpCompletedAt)
          ) {
            earliestRepoOpCompletedAt = op.completedAt;
          }
        }
      }
    }
    const fallbackRepoCompletedAt =
      earliestRepoOpCompletedAt ??
      options.executionReport?.executedAt ??
      generatedAt;

    // Synthesize gei-repo module entry if no repository modules were explicitly recorded
    // or if geiMigrationId is present without a gei-repo module entry
    if (
      (modExecMap.size === 0 || geiMigrationId !== undefined) &&
      !modExecMap.has('gei-repo')
    ) {
      const geiFailed =
        repoStatus === 'failed' &&
        Boolean(repoError) &&
        allRepoDiscs.length === 0;
      const syntheticGeiResult: ModuleExecutionResult = {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: 'gei-repo',
        status: geiFailed ? 'failed' : 'complete',
        durationMs: defaultDurationMs,
        targetIdentifier: `${options.targetOrg}/${targetRepo}`,
        scopeLevel: 'repository',
        results: [
          {
            operationId: `gei-repo:transfer:${targetRepo}`,
            status: geiFailed ? 'failed' : 'succeeded',
            ...(geiFailed && repoError
              ? { error: repoError.slice(0, 2048) }
              : {}),
            completedAt: fallbackRepoCompletedAt,
            resourceType: 'repository',
            resourceName: targetRepo,
            operationType: 'create',
            reason: geiMigrationId
              ? `GEI Migration ID: ${geiMigrationId}`
              : 'Core Git repository transfer',
            targetIdentifier: `${options.targetOrg}/${targetRepo}`,
          },
        ],
      };
      modExecMap.set('gei-repo', [syntheticGeiResult]);
    }

    const moduleSummaries: Record<string, RepoModuleResultSummary> = {};
    const repoSkipTokens = new Set<string>([
      options.sourceOrg.toLowerCase(),
      options.targetOrg.toLowerCase(),
      sourceRepo.toLowerCase(),
      targetRepo.toLowerCase(),
    ]);

    for (const [moduleId, execList] of modExecMap.entries()) {
      let allOps = deduplicateOperationResults(
        execList.flatMap((m) => m.results),
      );
      if (moduleId === 'gei-repo' && allOps.length === 0) {
        const geiFailed =
          execList.every((m) => m.status === 'failed') ||
          (repoStatus === 'failed' &&
            Boolean(repoError) &&
            allRepoDiscs.length === 0);
        const alreadyPresent =
          execList.length > 0 && !geiMigrationId && !geiFailed;
        allOps = [
          {
            operationId: alreadyPresent
              ? `gei-repo:noop:${targetRepo}`
              : `gei-repo:transfer:${targetRepo}`,
            status: geiFailed ? 'failed' : 'succeeded',
            ...(geiFailed && repoError
              ? { error: repoError.slice(0, 2048) }
              : {}),
            completedAt: fallbackRepoCompletedAt,
            resourceType: 'repository',
            resourceName: targetRepo,
            operationType: alreadyPresent ? 'noop' : 'create',
            reason: geiMigrationId
              ? `GEI Migration ID: ${geiMigrationId}`
              : alreadyPresent
                ? 'Target repository already exists on destination; verified parity.'
                : 'Core Git repository transfer',
            targetIdentifier: `${options.targetOrg}/${targetRepo}`,
          },
        ];
      }
      const modDiscs = [
        ...(repoModuleDiscrepancies.get(`${targetRepo}::${moduleId}`) ?? []),
        ...(sourceRepo !== targetRepo
          ? (repoModuleDiscrepancies.get(`${sourceRepo}::${moduleId}`) ?? [])
          : []),
      ];
      const modWarns = [
        ...(repoModuleWarnings.get(`${targetRepo}::${moduleId}`) ?? []),
        ...(sourceRepo !== targetRepo
          ? (repoModuleWarnings.get(`${sourceRepo}::${moduleId}`) ?? [])
          : []),
      ];
      const isModVerifiedClean =
        verifiedModulesSet.has(moduleId) && modDiscs.length === 0;
      if (isModVerifiedClean) {
        allOps = allOps.map((o) =>
          o.status === 'failed'
            ? { ...o, status: 'succeeded' as const, error: undefined }
            : o,
        );
      }

      const total = allOps.length;
      const succeeded = allOps.filter((o) => o.status === 'succeeded').length;
      const failed = allOps.filter((o) => o.status === 'failed').length;
      const skipped = allOps.filter((o) => o.status === 'skipped').length;
      const durationMs = execList.reduce(
        (acc, m) => acc + (m.durationMs || 0),
        0,
      );
      const rawExplicitStatus =
        execList.length > 0 ? execList[execList.length - 1]!.status : undefined;
      const explicitStatus =
        isModVerifiedClean &&
        (rawExplicitStatus === 'partial' || rawExplicitStatus === 'failed')
          ? 'complete'
          : rawExplicitStatus === 'partial' && failed === 0 && succeeded > 0
            ? 'complete'
            : rawExplicitStatus;
      const status = deriveModuleStatus(
        allOps,
        modDiscs.length,
        explicitStatus,
      );
      const relativeFilePath = `repositories/${targetRepo}/${moduleId}.md`;
      const firstFailedOp = allOps.find(
        (o) => o.status === 'failed' && o.error,
      );

      const summaryEntry: RepoModuleResultSummary = {
        moduleId,
        status,
        totalOperations: total,
        succeededOperations: succeeded,
        failedOperations: failed,
        skippedOperations: skipped,
        discrepancyCount: modDiscs.length,
        durationMs,
        relativeFilePath,
        ...(firstFailedOp?.error ? { error: firstFailedOp.error } : {}),
      };

      moduleSummaries[moduleId] = summaryEntry;

      const items = buildGranularItemsForModule({
        moduleId,
        operations: allOps,
        discrepancies: modDiscs,
        isModuleVerified:
          (verifiedModulesSet.has(moduleId) || repoStatus === 'succeeded') &&
          modDiscs.length === 0,
        planOpsById,
        knownSkipTokens: repoSkipTokens,
        repoNames: [
          sourceRepo,
          targetRepo,
          `${options.sourceOrg}/${sourceRepo}`,
          `${options.targetOrg}/${targetRepo}`,
        ],
      });

      repoModuleDetailModels.set(relativeFilePath, {
        moduleId,
        sourceRepo,
        targetRepo,
        repoStatus,
        summary: summaryEntry,
        items,
        discrepancies: modDiscs,
        ...(modWarns.length > 0 ? { warnings: modWarns } : {}),
      });
    }

    return moduleSummaries;
  };

  if (options.repositoryRecords) {
    for (const rec of options.repositoryRecords) {
      const moduleSummaries =
        rec.moduleSummaries ??
        buildRepoModuleSummariesAndModels({
          sourceRepo: rec.sourceRepo,
          targetRepo: rec.targetRepo,
          repoStatus: rec.status,
          defaultDurationMs: rec.durationMs,
          repoError: rec.failureReason,
        });

      // Ensure Tier 3 detail models exist even when pre-built moduleSummaries were passed
      if (rec.moduleSummaries) {
        for (const [moduleId, modSum] of Object.entries(rec.moduleSummaries)) {
          if (!repoModuleDetailModels.has(modSum.relativeFilePath)) {
            repoModuleDetailModels.set(modSum.relativeFilePath, {
              moduleId,
              sourceRepo: rec.sourceRepo,
              targetRepo: rec.targetRepo,
              repoStatus: rec.status,
              summary: modSum,
              items: [],
            });
          }
        }
      }

      repositories.push({
        ...rec,
        moduleSummaries,
      });
    }
  } else if (options.pipelineResults && options.pipelineResults.length > 0) {
    for (const pipeResult of options.pipelineResults) {
      const discrepancies =
        repoDiscrepancies.get(pipeResult.targetRepo) ??
        repoDiscrepancies.get(pipeResult.sourceRepo) ??
        [];
      const hasFailedModule = pipeResult.moduleResults.some(
        (m) =>
          m.status === 'failed' || m.results.some((r) => r.status === 'failed'),
      );
      const isClean =
        pipeResult.status === 'complete' &&
        !pipeResult.error &&
        !hasFailedModule &&
        discrepancies.length === 0;

      const durationMs =
        pipeResult.moduleResults.reduce(
          (acc, m) => acc + (m.durationMs || 0),
          0,
        ) || 5000;
      const stagesRun =
        pipeResult.completedStages.length > 0
          ? [...pipeResult.completedStages]
          : ['core-transfer'];
      const remediation =
        repoRemediationCommands.get(pipeResult.targetRepo) ?? [];
      const repoStatus: 'succeeded' | 'failed' = isClean
        ? 'succeeded'
        : 'failed';

      const moduleSummaries = buildRepoModuleSummariesAndModels({
        sourceRepo: pipeResult.sourceRepo,
        targetRepo: pipeResult.targetRepo,
        repoStatus,
        defaultDurationMs: durationMs,
        geiMigrationId: pipeResult.geiResult?.migrationId,
        repoError: pipeResult.error,
      });

      if (isClean) {
        repositories.push({
          sourceRepo: pipeResult.sourceRepo,
          targetRepo: pipeResult.targetRepo,
          status: 'succeeded',
          relativeFilePath: `success/${pipeResult.targetRepo}.md`,
          durationMs,
          stagesRun,
          verified: true,
          discrepancyCount: 0,
          warnings: [],
          moduleSummaries,
        });
        repoSuccessDetails.set(pipeResult.targetRepo, {
          name: pipeResult.targetRepo,
          geiLogSummary: pipeResult.geiResult?.migrationId
            ? `GEI Migration ID: ${pipeResult.geiResult.migrationId}`
            : undefined,
        });
      } else {
        const failedMod = pipeResult.moduleResults.find(
          (m) =>
            m.status === 'failed' ||
            m.results.some((r) => r.status === 'failed'),
        );
        const failedOpError = failedMod?.results.find(
          (r) => r.status === 'failed' && r.error,
        )?.error;
        const failureReason =
          pipeResult.error ??
          failedOpError ??
          (discrepancies.length > 0
            ? `Verification detected ${discrepancies.length} discrepancy(ies) at destination.`
            : 'Migration stage failed.');
        const failedStage = pipeResult.error
          ? 'gei'
          : (failedMod?.moduleId ?? 'verification');

        repositories.push({
          sourceRepo: pipeResult.sourceRepo,
          targetRepo: pipeResult.targetRepo,
          status: 'failed',
          relativeFilePath: `failure/${pipeResult.targetRepo}.md`,
          durationMs,
          stagesRun,
          verified: false,
          discrepancyCount: discrepancies.length,
          failureReason,
          failedStage,
          warnings: [],
          remediationCommands:
            remediation.length > 0
              ? remediation
              : [
                  `ghec-consultant-cli migrate --scope <scope> --repos ${pipeResult.sourceRepo}`,
                ],
          moduleSummaries,
        });
        repoFailureDetails.set(pipeResult.targetRepo, {
          name: pipeResult.targetRepo,
          failedStage,
          errorMessage: failureReason,
          discrepancies,
          remediationCommands: remediation,
        });
      }
    }
  } else {
    // Construct repository list from scope.repositories OR discovered executionReport targets
    const candidateRepos: {
      readonly sourceRepo: string;
      readonly targetRepo: string;
    }[] =
      options.scope?.repositories && options.scope.repositories.length > 0
        ? options.scope.repositories.map((r) => ({
            sourceRepo: r.sourceRepo,
            targetRepo: r.targetRepo,
          }))
        : Array.from(repoExecResultsByRepo.keys()).map((targetRepo) => ({
            sourceRepo:
              repoTargetToSource.get(targetRepo.toLowerCase()) ?? targetRepo,
            targetRepo,
          }));

    for (const repoMap of candidateRepos) {
      const discrepancies =
        repoDiscrepancies.get(repoMap.targetRepo) ??
        repoDiscrepancies.get(repoMap.sourceRepo) ??
        [];
      const modMap = repoExecResultsByRepo.get(repoMap.targetRepo);
      const repoModResults = modMap ? Array.from(modMap.values()).flat() : [];
      let failedModId: string | undefined;
      let failedOpError: string | undefined;
      if (modMap) {
        for (const [mId, execList] of modMap.entries()) {
          const modDiscs = [
            ...(repoModuleDiscrepancies.get(`${repoMap.targetRepo}::${mId}`) ??
              []),
            ...(repoMap.sourceRepo !== repoMap.targetRepo
              ? (repoModuleDiscrepancies.get(`${repoMap.sourceRepo}::${mId}`) ??
                [])
              : []),
          ];
          if (verifiedModulesSet.has(mId) && modDiscs.length === 0) {
            continue;
          }
          const dedupedOps = deduplicateOperationResults(
            execList.flatMap((m) => m.results),
          );
          const latestStatus = execList[execList.length - 1]?.status;
          const hasFailedOp = dedupedOps.some((r) => r.status === 'failed');
          const isModFailed =
            hasFailedOp ||
            (latestStatus === 'failed' &&
              !dedupedOps.some((r) => r.status === 'succeeded'));
          if (isModFailed) {
            failedModId = mId;
            failedOpError = dedupedOps.find(
              (r) => r.status === 'failed' && r.error,
            )?.error;
            break;
          }
        }
      }
      const isClean = !failedModId && discrepancies.length === 0;
      const remediation = repoRemediationCommands.get(repoMap.targetRepo) ?? [];
      const computedDuration =
        repoModResults.reduce((acc, m) => acc + (m.durationMs || 0), 0) ||
        10000;
      const executedModIds = Array.from(modMap?.keys() ?? []);
      const stagesRun =
        executedModIds.length > 0
          ? executedModIds
          : ['preflight', 'gei', 'verification'];
      const repoStatus: 'succeeded' | 'failed' = isClean
        ? 'succeeded'
        : 'failed';

      const moduleSummaries = buildRepoModuleSummariesAndModels({
        sourceRepo: repoMap.sourceRepo,
        targetRepo: repoMap.targetRepo,
        repoStatus,
        defaultDurationMs: computedDuration,
        repoError: failedOpError,
      });

      if (isClean) {
        repositories.push({
          sourceRepo: repoMap.sourceRepo,
          targetRepo: repoMap.targetRepo,
          status: 'succeeded',
          relativeFilePath: `success/${repoMap.targetRepo}.md`,
          durationMs: computedDuration,
          stagesRun,
          verified: true,
          discrepancyCount: 0,
          warnings: [],
          moduleSummaries,
        });
        repoSuccessDetails.set(repoMap.targetRepo, {
          name: repoMap.targetRepo,
        });
      } else {
        const failureReason =
          failedOpError ??
          (failedModId
            ? `Module "${failedModId}" failed during migration execution.`
            : `Verification detected ${discrepancies.length} discrepancy(ies) at destination.`);
        const failedStage = failedModId ?? 'verification';

        repositories.push({
          sourceRepo: repoMap.sourceRepo,
          targetRepo: repoMap.targetRepo,
          status: 'failed',
          relativeFilePath: `failure/${repoMap.targetRepo}.md`,
          durationMs: computedDuration,
          stagesRun,
          verified: false,
          discrepancyCount: discrepancies.length,
          failureReason,
          failedStage,
          warnings: [],
          remediationCommands:
            remediation.length > 0
              ? remediation
              : [`ghec-consultant-cli agent-review --report <report>`],
          moduleSummaries,
        });
        repoFailureDetails.set(repoMap.targetRepo, {
          name: repoMap.targetRepo,
          failedStage,
          errorMessage: failureReason,
          discrepancies,
          remediationCommands: remediation,
        });
      }
    }
  }

  // 4. Calculate Summary Metrics
  const totalRepositories = repositories.length;
  const succeededCount = repositories.filter(
    (r) => r.status === 'succeeded',
  ).length;
  const failedCount = repositories.filter((r) => r.status === 'failed').length;
  const successRatePercent =
    totalRepositories === 0
      ? 100
      : Number(((succeededCount / totalRepositories) * 100).toFixed(2));
  const totalDurationMs =
    options.durationMs ??
    (options.executionReport
      ? options.executionReport.results.reduce(
          (acc: number, r: ModuleExecutionResult) => acc + (r.durationMs || 0),
          0,
        )
      : repositories.reduce(
          (acc: number, r: RepositoryMigrationRecord) => acc + r.durationMs,
          0,
        ));

  const summary: MigrationResultsSummary = {
    totalRepositories,
    succeededCount,
    failedCount,
    successRatePercent,
    durationMs: totalDurationMs,
    orgModulesSummary,
  };

  const manifest: MigrationResultsManifest = {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    runId,
    generatedAt,
    sourceOrg: options.sourceOrg,
    targetOrg: options.targetOrg,
    targetResultsRepo,
    executionMode: options.executionMode,
    summary,
    repositories,
  };

  const validation = validateMigrationResultsManifest(manifest);
  if (!validation.success) {
    const errorDetails = validation.error.issues
      .map((i) => `[${i.path.join('.')}] ${i.message}`)
      .join(', ');
    throw new Error(
      `Failed to generate valid MigrationResultsManifest: ${errorDetails}`,
    );
  }

  // 5. Generate 3-Tier File Map
  const files: Record<string, string> = {};
  files['README.md'] = formatResultsReadmeMarkdown(manifest, {
    nextSteps: options.nextSteps,
  });
  files['manifest.json'] = JSON.stringify(manifest, null, 2);

  // Tier 2: Organization Module Detail Pages (organization/<module>.md)
  for (const [moduleId, orgModel] of orgModuleDetailModels.entries()) {
    const relPath =
      orgModel.summary.relativeFilePath ?? `organization/${moduleId}.md`;
    files[relPath] = formatOrgModuleDetailMarkdown(orgModel);
  }

  // Tier 2: Repository Overviews (success/<repo>.md & failure/<repo>.md)
  for (const repo of manifest.repositories) {
    if (repo.status === 'succeeded') {
      const details = repoSuccessDetails.get(repo.targetRepo) ?? {
        name: repo.targetRepo,
      };
      files[repo.relativeFilePath] = formatSuccessRepoMarkdown(repo, details);
    } else {
      const details: RepositoryFailureDetails = repoFailureDetails.get(
        repo.targetRepo,
      ) ?? {
        name: repo.targetRepo,
        failedStage: repo.failedStage,
        errorMessage: repo.failureReason,
        remediationCommands: repo.remediationCommands,
      };
      files[repo.relativeFilePath] = formatFailureRepoMarkdown(repo, details);
    }
  }

  // Tier 3: Repository Module Granular Item Pages (repositories/<repo>/<module>.md)
  for (const [relPath, repoModModel] of repoModuleDetailModels.entries()) {
    files[relPath] = formatRepoModuleDetailMarkdown(repoModModel);
  }

  return { manifest, files };
}

/**
 * Safely writes generated migration result files to a specified local directory.
 */
export function writeResultsToDirectory(
  results: GeneratedResults,
  outputDir: string,
): string[] {
  const writtenFiles: string[] = [];
  mkdirSync(outputDir, { recursive: true });

  for (const [relPath, content] of Object.entries(results.files)) {
    const fullPath = join(outputDir, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
    writtenFiles.push(fullPath);
  }

  return writtenFiles;
}
