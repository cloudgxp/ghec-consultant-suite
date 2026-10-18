import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type DiscoveryBundle,
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
import {
  ALL_ORGANIZATION_MODULES,
  ALL_REPOSITORY_MODULES,
} from '../orchestrator/module-resolver.js';
import type {
  MigrationExecutionReport,
  RepositoryPipelineResult,
} from '../orchestrator/types.js';
import {
  type PostCareDeliverables,
  generatePostCareDeliverables,
  resolveTargetSettingsLinks,
} from './post-care-generator.js';
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
  readonly operationalMode?: 'discovery' | 'dry-run' | 'live' | undefined;
  readonly discoveryBundle?: DiscoveryBundle | undefined;
  readonly evidenceFiles?: Readonly<Record<string, string>> | undefined;
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
  readonly postCare?: PostCareDeliverables | undefined;
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
      const rest = operationId.slice(prefix.length);
      if (moduleId === 'gei-repo') {
        return rest.replace(
          /^(mirror-push-error|mirror-push|mirror-fallback|migration|metadata|preflight|error)-/,
          '',
        );
      }
      return rest;
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
  const sortedRepos = [...repoNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const repo of sortedRepos) {
    for (const sep of [':', '/']) {
      const prefix = `${repo}${sep}`;
      if (resourceName.toLowerCase().startsWith(prefix.toLowerCase())) {
        return resourceName.slice(prefix.length);
      }
    }
  }
  for (const repo of sortedRepos) {
    if (
      repo.includes('/') &&
      resourceName.toLowerCase() === repo.toLowerCase()
    ) {
      return repo.slice(repo.lastIndexOf('/') + 1);
    }
  }
  return resourceName;
}

function normalizeSucceededOperationReason(reason: string): string {
  return reason
    .replace(/^Recreat(?:e|ing)\b/, 'Recreated')
    .replace(/^Creat(?:e|ing)\b/, 'Created')
    .replace(/^Updat(?:e|ing)\b/, 'Updated')
    .replace(/^Bind(?:ing)?\b/, 'Bound')
    .replace(/^Reconcil(?:e|ing)\b/, 'Reconciled')
    .replace(/^Rehydrat(?:e|ing)\b/, 'Rehydrated')
    .replace(/^Assign(?:ing)?\b/, 'Assigned')
    .replace(/^Align(?:ing)?\b/, 'Aligned')
    .replace(/^Migrat(?:e|ing)\b/, 'Migrated')
    .replace(/^Stream(?:ing)?\b/, 'Streamed')
    .replace(/^Transfer(?:ring)?\b/, 'Transferred')
    .replace(/^Enabl(?:e|ing)\b/, 'Enabled')
    .replace(/^Sync(?:ing)?\b/, 'Synced')
    .replace(/^Provision(?:ing)?\b/, 'Provisioned');
}

function formatStateValue(val: unknown): string {
  if (typeof val === 'string') {
    return val;
  }
  return JSON.stringify(val);
}

