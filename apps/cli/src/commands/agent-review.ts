import { parseArgs } from 'node:util';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  validateVerificationReport,
  validateModuleExecutionResult,
  type VerificationReport,
  type ModuleExecutionResult,
} from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';
import {
  appendStepSummary,
  type MigrationExecutionReport,
} from '@ghec/migration';

export interface AgentReviewOptions {
  readonly reportPath: string;
  readonly specPath?: string | undefined;
  readonly executionReportsPath?: string | undefined;
  readonly outputPath: string;
  readonly outputMarkdownPath: string;
  readonly appendStepSummary: boolean;
  readonly verbose?: boolean | undefined;
}

export type RemediationCategory =
  | 'secrets-and-variables'
  | 'security-and-policies'
  | 'assets-and-storage'
  | 'identity-and-access'
  | 'webhooks-and-integrations'
  | 'metadata-and-content'
  | 'general';

export interface RemediationAction {
  readonly id: string;
  readonly category: RemediationCategory;
  readonly moduleId: string;
  readonly resourceName: string;
  readonly description: string;
  readonly command: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly executionError?: string | undefined;
  readonly synthesizedFromExecution?: boolean | undefined;
}

export interface RemediationPlan {
  readonly schemaVersion: string;
  readonly planId: string;
  readonly generatedAt: string;
  readonly reportId: string;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly totalDiscrepancies: number;
  readonly unverifiedExecutionFailures?: number | undefined;
  readonly actionableCount: number;
  readonly warnings?: readonly string[] | undefined;
  readonly actions: readonly RemediationAction[];
  readonly script: string;
}

export function parseAgentReviewOptions(args: string[]): AgentReviewOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      report: { type: 'string' },
      spec: { type: 'string' },
      'execution-reports': { type: 'string' },
      output: {
        type: 'string',
        default: './scans/remediation-plan.json',
      },
      'output-markdown': {
        type: 'string',
        default: './scans/remediation-plan.md',
      },
      'append-step-summary': { type: 'boolean', default: true },
      verbose: { type: 'boolean', default: false },
    },
  });

  if (!values.report || !values.report.trim()) {
    throw new Error('The --report <file> flag is required.');
  }

  return {
    reportPath: values.report.trim(),
    specPath: values.spec?.trim(),
    executionReportsPath: values['execution-reports']?.trim() || undefined,
    outputPath: values.output || './scans/remediation-plan.json',
    outputMarkdownPath:
      values['output-markdown'] || './scans/remediation-plan.md',
    appendStepSummary: values['append-step-summary'] ?? true,
    verbose: values.verbose,
  };
}

function collectExecutionReportFilesFromDir(dirPath: string): string[] {
  const found: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectExecutionReportFilesFromDir(fullPath));
    } else if (
      entry.isFile() &&
      /^(cohort-report-.*\.json|migration-execution\.json|.*-execution\.json)$/i.test(
        entry.name,
      )
    ) {
      found.push(fullPath);
    }
  }
  return found;
}

export function loadExecutionReports(pathSpec: string): {
  readonly reports: readonly MigrationExecutionReport[];
  readonly warnings: readonly string[];
} {
  const reports: MigrationExecutionReport[] = [];
  const warnings: string[] = [];
  const candidateFiles: string[] = [];

  const specs = pathSpec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const spec of specs) {
    if (!existsSync(spec)) {
      warnings.push(
        `Execution reports path "${spec}" does not exist. Proceeding without execution report correlation for this path.`,
      );
      continue;
    }

    const st = statSync(spec);
    if (st.isDirectory()) {
      const files = collectExecutionReportFilesFromDir(spec);
      if (files.length === 0) {
        warnings.push(
          `No cohort execution reports (cohort-report-*.json or migration-execution.json) found in directory "${spec}".`,
        );
      } else {
        candidateFiles.push(...files);
      }
    } else if (st.isFile()) {
      candidateFiles.push(spec);
    }
  }

  for (const filePath of candidateFiles) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;

      if (raw && typeof raw === 'object') {
        const record = raw as Record<string, unknown>;
        const rawResults = Array.isArray(record.results)
          ? record.results
          : Array.isArray(record.moduleResults)
            ? record.moduleResults
            : undefined;
        if (rawResults) {
          const parsedModules: ModuleExecutionResult[] = rawResults.map(
            (item) => {
              const modVal = validateModuleExecutionResult(item);
              return modVal.success
                ? modVal.data
                : (item as ModuleExecutionResult);
            },
          );
          reports.push({
            schemaVersion: MIGRATION_SCHEMA_VERSION,
            planId:
              typeof record.planId === 'string' ? record.planId : 'cohort-plan',
            executedAt:
              typeof record.executedAt === 'string'
                ? record.executedAt
                : new Date().toISOString(),
            status:
              record.status === 'complete' ||
              record.status === 'partial' ||
              record.status === 'failed'
                ? record.status
                : 'partial',
            exitCode:
              record.exitCode === 0 ||
              record.exitCode === 1 ||
              record.exitCode === 4
                ? record.exitCode
                : 1,
            dryRun: Boolean(record.dryRun),
            results: parsedModules,
          });
          continue;
        }
      }

      warnings.push(
        `Skipped unrecognized execution report schema in "${filePath}".`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Failed to parse execution report "${filePath}": ${sanitizeDiagnostics(msg)}`,
      );
    }
  }

  return { reports, warnings };
}

function getCategoryForModule(moduleId: string): RemediationCategory {
  if (
    moduleId === 'repo-secrets' ||
    moduleId === 'actions-secrets' ||
    moduleId === 'org-secrets' ||
    moduleId === 'environment-secrets' ||
    moduleId === 'codespaces-secrets' ||
    moduleId === 'dependabot-secrets' ||
    moduleId === 'repo-variables' ||
    moduleId === 'org-variables' ||
    moduleId === 'environment-variables'
  ) {
    return 'secrets-and-variables';
  }
  if (
    moduleId === 'rulesets' ||
    moduleId === 'org-rulesets' ||
    moduleId === 'branch-protection' ||
    moduleId === 'code-scanning' ||
    moduleId === 'dependabot-Security' ||
    moduleId === 'secret-scanning' ||
    moduleId === 'security-advisories' ||
    moduleId === 'actions-policies' ||
    moduleId === 'ip-allow-lists'
  ) {
    return 'security-and-policies';
  }
  if (
    moduleId === 'releases' ||
    moduleId === 'lfs' ||
    moduleId === 'git-lfs' ||
    moduleId === 'packages' ||
    moduleId === 'pages' ||
    moduleId === 'wiki'
  ) {
    return 'assets-and-storage';
  }
  if (
    moduleId === 'collaborators' ||
    moduleId === 'teams' ||
    moduleId === 'custom-roles' ||
    moduleId === 'post-migration-mannequins'
  ) {
    return 'identity-and-access';
  }
  if (
    moduleId === 'webhooks' ||
    moduleId === 'org-webhooks' ||
    moduleId === 'deploy-keys' ||
    moduleId === 'autolinks' ||
    moduleId === 'apps-inventory' ||
    moduleId === 'actions-runners'
  ) {
    return 'webhooks-and-integrations';
  }
  if (
    moduleId === 'issues' ||
    moduleId === 'pull-requests' ||
    moduleId === 'repo-settings' ||
    moduleId === 'discussions' ||
    moduleId === 'projects-v2' ||
    moduleId === 'environments' ||
    moduleId === 'custom-properties' ||
    moduleId === 'org-custom-properties'
  ) {
    return 'metadata-and-content';
  }
  return 'general';
}

interface ExtractedExecutionFailure {
  readonly moduleId: string;
  readonly targetIdentifier?: string | undefined;
  readonly repoName?: string | undefined;
  readonly operationId?: string | undefined;
  readonly errorSummary: string;
  readonly resourceLabel: string;
  matched: boolean;
}

export function generateRemediationPlan(
  report: VerificationReport,
  specContent?: string | undefined,
  executionReports?: readonly MigrationExecutionReport[] | undefined,
  initialWarnings?: readonly string[] | undefined,
): RemediationPlan {
  void specContent;
  const actions: RemediationAction[] = [];
  const warnings: string[] = [...(initialWarnings ?? [])];
  let actionCounter = 1;

  const extractRepoFromTarget = (
    target?: string | undefined,
  ): string | undefined => {
    if (!target) return undefined;
    const trimmed = target.trim();
    if (!trimmed) return undefined;
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      return parts[1]?.trim() || undefined;
    }
    if (
      trimmed.toLowerCase() !== report.targetOrg.toLowerCase() &&
      trimmed.toLowerCase() !== report.sourceOrg.toLowerCase()
    ) {
      return trimmed;
    }
    return undefined;
  };

  const extractRepoName = (resourceName: string): string | undefined => {
    const trimmed = resourceName.trim();
    if (!trimmed) return undefined;
    const basePart = trimmed.split(/\s+/)[0] ?? '';
    if (basePart.includes('/')) {
      const [first, second] = basePart.split('/');
      if (
        first &&
        second &&
        (first.toLowerCase() === report.targetOrg.toLowerCase() ||
          first.toLowerCase() === report.sourceOrg.toLowerCase())
      ) {
        return second.split(':')[0];
      }
      if (first) {
        return first.split(':')[0];
      }
    }
    if (basePart.includes(':')) {
      const [first] = basePart.split(':');
      if (
        first &&
        first.toLowerCase() !== report.targetOrg.toLowerCase() &&
        first.toLowerCase() !== report.sourceOrg.toLowerCase()
      ) {
        return first;
      }
    }
    return undefined;
  };

  const healedModuleTargets = new Set<string>();
  const healedOperationIds = new Set<string>();
  for (const execReport of executionReports ?? []) {
    for (const modRes of execReport.results) {
      const modTarget = modRes.targetIdentifier ?? '';
      if (modRes.status === 'complete' || modRes.status === 'skipped') {
        healedModuleTargets.add(`${modRes.moduleId}::${modTarget}`);
      }
      for (const op of modRes.results ?? []) {
        if (op.status === 'succeeded' && op.operationId) {
          healedOperationIds.add(
            `${modRes.moduleId}::${op.targetIdentifier ?? modTarget}::${op.operationId}`,
          );
        }
      }
    }
  }

  const executionFailures: ExtractedExecutionFailure[] = [];
  for (const execReport of executionReports ?? []) {
    for (const modRes of execReport.results) {
      const modTarget = modRes.targetIdentifier;
      const failedOps = (modRes.results ?? []).filter(
        (op) =>
          op.status === 'failed' &&
          !(
            op.operationId &&
            healedOperationIds.has(
              `${modRes.moduleId}::${op.targetIdentifier ?? modTarget ?? ''}::${op.operationId}`,
            )
          ),
      );

      if (failedOps.length > 0) {
        for (const op of failedOps) {
          const effTarget = op.targetIdentifier ?? modTarget;
          const repoName =
            extractRepoFromTarget(effTarget) ??
            extractRepoName(op.operationId ?? '');
          const rawErr = op.error
            ? sanitizeDiagnostics(op.error)
            : `Operation "${op.operationId}" failed during apply()`;
          const errorSummary =
            op.httpStatus !== undefined &&
            !rawErr.includes(String(op.httpStatus))
              ? `HTTP ${op.httpStatus}: ${rawErr}`
              : rawErr;
          const resourceLabel = repoName
            ? op.operationId &&
              !op.operationId.toLowerCase().includes(repoName.toLowerCase())
              ? `${repoName}/${op.operationId}`
              : repoName
            : (effTarget ?? op.operationId ?? modRes.moduleId);

          executionFailures.push({
            moduleId: modRes.moduleId,
            targetIdentifier: effTarget,
            repoName,
            operationId: op.operationId,
            errorSummary,
            resourceLabel,
            matched: false,
          });
        }
      } else if (
        (modRes.status === 'failed' || modRes.status === 'partial') &&
        (modRes.results ?? []).filter((op) => op.status === 'failed').length ===
          0
      ) {
        const isHealedGeiMetadataFallback =
          modRes.moduleId === 'gei-repo' &&
          modRes.status === 'partial' &&
          Array.isArray(modRes.failedMetadataCategories) &&
          modRes.failedMetadataCategories.length > 0 &&
          modRes.failedMetadataCategories.every((cat) =>
            healedModuleTargets.has(`${cat}::${modTarget ?? ''}`),
          );
        if (
          isHealedGeiMetadataFallback ||
          healedModuleTargets.has(`${modRes.moduleId}::${modTarget ?? ''}`)
        ) {
          continue;
        }
        const repoName = extractRepoFromTarget(modTarget);
        const failedMeta =
          modRes.failedMetadataCategories &&
          modRes.failedMetadataCategories.length > 0
            ? ` (failed metadata: ${modRes.failedMetadataCategories.join(', ')})`
            : '';
        const errorSummary = sanitizeDiagnostics(
          `Module "${modRes.moduleId}" exited with status="${modRes.status}"${failedMeta}`,
        );
        const resourceLabel = repoName ?? modTarget ?? modRes.moduleId;
        executionFailures.push({
          moduleId: modRes.moduleId,
          targetIdentifier: modTarget,
          repoName,
          errorSummary,
          resourceLabel,
          matched: false,
        });
      }
    }
  }

  const findMatchingExecutionError = (
    modId: string,
    effectiveModuleId: string,
    resourceName: string,
  ): string | undefined => {
    const discRepo = extractRepoName(resourceName);
    const candidates = executionFailures.filter(
      (f) => f.moduleId === modId || f.moduleId === effectiveModuleId,
    );
    if (candidates.length === 0) {
      return undefined;
    }

    const matched = candidates.filter((f) => {
      if (discRepo && f.repoName) {
        return discRepo.toLowerCase() === f.repoName.toLowerCase();
      }
      if (
        f.operationId &&
        resourceName.toLowerCase().includes(f.operationId.toLowerCase())
      ) {
        return true;
      }
      if (
        f.repoName &&
        resourceName.toLowerCase().includes(f.repoName.toLowerCase())
      ) {
        return true;
      }
      if (!discRepo && !f.repoName) {
        return true;
      }
      return candidates.length === 1;
    });

    if (matched.length === 0) {
      return undefined;
    }

    for (const m of matched) {
      m.matched = true;
    }

    return Array.from(new Set(matched.map((m) => m.errorSummary))).join('; ');
  };

  const withExecutionAttribution = (
    action: RemediationAction,
    sourceModId: string,
  ): RemediationAction => {
    const execError = findMatchingExecutionError(
      sourceModId,
      action.moduleId,
      action.resourceName,
    );
    if (!execError) {
      return action;
    }
    return {
      ...action,
      description: `${action.description} (Apply root cause: ${execError})`,
      executionError: execError,
    };
  };

  for (const moduleResult of report.modules) {
    for (const modWarning of moduleResult.warnings ?? []) {
      const formattedWarning = `Module "${moduleResult.moduleId}" warning: ${sanitizeDiagnostics(modWarning)}`;
      if (!warnings.includes(formattedWarning)) {
        warnings.push(formattedWarning);
      }
    }

    if (moduleResult.verified && moduleResult.discrepancies.length === 0) {
      continue;
    }

    const modId = moduleResult.moduleId;

    for (const disc of moduleResult.discrepancies) {
      const actionId = `action-${actionCounter++}`;
      const sanitizedDiscMessage = sanitizeDiagnostics(disc.message);

      if (modId === 'repo-secrets' || modId === 'actions-secrets') {
        const secretRepo =
          extractRepoName(disc.resourceName) ??
          disc.resourceName.split('/')[0] ??
          '';
        const repoFlag = secretRepo ? ` --repos "${secretRepo}"` : '';
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'secrets-and-variables',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Missing secret "${disc.resourceName}". Provisioning DEC-004 sealed blank placeholder at destination.`,
              command: `# DEC-004: Reserve sealed blank placeholder footprint without exposing credentials\nghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"${repoFlag} || printf "" | gh secret set "${disc.resourceName}" --repo "${report.targetOrg}/${secretRepo}"`,
              severity: 'critical',
            },
            modId,
          ),
        );
      } else if (modId === 'webhooks' || modId === 'org-webhooks') {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'webhooks-and-integrations',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Webhook configuration or activation discrepancy on "${disc.resourceName}": ${sanitizedDiscMessage}`,
              command: `ghec-consultant-cli migrate --modules ${modId} --scope "./scopes/${report.scopeName}.json"`,
              severity: 'medium',
            },
            modId,
          ),
        );
      } else if (modId === 'repo-variables') {
        const expectedVal =
          typeof disc.expected === 'string'
            ? disc.expected
            : JSON.stringify(disc.expected ?? '');
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'secrets-and-variables',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Missing or drifted repository variable "${disc.resourceName}".`,
              command: `gh variable set "${disc.resourceName}" --body "${expectedVal.replace(/"/g, '\\"')}" --repo "${report.targetOrg}/${disc.resourceName.split('/')[0] ?? ''}"`,
              severity: 'medium',
            },
            modId,
          ),
        );
      } else if (
        modId === 'rulesets' ||
        modId === 'org-rulesets' ||
        modId === 'branch-protection'
      ) {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'security-and-policies',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Policy configuration discrepancy in "${disc.resourceName}": ${sanitizedDiscMessage}`,
              command: `ghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"`,
              severity: 'high',
            },
            modId,
          ),
        );
      } else if (modId === 'releases') {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'assets-and-storage',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Release or binary asset missing in "${disc.resourceName}".`,
              command: `ghec-consultant-cli migrate --modules releases --scope "./scopes/${report.scopeName}.json"`,
              severity: 'high',
            },
            modId,
          ),
        );
      } else if (modId === 'lfs') {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'assets-and-storage',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Git LFS object transfer incomplete for "${disc.resourceName}".`,
              command: `ghec-consultant-cli migrate --modules lfs --scope "./scopes/${report.scopeName}.json"`,
              severity: 'high',
            },
            modId,
          ),
        );
      } else if (
        modId === 'collaborators' ||
        modId === 'teams' ||
        modId === 'custom-roles'
      ) {
        const description =
          sanitizedDiscMessage ||
          `Identity reconciliation discrepancy for "${disc.resourceName}".`;
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'identity-and-access',
              moduleId: modId,
              resourceName: disc.resourceName,
              description,
              command: `ghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"`,
              severity: 'medium',
            },
            modId,
          ),
        );
      } else if (modId === 'issues') {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'metadata-and-content',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Issue or milestone discrepancy in "${disc.resourceName}": ${sanitizedDiscMessage}`,
              command: `ghec-consultant-cli migrate --modules issues --scope "./scopes/${report.scopeName}.json"`,
              severity: 'high',
            },
            modId,
          ),
        );
      } else if (modId === 'pull-requests') {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'metadata-and-content',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Pull request parity discrepancy in "${disc.resourceName}": ${sanitizedDiscMessage}`,
              command: `ghec-consultant-cli migrate --modules pull-requests --scope "./scopes/${report.scopeName}.json"`,
              severity: 'high',
            },
            modId,
          ),
        );
      } else if (modId === 'repo-settings') {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: 'metadata-and-content',
              moduleId: modId,
              resourceName: disc.resourceName,
              description: `Repository settings or feature flag drift in "${disc.resourceName}": ${sanitizedDiscMessage}`,
              command: `ghec-consultant-cli migrate --modules repo-settings --scope "./scopes/${report.scopeName}.json"`,
              severity: 'medium',
            },
            modId,
          ),
        );
      } else if (modId === 'gei-repo') {
        const resLower = disc.resourceName.toLowerCase();
        if (resLower === 'issues' || resLower.includes('issue')) {
          actions.push(
            withExecutionAttribution(
              {
                id: actionId,
                category: 'metadata-and-content',
                moduleId: 'issues',
                resourceName: disc.resourceName,
                description: `GEI omitted issues for "${disc.resourceName}": ${sanitizedDiscMessage}`,
                command: `ghec-consultant-cli migrate --modules issues --scope "./scopes/${report.scopeName}.json"`,
                severity: 'high',
              },
              modId,
            ),
          );
        } else if (
          resLower === 'pull-requests' ||
          resLower.includes('pull') ||
          resLower.includes('pr')
        ) {
          actions.push(
            withExecutionAttribution(
              {
                id: actionId,
                category: 'metadata-and-content',
                moduleId: 'pull-requests',
                resourceName: disc.resourceName,
                description: `GEI omitted pull requests for "${disc.resourceName}": ${sanitizedDiscMessage}`,
                command: `ghec-consultant-cli migrate --modules pull-requests --scope "./scopes/${report.scopeName}.json"`,
                severity: 'high',
              },
              modId,
            ),
          );
        } else if (resLower === 'releases' || resLower.includes('release')) {
          actions.push(
            withExecutionAttribution(
              {
                id: actionId,
                category: 'assets-and-storage',
                moduleId: 'releases',
                resourceName: disc.resourceName,
                description: `GEI omitted releases or release assets for "${disc.resourceName}": ${sanitizedDiscMessage}`,
                command: `ghec-consultant-cli migrate --modules releases --scope "./scopes/${report.scopeName}.json"`,
                severity: 'high',
              },
              modId,
            ),
          );
        } else if (
          resLower === 'repo-settings' ||
          resLower === 'default-branch' ||
          resLower.includes('setting')
        ) {
          actions.push(
            withExecutionAttribution(
              {
                id: actionId,
                category: 'metadata-and-content',
                moduleId: 'repo-settings',
                resourceName: disc.resourceName,
                description: `GEI settings or branch drift for "${disc.resourceName}": ${sanitizedDiscMessage}`,
                command: `ghec-consultant-cli migrate --modules repo-settings --scope "./scopes/${report.scopeName}.json"`,
                severity: 'medium',
              },
              modId,
            ),
          );
        } else {
          actions.push(
            withExecutionAttribution(
              {
                id: actionId,
                category: 'general',
                moduleId: modId,
                resourceName: disc.resourceName,
                description: sanitizedDiscMessage,
                command: `ghec-consultant-cli migrate --modules gei-repo --scope "./scopes/${report.scopeName}.json"`,
                severity: 'high',
              },
              modId,
            ),
          );
        }
      } else {
        actions.push(
          withExecutionAttribution(
            {
              id: actionId,
              category: getCategoryForModule(modId),
              moduleId: modId,
              resourceName: disc.resourceName,
              description: sanitizedDiscMessage,
              command: `ghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"`,
              severity: 'medium',
            },
            modId,
          ),
        );
      }
    }
  }

  // Synthesize remediation actions for any apply() failures not covered by VerificationReport discrepancies
  let unverifiedExecutionFailures = 0;
  const unmatchedByKey = new Map<
    string,
    {
      moduleId: string;
      resourceLabel: string;
      errors: Set<string>;
    }
  >();

  for (const failure of executionFailures) {
    if (failure.matched) {
      continue;
    }
    const key = `${failure.moduleId}::${failure.resourceLabel}`;
    let group = unmatchedByKey.get(key);
    if (!group) {
      group = {
        moduleId: failure.moduleId,
        resourceLabel: failure.resourceLabel,
        errors: new Set<string>(),
      };
      unmatchedByKey.set(key, group);
    }
    group.errors.add(failure.errorSummary);
  }

  for (const group of unmatchedByKey.values()) {
    unverifiedExecutionFailures++;
    const combinedError = Array.from(group.errors).join('; ');
    const warningMsg = `Unverified apply() failure detected: module "${group.moduleId}" failed on "${group.resourceLabel}" (${combinedError}), but VerificationReport recorded 0 discrepancies. Synthesized remediation action.`;
    warnings.push(warningMsg);

    const actionId = `action-${actionCounter++}`;
    actions.push({
      id: actionId,
      category: getCategoryForModule(group.moduleId),
      moduleId: group.moduleId,
      resourceName: group.resourceLabel,
      description: `[SYNTHESIZED FROM APPLY FAILURE] Module "${group.moduleId}" failed during apply() on "${group.resourceLabel}": ${combinedError}`,
      command: `ghec-consultant-cli migrate --modules "${group.moduleId}" --scope "./scopes/${report.scopeName}.json"`,
      severity: 'high',
      executionError: combinedError,
      synthesizedFromExecution: true,
    });
  }

  const orgLevelModules = new Set([
    'org-variables',
    'org-secrets',
    'org-custom-properties',
    'org-rulesets',
    'org-webhooks',
    'teams',
    'post-migration-mannequins',
    'packages',
    'custom-roles',
    'org-settings',
    'actions-policies',
    'actions-runners',
    'ip-allow-lists',
    'apps-inventory',
    'projects-v2',
  ]);

  const reposByModule = new Map<string, Set<string>>();
  for (const a of actions) {
    if (!orgLevelModules.has(a.moduleId)) {
      const repo =
        extractRepoName(a.resourceName) ??
        extractRepoFromTarget(a.resourceName);
      if (repo) {
        let set = reposByModule.get(a.moduleId);
        if (!set) {
          set = new Set<string>();
          reposByModule.set(a.moduleId, set);
        }
        set.add(repo);
      }
    }
  }

  const scriptHeader = `#!/usr/bin/env bash\n# Automated Migration Remediation Script\n# Target Enterprise: ${report.targetOrg}\n# Generated: ${new Date().toISOString()}\nset -uo pipefail\nif ! command -v ghec-consultant-cli >/dev/null 2>&1; then\n  if [ -f "./bin/ghec-consultant-cli.mjs" ]; then\n    _ghec_cli_bin="./bin/ghec-consultant-cli.mjs"\n  elif [ -f "./apps/cli/bin/ghec-consultant-cli.mjs" ]; then\n    _ghec_cli_bin="./apps/cli/bin/ghec-consultant-cli.mjs"\n  fi\n  if [ -n "\${_ghec_cli_bin:-}" ]; then\n    _ghec_rem_seq=0\n    ghec-consultant-cli() {\n      if [ "\${1:-}" = "migrate" ] && [[ " $* " != *" --output "* ]]; then\n        _ghec_rem_seq=$((_ghec_rem_seq + 1))\n        mkdir -p ./scans\n        local _out="./scans/remediation-execution-\${_ghec_rem_seq}.json"\n        node "$_ghec_cli_bin" "$@" --output "$_out"\n        local _rc=$?\n        [ -f "$_out" ] && cp "$_out" ./scans/migration-execution.json\n        return $_rc\n      fi\n      node "$_ghec_cli_bin" "$@"\n    }\n  fi\nfi\nexport GH_TOKEN="\${GHEC_TARGET_TOKEN:-\${GH_TOKEN:-}}"\n\n`;
  const executedCommands = new Set<string>();
  const scriptBody = actions
    .map((a) => {
      const repoSet = reposByModule.get(a.moduleId);
      const effectiveCommand =
        repoSet &&
        repoSet.size > 0 &&
        a.command.startsWith('ghec-consultant-cli migrate ')
          ? `${a.command} --repos "${Array.from(repoSet).join(',')}"`
          : a.command;
      const isDuplicate = executedCommands.has(effectiveCommand);
      executedCommands.add(effectiveCommand);
      return `# [${a.severity.toUpperCase()}] ${a.description}\necho "Executing remediation for ${a.resourceName}..."\n${isDuplicate ? `# (Already executed in this batch): ${effectiveCommand.replace(/\n/g, ' ')}` : `${effectiveCommand} || echo "WARN: Remediation command for ${a.resourceName} exited non-zero; continuing..."`}\n`;
    })
    .join('\n');

  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    planId: `remedy-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    reportId: report.reportId,
    sourceOrg: report.sourceOrg,
    targetOrg: report.targetOrg,
    totalDiscrepancies: report.summary.discrepancyCount,
    unverifiedExecutionFailures,
    actionableCount: actions.length,
    ...(warnings.length > 0 ? { warnings } : {}),
    actions,
    script: scriptHeader + (scriptBody || '# Zero discrepancies detected.\n'),
  };
}

export function formatRemediationMarkdown(plan: RemediationPlan): string {
  const lines: string[] = [];

  lines.push('## 🤖 Agentic Remediation Plan');
  lines.push('');
  lines.push(
    `> **Target Organization:** \`${plan.targetOrg}\` &nbsp;|&nbsp; **Source Organization:** \`${plan.sourceOrg}\` &nbsp;|&nbsp; **Report ID:** \`${plan.reportId}\``,
  );
  lines.push('');

  if (plan.warnings && plan.warnings.length > 0) {
    lines.push('### ⚠️ Execution & Observability Warnings');
    lines.push('');
    for (const warning of plan.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push('');
  }

  if (plan.actions.length === 0) {
    lines.push('### ✅ Zero Discrepancies Detected');
    lines.push(
      'Target state is 100% compliant with source configuration. No remediation required.',
    );
    return lines.join('\n');
  }

  lines.push('### 📋 Discrepancy & Remediation Summary');
  lines.push('');
  lines.push(
    '| Severity | Category | Module | Resource | Root Cause / Execution Error | Action / Command |',
  );
  lines.push('|:---|:---|:---|:---|:---|:---|');

  for (const action of plan.actions) {
    const sevBadge =
      action.severity === 'critical'
        ? '🔴 Critical'
        : action.severity === 'high'
          ? '🟠 High'
          : action.severity === 'medium'
            ? '🟡 Medium'
            : '⚪ Low';

    const shortCmd = action.command.split('\n')[0] ?? '';
    const synthTag = action.synthesizedFromExecution
      ? '**[SYNTHESIZED FROM APPLY FAILURE]** '
      : '';
    const rootCauseCell = action.executionError
      ? `${synthTag}\`${action.executionError.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')}\``
      : synthTag || '_Verification discrepancy_';

    lines.push(
      `| ${sevBadge} | \`${action.category}\` | \`${action.moduleId}\` | \`${action.resourceName}\` | ${rootCauseCell} | \`${shortCmd}\` |`,
    );
  }

  lines.push('');
  lines.push('### ⚡ Automated Remediation Shell Script (`remediation.sh`)');
  lines.push('');
  lines.push('```bash');
  lines.push(plan.script.trim());
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export async function executeAgentReviewCommand(
  options: AgentReviewOptions,
): Promise<{
  plan: RemediationPlan;
  jsonPath: string;
  markdownPath: string;
}> {
  if (!existsSync(options.reportPath)) {
    throw new Error(
      `Verification report file not found at "${options.reportPath}".`,
    );
  }

  let reportJson: unknown;
  try {
    reportJson = JSON.parse(readFileSync(options.reportPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `Failed to parse verification report JSON from "${options.reportPath}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (
    reportJson &&
    typeof reportJson === 'object' &&
    Array.isArray((reportJson as { modules?: unknown[] }).modules)
  ) {
    for (const mod of (reportJson as { modules: Record<string, unknown>[] })
      .modules) {
      if (mod && Array.isArray(mod.discrepancies)) {
        for (const d of mod.discrepancies as Record<string, unknown>[]) {
          if (d && typeof d === 'object') {
            if (!('expected' in d) || d.expected === undefined) {
              d.expected = null;
            }
            if (!('actual' in d) || d.actual === undefined) {
              d.actual = null;
            }
          }
        }
      }
    }
  }

  const reportValidation = validateVerificationReport(reportJson);
  if (!reportValidation.success) {
    throw new Error(
      `Invalid verification report schema in "${options.reportPath}": ${reportValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  let specContent: string | undefined;
  if (options.specPath && existsSync(options.specPath)) {
    specContent = readFileSync(options.specPath, 'utf8');
  }

  let executionReports: readonly MigrationExecutionReport[] | undefined;
  let executionWarnings: readonly string[] | undefined;
  if (options.executionReportsPath) {
    const loaded = loadExecutionReports(options.executionReportsPath);
    executionReports = loaded.reports;
    executionWarnings = loaded.warnings;
  }

  const plan = generateRemediationPlan(
    reportValidation.data,
    specContent,
    executionReports,
    executionWarnings,
  );
  const markdown = formatRemediationMarkdown(plan);

  const jsonPath = resolve(options.outputPath);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2), 'utf8');

  const markdownPath = resolve(options.outputMarkdownPath);
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, markdown, 'utf8');

  if (options.appendStepSummary && process.env.GITHUB_STEP_SUMMARY) {
    appendStepSummary(markdown);
  }

  return { plan, jsonPath, markdownPath };
}