function buildGranularItemsForModule(params: {
  readonly moduleId: string;
  readonly sourceOrg?: string | undefined;
  readonly targetOrg: string;
  readonly targetRepo?: string | undefined;
  readonly operations: readonly OperationExecutionResult[];
  readonly discrepancies: readonly RepositoryDiscrepancyDetail[];
  readonly isModuleVerified: boolean;
  readonly planOpsById: ReadonlyMap<string, PlannedOperation>;
  readonly knownSkipTokens: ReadonlySet<string>;
  readonly repoNames: readonly string[];
}): GranularMigrationItemRow[] {
  const {
    moduleId,
    sourceOrg,
    targetOrg,
    targetRepo,
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
      const isReleaseRecreatePlanReason =
        op.status === 'succeeded' &&
        !matchedDisc &&
        moduleId === 'releases' &&
        resourceType === 'release' &&
        operationType === 'create' &&
        /\b(recreate oldest-first|is missing|does not exist)\b/i.test(reason);
      const isPreApplyAbsenceOrDriftReason =
        op.status === 'succeeded' &&
        !matchedDisc &&
        !isReleaseRecreatePlanReason &&
        (operationType === 'create' || operationType === 'update') &&
        /\b(is missing|does not exist|differ(?:s)?|not found on target|missing in destination)\b/i.test(
          reason,
        );
      if (isReleaseRecreatePlanReason) {
        const isDraftRelease = /^draft release\b/i.test(reason);
        noteParts.push(
          `Recreated${isDraftRelease ? ' draft' : ''} release "${resourceName}" on target repository.`,
        );
      } else if (isPreApplyAbsenceOrDriftReason) {
        if (secretFlag) {
          noteParts.push('[SEALED] Write-only secret placeholder');
        } else {
          const byteMatch = /\((\d+\s+bytes)\)/i.exec(reason);
          const byteSuffix = byteMatch?.[1] ? ` (${byteMatch[1]})` : '';
          let webhookSuffix = '';
          const lowerReason = reason.toLowerCase();
          const inactiveIdx = lowerReason.indexOf('(inactive');
          const activeNoSecretIdx = lowerReason.indexOf(
            '(active; no signing secret',
          );
          const startParenIdx =
            inactiveIdx !== -1 ? inactiveIdx : activeNoSecretIdx;
          if (startParenIdx !== -1) {
            const closeParenIdx = reason.indexOf(')', startParenIdx);
            if (closeParenIdx !== -1) {
              webhookSuffix = ` ${reason.slice(startParenIdx, closeParenIdx + 1)}`;
            }
          }
          noteParts.push(
            operationType === 'create'
              ? verificationStatus === 'verified'
                ? `Created and verified on target${byteSuffix}${webhookSuffix}.`
                : `Created on target${byteSuffix}${webhookSuffix}.`
              : verificationStatus === 'verified'
                ? `Updated and verified on target${byteSuffix}${webhookSuffix}.`
                : `Updated on target${byteSuffix}${webhookSuffix}.`,
          );
        }
      } else if (op.status === 'succeeded' && !matchedDisc) {
        noteParts.push(normalizeSucceededOperationReason(reason));
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

    const links = resolveTargetSettingsLinks({
      moduleId,
      resourceType,
      resourceName,
      sourceOrg,
      targetOrg,
      targetRepo,
      operationId: op.operationId,
      notes: reason,
      plannedOp: planned,
    });

    rows.push({
      operationId: op.operationId,
      resourceName,
      resourceType,
      operationType,
      status: op.status,
      ...(op.completedAt ? { completedAt: op.completedAt } : {}),
      verificationStatus,
      ...(noteParts.length > 0 ? { notes: noteParts.join(' — ') } : {}),
      isSecret: secretFlag,
      settingsUrl: links.settingsUrl,
      settingsLinkLabel: links.settingsLinkLabel,
      ...(links.secondaryUrl ? { secondaryUrl: links.secondaryUrl } : {}),
      ...(links.secondaryLinkLabel
        ? { secondaryLinkLabel: links.secondaryLinkLabel }
        : {}),
      subDomain: links.subDomain,
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
    const links = resolveTargetSettingsLinks({
      moduleId,
      resourceType,
      resourceName,
      sourceOrg,
      targetOrg,
      targetRepo,
      notes: disc.message,
    });

    rows.push({
      resourceName,
      resourceType,
      operationType: 'verify',
      status: 'failed',
      verificationStatus: 'discrepancy',
      notes: `${disc.message} (expected: ${formatStateValue(disc.expected)}, actual: ${formatStateValue(disc.actual)})`,
      isSecret: secretFlag,
      settingsUrl: links.settingsUrl,
      settingsLinkLabel: links.settingsLinkLabel,
      ...(links.secondaryUrl ? { secondaryUrl: links.secondaryUrl } : {}),
      ...(links.secondaryLinkLabel
        ? { secondaryLinkLabel: links.secondaryLinkLabel }
        : {}),
      subDomain: links.subDomain,
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
    options.runId ??
    options.executionReport?.planId ??
    options.plan?.planId ??
    `run-${Date.now()}`;
  const targetResultsRepo =
    options.targetResultsRepo ?? 'migration-audit-results';

  // Build lookup structures from scope, plan, and discovery bundle
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

  if (options.discoveryBundle?.entities) {
    for (const entity of options.discoveryBundle.entities) {
      if (entity.kind === 'repository') {
        const lower = entity.name.toLowerCase();
        if (!repoSourceToTarget.has(lower)) {
          repoSourceToTarget.set(lower, entity.name);
        }
        if (!repoTargetToSource.has(lower)) {
          repoTargetToSource.set(lower, entity.name);
        }
        knownRepoNames.add(lower);
      }
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
            const closeIdx = w.startsWith('[') ? w.indexOf(']') : -1;
            const cleanWarning =
              closeIdx > 1 ? w.slice(closeIdx + 1).trimStart() || w : w;
            if (!existing.includes(cleanWarning)) {
              existing.push(cleanWarning);
            }
          }
          orgWarningsByModule.set(mod.moduleId, existing);
        } else {
          for (const w of mod.warnings) {
            const closeIdx = w.startsWith('[') ? w.indexOf(']') : -1;
            const prefixCandidate =
              closeIdx > 1 ? w.slice(1, closeIdx) : undefined;
            const cleanWarning =
              closeIdx > 1 ? w.slice(closeIdx + 1).trimStart() || w : w;
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

  const isDuplicateModuleExec = (
    existingList: readonly ModuleExecutionResult[],
    incoming: ModuleExecutionResult,
  ): boolean => {
    const firstOpTs = incoming.results[0]?.completedAt ?? '';
    const lastOpTs =
      incoming.results[incoming.results.length - 1]?.completedAt ?? '';
    return existingList.some((e) => {
      const eFirstTs = e.results[0]?.completedAt ?? '';
      const eLastTs = e.results[e.results.length - 1]?.completedAt ?? '';
      if (
        e.moduleId === incoming.moduleId &&
        e.status === incoming.status &&
        e.durationMs === incoming.durationMs &&
        e.results.length === incoming.results.length &&
        eFirstTs === firstOpTs &&
        eLastTs === lastOpTs
      ) {
        return (
          incoming.results.length > 0 ||
          (incoming.durationMs !== undefined && incoming.durationMs > 0)
        );
      }
      return false;
    });
  };

  const recordOrgModuleExec = (modResult: ModuleExecutionResult): void => {
    const list = orgExecResultsByModule.get(modResult.moduleId) ?? [];
    if (!isDuplicateModuleExec(list, modResult)) {
      list.push(modResult);
      orgExecResultsByModule.set(modResult.moduleId, list);
    }
  };

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
    if (!isDuplicateModuleExec(list, modResult)) {
      list.push(modResult);
      modMap.set(modResult.moduleId, list);
    }
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
        recordOrgModuleExec(modResult);
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
          recordOrgModuleExec(modResult);
        } else {
          recordRepoModuleExec(pipeResult.targetRepo, modResult);
        }
      }
    }
  }

  // Synthesize module results from MigrationPlan when no executionReport/pipelineResults were provided (Plan / Dry-Run mode)
  if (
    (!options.executionReport ||
      options.executionReport.results.length === 0) &&
    (!options.pipelineResults || options.pipelineResults.length === 0) &&
    options.plan?.modules
  ) {
    for (const mp of options.plan.modules) {
      const syntheticOps: OperationExecutionResult[] = mp.operations.map(
        (op) => ({
          operationId: op.id,
          status:
            op.operation === 'skip'
              ? ('skipped' as const)
              : ('succeeded' as const),
          completedAt: options.plan?.createdAt ?? generatedAt,
          resourceType: op.resourceType,
          resourceName: op.resourceName,
          operationType: op.operation,
          reason: op.reason,
          targetIdentifier: mp.targetIdentifier,
        }),
      );
      const syntheticModResult: ModuleExecutionResult = {
        schemaVersion: MIGRATION_SCHEMA_VERSION,
        moduleId: mp.moduleId,
        targetIdentifier: mp.targetIdentifier,
        scopeLevel: mp.scopeLevel,
        status:
          syntheticOps.length === 0 ||
          syntheticOps.every((r) => r.status === 'skipped')
            ? 'skipped'
            : 'complete',
        results: syntheticOps,
        durationMs: 0,
      };
      if (
        isOrganizationScopedModuleResult(syntheticModResult, {
          sourceOrg: options.sourceOrg,
          targetOrg: options.targetOrg,
          knownRepoNames,
        })
      ) {
        recordOrgModuleExec(syntheticModResult);
      } else {
        let targetRepo = resolveCanonicalTargetRepo(mp.targetIdentifier);
        if (!targetRepo && options.scope?.repositories.length === 1) {
          targetRepo = options.scope.repositories[0]!.targetRepo;
        }
        if (targetRepo) {
          recordRepoModuleExec(targetRepo, syntheticModResult);
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
    const activeExecPasses = modExecList.filter((m) =>
      m.results.some(
        (r) =>
          r.operationType === 'create' ||
          r.operationType === 'update' ||
          r.status === 'failed' ||
          (!r.operationType &&
            !r.operationId.toLowerCase().includes(':noop') &&
            !r.operationId.toLowerCase().startsWith('noop-')),
      ),
    );
    const passesForDuration =
      activeExecPasses.length > 0 ? activeExecPasses : modExecList;
    const durationMs = passesForDuration.reduce(
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
      sourceOrg: options.sourceOrg,
      targetOrg: options.targetOrg,
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

  const synthesizeRepoGeiLogSummary = (params: {
    readonly targetRepo: string;
    readonly modMap?: ReadonlyMap<string, ModuleExecutionResult[]> | undefined;
    readonly moduleSummaries: Readonly<Record<string, RepoModuleResultSummary>>;
    readonly geiMigrationId?: string | undefined;
  }): string => {
    const { targetRepo, modMap, moduleSummaries, geiMigrationId } = params;
    const geiExecList = modMap?.get('gei-repo') ?? [];
    const geiOps = geiExecList.flatMap((m) => m.results);
    const scopeRepo = options.scope?.repositories.find(
      (r) =>
        r.targetRepo.toLowerCase() === targetRepo.toLowerCase() ||
        r.sourceRepo.toLowerCase() === targetRepo.toLowerCase(),
    );

    const usedDirectMirrorPush =
      geiOps.some((o) => o.operationId.startsWith('gei-repo-mirror-push-')) ||
      geiExecList.some(
        (m) =>
          (m.failedMetadataCategories?.includes('issues') ||
            m.failedMetadataCategories?.includes('pull-requests') ||
            m.failedMetadataCategories?.includes('pull_requests')) &&
          m.failedMetadataCategories?.includes('releases'),
      ) ||
      scopeRepo?.gitTransferStrategy === 'mirror-push' ||
      scopeRepo?.options?.gitTransferStrategy === 'mirror-push';
    const usedFallbackMirrorPush = geiOps.some((o) =>
      o.operationId.startsWith('gei-repo-mirror-fallback-'),
    );
    const hadSkippedReleases =
      !usedDirectMirrorPush &&
      !usedFallbackMirrorPush &&
      (geiExecList.some((m) =>
        m.failedMetadataCategories?.includes('releases'),
      ) ||
        Boolean(scopeRepo?.skipReleases || scopeRepo?.options?.skipReleases));

    const sidecarParts: string[] = [];
    for (const sidecarMod of ['releases', 'lfs', 'issues', 'pull-requests']) {
      const sum = moduleSummaries[sidecarMod];
      if (sum && sum.succeededOperations > 0) {
        sidecarParts.push(
          `\`${sidecarMod}\`: ${sum.succeededOperations} item${sum.succeededOperations === 1 ? '' : 's'}`,
        );
      }
    }

    if (usedDirectMirrorPush) {
      const sidecarNote =
        sidecarParts.length > 0
          ? `Metadata rehydrated and verified via sidecar modules (${sidecarParts.join(', ')}).`
          : 'Metadata verified with 0 discrepancies on target.';
      return `Repository Git history transferred via direct Git mirror-push (bypassing GEI archive size limits). ${sidecarNote}`;
    }

    if (usedFallbackMirrorPush) {
      const sidecarNote =
        sidecarParts.length > 0
          ? `Metadata rehydrated and verified via sidecar modules (${sidecarParts.join(', ')}).`
          : 'Metadata verified with 0 discrepancies on target.';
      return `Repository Git history transferred via automatic fallback Git mirror-push after GEI archive generation failure. ${sidecarNote}`;
    }

    if (hadSkippedReleases) {
      const releasesExec = modMap?.get('releases') ?? [];
      const releaseOps = deduplicateOperationResults(
        releasesExec.flatMap((m) => m.results),
      ).filter((o) => o.status === 'succeeded');
      const releaseTagCount = releaseOps.filter(
        (o) => o.resourceType === 'release',
      ).length;
      const releaseAssetCount = releaseOps.filter(
        (o) => o.resourceType === 'release-asset',
      ).length;
      if (releaseOps.length > 0) {
        const detailText =
          releaseTagCount > 0 && releaseAssetCount > 0
            ? `${releaseTagCount} release${releaseTagCount === 1 ? '' : 's'} and ${releaseAssetCount} release asset${releaseAssetCount === 1 ? '' : 's'} (${releaseOps.length} items)`
            : `${releaseOps.length} item${releaseOps.length === 1 ? '' : 's'}`;
        return `Repository Git history and core metadata transferred via GitHub Enterprise Importer (GEI) with \`--skip-releases\` enabled for large release payloads. Sidecar \`releases\` module streamed and verified ${detailText} with 0 discrepancies.`;
      }
      return 'Repository transferred cleanly via GitHub Enterprise Importer (GEI) with `--skip-releases` flag active (0 source releases present); verified with 0 discrepancies.';
    }

    if (geiMigrationId) {
      return `GEI Migration ID: ${geiMigrationId}`;
    }

    return 'Repository transferred cleanly via GEI without errors or metadata drops.';
  };

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

    const modExecMap = new Map<string, ModuleExecutionResult[]>(
      repoExecResultsByRepo.get(targetRepo) ?? [],
    );

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

    // For full-spectrum repository migrations, ensure all verified ALL_REPOSITORY_MODULES are represented
    if (modExecMap.size >= 10) {
      for (const repoModId of ALL_REPOSITORY_MODULES) {
        if (verifiedModulesSet.has(repoModId) && !modExecMap.has(repoModId)) {
          modExecMap.set(repoModId, []);
        }
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
          (execList.length > 0 &&
            execList.every((m) => m.status === 'failed')) ||
          (repoStatus === 'failed' &&
            Boolean(repoError) &&
            allRepoDiscs.length === 0);
        const alreadyPresent =
          execList.length > 0 && !geiMigrationId && !geiFailed;
        const scopeRepo = options.scope?.repositories.find(
          (r) =>
            r.targetRepo.toLowerCase() === targetRepo.toLowerCase() ||
            r.sourceRepo.toLowerCase() === targetRepo.toLowerCase(),
        );
        const isMirrorPush =
          execList.some(
            (m) =>
              (m.failedMetadataCategories?.includes('issues') ||
                m.failedMetadataCategories?.includes('pull-requests') ||
                m.failedMetadataCategories?.includes('pull_requests')) &&
              m.failedMetadataCategories?.includes('releases'),
          ) ||
          scopeRepo?.gitTransferStrategy === 'mirror-push' ||
          scopeRepo?.options?.gitTransferStrategy === 'mirror-push';
        const isSkipReleases =
          !isMirrorPush &&
          (execList.some((m) =>
            m.failedMetadataCategories?.includes('releases'),
          ) ||
            Boolean(
              scopeRepo?.skipReleases || scopeRepo?.options?.skipReleases,
            ));
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
                ? isMirrorPush
                  ? 'Target repository already exists on destination (direct Git mirror-push strategy; metadata rehydrated via sidecar modules); verified parity.'
                  : isSkipReleases
                    ? 'Target repository already exists on destination (GEI --skip-releases strategy; releases and assets verified via sidecar module); verified parity.'
                    : 'Target repository already exists on destination; verified parity.'
                : 'Core Git repository transfer',
            targetIdentifier: `${options.targetOrg}/${targetRepo}`,
          },
        ];
      } else if (moduleId === 'gei-repo' && allOps.length > 0) {
        const hadSkippedReleases = execList.some((m) =>
          m.failedMetadataCategories?.includes('releases'),
        );
        const hasSidecarReleases = (modExecMap.get('releases') ?? []).some(
          (m) =>
            m.results.some(
              (r) =>
                r.status === 'succeeded' &&
                (r.operationType === 'create' ||
                  (!r.operationType &&
                    !r.operationId.toLowerCase().includes(':noop'))),
            ),
        );
        allOps = allOps.map((op) => {
          if (op.reason) return op;
          if (op.operationId.startsWith('gei-repo-mirror-push-')) {
            return {
              ...op,
              resourceType: op.resourceType ?? 'repository',
              resourceName: op.resourceName ?? targetRepo,
              operationType: op.operationType ?? 'create',
              reason: `Transferred repository "${targetRepo}" via direct Git mirror-push; metadata rehydrated via sidecar modules.`,
            };
          }
          if (op.operationId.startsWith('gei-repo-mirror-fallback-')) {
            return {
              ...op,
              resourceType: op.resourceType ?? 'repository',
              resourceName: op.resourceName ?? targetRepo,
              operationType: op.operationType ?? 'create',
              reason: `Transferred repository "${targetRepo}" via fallback Git mirror-push after GEI archive generation failure; metadata rehydrated via sidecar modules.`,
            };
          }
          if (op.operationId.startsWith('gei-repo-migration-')) {
            return {
              ...op,
              resourceType: op.resourceType ?? 'repository',
              resourceName: op.resourceName ?? targetRepo,
              operationType: op.operationType ?? 'create',
              reason:
                hadSkippedReleases && hasSidecarReleases
                  ? `Transferred repository "${targetRepo}" via GitHub Enterprise Importer (GEI) with --skip-releases; releases and assets streamed via sidecar module.`
                  : `Transferred repository "${targetRepo}" via GitHub Enterprise Importer (GEI).`,
            };
          }
          return op;
        });
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
        sourceOrg: options.sourceOrg,
        targetOrg: options.targetOrg,
        targetRepo,
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
        const modMap = repoExecResultsByRepo.get(pipeResult.targetRepo);
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
          geiLogSummary: synthesizeRepoGeiLogSummary({
            targetRepo: pipeResult.targetRepo,
            modMap,
            moduleSummaries,
            geiMigrationId: pipeResult.geiResult?.migrationId,
          }),
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
    // Construct repository list from scope.repositories, executionReport/plan targets, or discoveryBundle
    const discoveredRepoCandidates =
      options.discoveryBundle?.entities
        .filter((e) => e.kind === 'repository')
        .map((e) => ({
          sourceRepo: e.name,
          targetRepo: repoSourceToTarget.get(e.name.toLowerCase()) ?? e.name,
        })) ?? [];

    const candidateRepos: {
      readonly sourceRepo: string;
      readonly targetRepo: string;
    }[] =
      options.scope?.repositories && options.scope.repositories.length > 0
        ? options.scope.repositories.map((r) => ({
            sourceRepo: r.sourceRepo,
            targetRepo: r.targetRepo,
          }))
        : repoExecResultsByRepo.size > 0
          ? Array.from(repoExecResultsByRepo.keys()).map((targetRepo) => ({
              sourceRepo:
                repoTargetToSource.get(targetRepo.toLowerCase()) ?? targetRepo,
              targetRepo,
            }))
          : discoveredRepoCandidates;

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

      const summaryModIds = Object.keys(moduleSummaries);
      const stagesRun =
        summaryModIds.length >= 10
          ? summaryModIds
          : executedModIds.length > 0
            ? executedModIds
            : ['preflight', 'gei', 'verification'];

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
          geiLogSummary: synthesizeRepoGeiLogSummary({
            targetRepo: repoMap.targetRepo,
            modMap,
            moduleSummaries,
          }),
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
  const orgTotalDurationMs = Object.values(orgModulesSummary).reduce(
    (acc, m) => acc + (m.durationMs ?? 0),
    0,
  );
  const repoTotalDurationMs = repositories.reduce(
    (acc: number, r: RepositoryMigrationRecord) => acc + r.durationMs,
    0,
  );
  const totalDurationMs =
    options.durationMs ??
    (options.executionReport
      ? orgTotalDurationMs +
        (repoExecResultsByRepo.size > 0 ? repoTotalDurationMs : 0)
      : repoTotalDurationMs);

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

  // 5. Generate Unified Post-Care Deliverables, CSV Exports, and 3-Tier File Map
  const effectiveMode: 'discovery' | 'dry-run' | 'live' =
    options.operationalMode ??
    (!options.executionReport &&
    !options.plan &&
    Boolean(options.discoveryBundle)
      ? 'discovery'
      : options.executionMode);

  const postCare = generatePostCareDeliverables({
    runId,
    generatedAt,
    sourceOrg: options.sourceOrg,
    targetOrg: options.targetOrg,
    mode: effectiveMode,
    orgModuleModels: orgModuleDetailModels,
    repoModuleModels: repoModuleDetailModels,
    plan: options.plan,
    discoveryBundle: options.discoveryBundle,
    repoSourceToTarget,
  });

  const secretCount = postCare.items.filter(
    (i) => i.category === 'secret',
  ).length;
  const appCount = postCare.items.filter(
    (i) => i.category === 'github-app',
  ).length;
  const webhookCount = postCare.items.filter(
    (i) => i.category === 'webhook',
  ).length;
  const runnerCount = postCare.items.filter(
    (i) => i.category === 'runner',
  ).length;
  const identityAndAccessCount = postCare.items.filter(
    (i) =>
      i.category === 'idp-team' ||
      i.category === 'mannequin' ||
      i.category === 'collaborator' ||
      i.category === 'deploy-key',
  ).length;
  const governanceAndRemediationCount = postCare.items.filter(
    (i) =>
      i.category === 'policy' ||
      i.category === 'package' ||
      i.category === 'security' ||
      i.category === 'failed-operation',
  ).length;
  const otherCount =
    postCare.items.length - secretCount - appCount - webhookCount - runnerCount;

  const allGranularItems = [
    ...Array.from(orgModuleDetailModels.values()).flatMap((m) => m.items),
    ...Array.from(repoModuleDetailModels.values()).flatMap((m) => m.items),
  ];
  const operationTotals =
    allGranularItems.length > 0
      ? {
          total: allGranularItems.length,
          succeeded: allGranularItems.filter((i) => i.status === 'succeeded')
            .length,
          mutated: allGranularItems.filter(
            (i) => i.status === 'succeeded' && i.operationType !== 'noop',
          ).length,
          noop: allGranularItems.filter(
            (i) => i.status === 'succeeded' && i.operationType === 'noop',
          ).length,
          skipped: allGranularItems.filter((i) => i.status === 'skipped')
            .length,
          failed: allGranularItems.filter((i) => i.status === 'failed').length,
        }
      : undefined;

  const largeReleaseRepos: string[] = [];
  let totalReleasesCount = 0;
  let totalReleaseAssetsStreamed = 0;
  let totalReleaseBytesStreamed = 0;
  const lfsRepos: string[] = [];
  let totalLfsObjectsTransferred = 0;
  let totalLfsBytesTransferred = 0;
  const mirrorPushRepos: string[] = [];
  const repoStrategyBadges: Record<string, string> = {};

  for (const repo of manifest.repositories) {
    const targetRepo = repo.targetRepo;
    const scopeRepo = options.scope?.repositories.find(
      (r) =>
        r.targetRepo.toLowerCase() === targetRepo.toLowerCase() ||
        r.sourceRepo.toLowerCase() === targetRepo.toLowerCase(),
    );
    const modMap = repoExecResultsByRepo.get(targetRepo);
    const geiExecList = modMap?.get('gei-repo') ?? [];
    const geiOps = geiExecList.flatMap((m) => m.results);

    const isMirrorPush =
      geiOps.some((o) => o.operationId.startsWith('gei-repo-mirror-push-')) ||
      geiExecList.some(
        (m) =>
          (m.failedMetadataCategories?.includes('issues') ||
            m.failedMetadataCategories?.includes('pull-requests') ||
            m.failedMetadataCategories?.includes('pull_requests')) &&
          m.failedMetadataCategories?.includes('releases'),
      ) ||
      scopeRepo?.gitTransferStrategy === 'mirror-push' ||
      scopeRepo?.options?.gitTransferStrategy === 'mirror-push';
    const isFallbackMirrorPush = geiOps.some((o) =>
      o.operationId.startsWith('gei-repo-mirror-fallback-'),
    );
    const isSkipReleases =
      !isMirrorPush &&
      !isFallbackMirrorPush &&
      (geiExecList.some((m) =>
        m.failedMetadataCategories?.includes('releases'),
      ) ||
        Boolean(scopeRepo?.skipReleases || scopeRepo?.options?.skipReleases));

    const badgeParts: string[] = [];
    if (isMirrorPush) {
      mirrorPushRepos.push(targetRepo);
      badgeParts.push('🔄 `mirror-push`');
    } else if (isFallbackMirrorPush) {
      mirrorPushRepos.push(targetRepo);
      badgeParts.push('🔄 `mirror-fallback`');
    } else if (isSkipReleases) {
      badgeParts.push('📦 `--skip-releases` + `releases`');
    }

    const releasesModel = repoModuleDetailModels.get(
      `repositories/${targetRepo}/releases.md`,
    );
    if (
      releasesModel &&
      (isSkipReleases ||
        releasesModel.items.some((i) => i.resourceType === 'release-asset'))
    ) {
      const relCount = releasesModel.items.filter(
        (i) => i.resourceType === 'release' && i.status === 'succeeded',
      ).length;
      const assetItems = releasesModel.items.filter(
        (i) => i.resourceType === 'release-asset' && i.status === 'succeeded',
      );
      if (relCount > 0 || assetItems.length > 0) {
        largeReleaseRepos.push(targetRepo);
        totalReleasesCount += relCount;
        totalReleaseAssetsStreamed += assetItems.length;
        for (const item of assetItems) {
          if (item.notes) {
            const m = /\((\d+)\s+bytes\b/i.exec(item.notes);
            if (m?.[1]) {
              totalReleaseBytesStreamed += Number.parseInt(m[1], 10);
            }
          }
        }
      }
    }

    const lfsModel = repoModuleDetailModels.get(
      `repositories/${targetRepo}/lfs.md`,
    );
    if (lfsModel) {
      const lfsItems = lfsModel.items.filter((i) => i.status === 'succeeded');
      if (lfsItems.length > 0) {
        lfsRepos.push(targetRepo);
        totalLfsObjectsTransferred += lfsItems.length;
        for (const item of lfsItems) {
          if (item.notes) {
            const m = /\((\d+)\s+bytes\b/i.exec(item.notes);
            if (m?.[1]) {
              totalLfsBytesTransferred += Number.parseInt(m[1], 10);
            }
          }
        }
        badgeParts.push('🗄️ `lfs`');
      }
    }

    if (badgeParts.length > 0) {
      repoStrategyBadges[targetRepo] = badgeParts.join(' · ');
    }
  }

  const files: Record<string, string> = {};
  files['README.md'] = formatResultsReadmeMarkdown(manifest, {
    nextSteps: options.nextSteps,
    operationalMode: effectiveMode,
    postCareSummary: {
      totalItems: postCare.items.length,
      secretCount,
      appCount,
      webhookCount,
      runnerCount,
      otherCount,
      identityAndAccessCount,
      governanceAndRemediationCount,
    },
    ...(options.verificationReport?.summary
      ? {
          verificationSummary: {
            verifiedModuleCount:
              options.verificationReport.summary.verifiedModuleCount,
            unverifiedModuleCount:
              options.verificationReport.summary.unverifiedModuleCount,
            discrepancyCount:
              options.verificationReport.summary.discrepancyCount,
          },
        }
      : {}),
    ...(operationTotals ? { operationTotals } : {}),
    transferStrategies: {
      ...(largeReleaseRepos.length > 0
        ? {
            largeReleases: {
              repos: largeReleaseRepos,
              releasesCount: totalReleasesCount,
              assetsStreamed: totalReleaseAssetsStreamed,
              bytesStreamed: totalReleaseBytesStreamed,
            },
          }
        : {}),
      ...(lfsRepos.length > 0
        ? {
            lfs: {
              repos: lfsRepos,
              objectsTransferred: totalLfsObjectsTransferred,
              bytesTransferred: totalLfsBytesTransferred,
            },
          }
        : {}),
      ...(mirrorPushRepos.length > 0 ? { mirrorPushRepos } : {}),
    },
    ...(Object.keys(repoStrategyBadges).length > 0
      ? { repoStrategyBadges }
      : {}),
  });
  files['manifest.json'] = JSON.stringify(manifest, null, 2);
  files['POST-CARE-CHECKLIST.md'] = postCare.checklistMarkdown;

  for (const [csvPath, csvContent] of Object.entries(postCare.csvFiles)) {
    files[csvPath] = csvContent;
  }

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

  // Evidence Bundle Parity (evidence/*.json & custom evidenceFiles)
  if (options.discoveryBundle) {
    files['evidence/discovery-bundle.json'] = JSON.stringify(
      options.discoveryBundle,
      null,
      2,
    );
  }
  if (options.scope) {
    files['evidence/migration-scope.json'] = JSON.stringify(
      options.scope,
      null,
      2,
    );
  }
  if (options.plan) {
    files['evidence/migration-plan.json'] = JSON.stringify(
      options.plan,
      null,
      2,
    );
  }
  if (options.executionReport) {
    files['evidence/execution-report.json'] = JSON.stringify(
      options.executionReport,
      null,
      2,
    );
  }
  if (options.verificationReport) {
    files['evidence/verification-report.json'] = JSON.stringify(
      options.verificationReport,
      null,
      2,
    );
  }
  if (options.remediationPlan) {
    files['evidence/remediation-plan.json'] = JSON.stringify(
      options.remediationPlan,
      null,
      2,
    );
  }
  if (options.evidenceFiles) {
    for (const [relPath, content] of Object.entries(options.evidenceFiles)) {
      const normalizedKey = relPath.startsWith('evidence/')
        ? relPath
        : `evidence/${relPath.replace(/^\/+/, '')}`;
      files[normalizedKey] = content;
    }
  }

  files['evidence/README.md'] = formatEvidenceReadmeMarkdown({
    sourceOrg: options.sourceOrg,
    targetOrg: options.targetOrg,
    runId,
    generatedAt,
    files,
  });

  return { manifest, files, postCare };
}

const EVIDENCE_FILE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'discovery-bundle.json':
    'Snapshot of your source organization repositories, teams, secrets, webhooks, runners, and apps before migration.',
  'migration-scope.json':
    'List of repositories and settings selected for this migration wave.',
  'migration-plan.json':
    'Step-by-step list of planned changes generated before making any updates to the target organization.',
  'execution-report.json':
    'Complete log of every migration step that ran, including timestamps, status, and duration.',
  'verification-report.json':
    'Post-migration check comparing your source and target organizations to confirm all items match.',
  'remediation-plan.json':
    'Suggested follow-up commands to fix any items that were skipped or reported differences during verification.',
  'org-discovery-snapshot.json':
    'Raw organization-level settings and inventory collected during discovery.',
};

function formatEvidenceReadmeMarkdown(params: {
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly files: Readonly<Record<string, string>>;
}): string {
  const { sourceOrg, targetOrg, runId, generatedAt, files } = params;
  const evidenceEntries = Object.entries(files)
    .filter(
      ([relPath]) =>
        relPath.startsWith('evidence/') && relPath !== 'evidence/README.md',
    )
    .sort(([a], [b]) => a.localeCompare(b));

  const lines: string[] = [
    '[← Back to Overview](../README.md) | [Customer Post-Care Checklist](../POST-CARE-CHECKLIST.md)',
    '',
    `# Audit Evidence Bundle Guide: ${sourceOrg} ➔ ${targetOrg}`,
    '',
    `> **Run ID:** \`${runId}\`  `,
    `> **Generated At:** \`${generatedAt}\`  `,
    '',
    'By default, the migration tool saves machine-readable JSON files in this `evidence/` folder alongside the human-readable Markdown reports and CSV spreadsheets.',
    '',
    'While AI assistants and CLI tools use these JSON files for automated checks, **human consultants and compliance reviewers** can also use them to:',
    '- **Explore results visually** in the offline **GHEC Consultant Dashboard** web app without needing a live GitHub connection or token.',
    '- **Prove compliance and auditability** using the SHA-256 checksums listed below.',
    '- **Re-run verification or generate fix scripts** without re-scanning your source organization.',
    '',
    '---',
    '',
    '## What Is Inside This Folder',
    '',
  ];

  if (evidenceEntries.length === 0) {
    lines.push(
      '_No JSON evidence artifacts were bundled for this run. See [`../manifest.json`](../manifest.json) for the run summary._',
    );
    lines.push('');
  } else {
    lines.push(
      '| File | Plain-English Description | Size | SHA-256 Checksum |',
    );
    lines.push('| :--- | :--- | ---: | :--- |');
    for (const [relPath, content] of evidenceEntries) {
      const fileName = relPath.slice('evidence/'.length);
      const byteLength = Buffer.byteLength(content, 'utf-8');
      const sha256 = createHash('sha256')
        .update(content, 'utf-8')
        .digest('hex');
      const desc =
        EVIDENCE_FILE_DESCRIPTIONS[fileName] ??
        'Structured JSON audit evidence artifact for this migration run.';
      lines.push(
        `| [\`${fileName}\`](${fileName}) | ${desc} | ${byteLength.toLocaleString('en-US')} B | \`sha256:${sha256.slice(0, 16)}…\` |`,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Viewing Evidence in the Visual Dashboard');
  lines.push('');
  lines.push(
    'You can load the JSON files from this folder into the **GHEC Consultant Dashboard** to browse repositories, readiness scores, and verification results in your browser.',
  );
  lines.push('');
  lines.push('To launch the visual dashboard locally and open these files:');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run dev');
  lines.push('```');
  lines.push('');
  lines.push(
    'Then click **Load Offline Bundle** in the dashboard and select `discovery-bundle.json`, `execution-report.json`, or `verification-report.json` from this `evidence/` folder.',
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Running Automated Follow-Up Checks from Evidence');
  lines.push('');
  lines.push(
    'To generate a remediation plan from `verification-report.json` without re-running the full migration:',
  );
  lines.push('');
  lines.push('```bash');
  lines.push(
    'ghec-consultant-cli agent-review --report ./evidence/verification-report.json --output ./evidence/remediation-plan.json',
  );
  lines.push('```');
  lines.push('');

  return lines.join('\n');
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
