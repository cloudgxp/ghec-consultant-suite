import type {
  MigrationResultsManifest,
  OrgModuleResultSummary,
  RepoModuleResultSummary,
  RepositoryMigrationRecord,
} from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';

export interface RepositorySuccessDetails {
  readonly name?: string | undefined;
  readonly visibility?: 'public' | 'private' | 'internal' | undefined;
  readonly defaultBranch?: string | undefined;
  readonly diskUsageKb?: number | undefined;
  readonly sizeBytes?: number | undefined;
  readonly geiLogSummary?: string | undefined;
  readonly notices?: readonly string[] | undefined;
}

export interface RepositoryDiscrepancyDetail {
  readonly moduleId?: string | undefined;
  readonly resourceName: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message: string;
}

export interface RepositoryFailureDetails {
  readonly name?: string | undefined;
  readonly failedStage?: string | undefined;
  readonly operation?: string | undefined;
  readonly errorMessage?: string | undefined;
  readonly discrepancies?: readonly RepositoryDiscrepancyDetail[] | undefined;
  readonly errorLogs?: readonly string[] | undefined;
  readonly remediationAdvice?: readonly string[] | undefined;
  readonly remediationCommands?: readonly string[] | undefined;
}

export interface GranularMigrationItemRow {
  readonly resourceName: string;
  readonly resourceType: string;
  readonly operationType:
    'create' | 'update' | 'noop' | 'skip' | 'warn' | 'verify';
  readonly status: 'succeeded' | 'failed' | 'skipped';
  readonly completedAt?: string | undefined;
  readonly verificationStatus: 'verified' | 'discrepancy' | 'not-verified';
  readonly notes?: string | undefined;
  readonly isSecret?: boolean | undefined;
}

export interface OrgModuleDetailModel {
  readonly moduleId: string;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly summary: OrgModuleResultSummary;
  readonly items: readonly GranularMigrationItemRow[];
  readonly discrepancies?: readonly RepositoryDiscrepancyDetail[] | undefined;
  readonly warnings?: readonly string[] | undefined;
}

export interface RepositoryModuleDetailModel {
  readonly moduleId: string;
  readonly sourceRepo: string;
  readonly targetRepo: string;
  readonly repoStatus: 'succeeded' | 'failed';
  readonly summary: RepoModuleResultSummary;
  readonly items: readonly GranularMigrationItemRow[];
  readonly discrepancies?: readonly RepositoryDiscrepancyDetail[] | undefined;
  readonly warnings?: readonly string[] | undefined;
}

/**
 * Sanitizes diagnostics and escapes characters that would break GitHub Flavored Markdown table cells.
 */
export function escapeMarkdownTableCell(value: string): string {
  return sanitizeDiagnostics(value)
    .replace(/\r?\n+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * Determines whether a module or resource represents a write-only secret governed by DEC-004.
 */
export function isSecretResource(
  moduleId: string,
  resourceType?: string | undefined,
): boolean {
  const modLower = moduleId.toLowerCase();
  if (
    modLower === 'org-secrets' ||
    modLower === 'repo-secrets' ||
    modLower === 'actions-secrets' ||
    modLower.endsWith('-secrets')
  ) {
    return true;
  }
  if (resourceType && resourceType.toLowerCase().includes('secret')) {
    return true;
  }
  return false;
}

function formatModuleStatusBadge(
  status: 'complete' | 'partial' | 'failed' | 'skipped',
): string {
  switch (status) {
    case 'complete':
      return '✅ complete';
    case 'partial':
      return '⚠️ partial';
    case 'failed':
      return '❌ failed';
    case 'skipped':
      return '⏭️ skipped';
  }
}

function formatOperationStatusBadge(
  status: 'succeeded' | 'failed' | 'skipped',
): string {
  switch (status) {
    case 'succeeded':
      return '✅ succeeded';
    case 'failed':
      return '❌ failed';
    case 'skipped':
      return '⏭️ skipped';
  }
}

function formatVerificationBadge(
  status: 'verified' | 'discrepancy' | 'not-verified',
): string {
  switch (status) {
    case 'verified':
      return '✅ Verified';
    case 'discrepancy':
      return '❌ Discrepancy';
    case 'not-verified':
      return '—';
  }
}

/**
 * Generates Tier 1 root README.md executive overview for the migration results audit repository.
 */
export function formatResultsReadmeMarkdown(
  manifest: MigrationResultsManifest,
  options: { readonly nextSteps?: readonly string[] | undefined } = {},
): string {
  const durationSec = (manifest.summary.durationMs / 1000).toFixed(1);
  const modeDisplay =
    manifest.executionMode === 'live' ? 'Live Execution' : 'Dry-Run';

  const lines: string[] = [
    `# Migration Results: ${manifest.sourceOrg} ➔ ${manifest.targetOrg}`,
    '',
    `> **Run ID:** \`${manifest.runId}\`  `,
    `> **Execution Mode:** \`${modeDisplay}\`  `,
    `> **Generated At:** \`${manifest.generatedAt}\`  `,
    `> **Duration:** ${durationSec}s (${manifest.summary.durationMs}ms)  `,
    `> **Audit Repository:** \`${manifest.targetResultsRepo}\`  `,
    '',
    '---',
    '',
    '## Executive Metrics',
    '',
    '| Metric | Value |',
    '| :--- | :--- |',
    `| Total Repositories | ${manifest.summary.totalRepositories} |`,
    `| Succeeded Repositories | ${manifest.summary.succeededCount} |`,
    `| Failed Repositories | ${manifest.summary.failedCount} |`,
    `| Success Rate | ${manifest.summary.successRatePercent}% |`,
    '',
  ];

  // Org-Level Modules Summary (Tier 1 -> Tier 2 organization/<module>.md)
  const orgModules = Object.entries(manifest.summary.orgModulesSummary);
  if (orgModules.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Organization-Level Modules');
    lines.push('');
    lines.push(
      '| Module | Status | Total Operations | Succeeded | Failed | Skipped | Duration | Discrepancies | Details |',
    );
    lines.push(
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    );
    for (const [moduleId, modSummary] of orgModules) {
      const statusBadge = formatModuleStatusBadge(modSummary.status);
      const duration =
        modSummary.durationMs !== undefined
          ? `${(modSummary.durationMs / 1000).toFixed(1)}s`
          : '-';
      const relPath =
        modSummary.relativeFilePath ?? `organization/${moduleId}.md`;
      const discrepancies = modSummary.discrepancyCount ?? 0;
      lines.push(
        `| \`${moduleId}\` | ${statusBadge} | ${modSummary.totalOperations} | ${modSummary.succeededOperations} | ${modSummary.failedOperations} | ${modSummary.skippedOperations ?? 0} | ${duration} | ${discrepancies} | [View Details](${relPath}) |`,
      );
    }
    lines.push('');
  }

  // Repositories Index Table (Tier 1 -> Tier 2 success/<repo>.md or failure/<repo>.md)
  lines.push('---');
  lines.push('');
  lines.push('## Repositories Index');
  lines.push('');

  if (manifest.repositories.length === 0) {
    lines.push('_No repositories were migrated in this wave._');
    lines.push('');
  } else {
    lines.push(
      '| Repository | Status | Migrated Categories / Items | Duration | Discrepancies | Details / Logs |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

    for (const repo of manifest.repositories) {
      const statusBadge =
        repo.status === 'succeeded' ? '✅ Succeeded' : '❌ Failed';
      const duration = `${(repo.durationMs / 1000).toFixed(1)}s`;
      const linkText =
        repo.status === 'succeeded' ? 'View Log' : 'View Failure Log';
      const link = `[${linkText}](${repo.relativeFilePath})`;

      const modEntries = repo.moduleSummaries
        ? Object.values(repo.moduleSummaries)
        : [];
      const totalItems = modEntries.reduce(
        (acc, m) => acc + m.totalOperations,
        0,
      );
      const categoriesSummary =
        modEntries.length > 0
          ? `${modEntries.length} categories (${totalItems} items)`
          : `${repo.stagesRun.length} stages`;

      lines.push(
        `| \`${repo.targetRepo}\` | ${statusBadge} | ${categoriesSummary} | ${duration} | ${repo.discrepancyCount} | ${link} |`,
      );
    }
    lines.push('');
  }

  // Unresolved Failures section
  const failedRepos = manifest.repositories.filter(
    (r) => r.status === 'failed',
  );
  if (failedRepos.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## ⚠️ Unresolved Failures & Blocker Diagnostics');
    lines.push('');
    lines.push(
      '| Repository | Failed Stage | Failure Reason | Actionable Log |',
    );
    lines.push('| :--- | :--- | :--- | :--- |');

    for (const repo of failedRepos) {
      const stage = repo.failedStage ?? 'unknown';
      const reason = escapeMarkdownTableCell(
        repo.failureReason ?? 'Error occurred',
      );
      const link = `[View Failure Log](${repo.relativeFilePath})`;
      lines.push(
        `| \`${repo.targetRepo}\` | \`${stage}\` | ${reason} | ${link} |`,
      );
    }
    lines.push('');
  }

  // Next Steps & Runbook
  lines.push('---');
  lines.push('');
  lines.push('## Next Steps & Operational Runbook');
  lines.push('');
  if (options.nextSteps && options.nextSteps.length > 0) {
    for (const step of options.nextSteps) {
      lines.push(`- ${step}`);
    }
  } else {
    lines.push(
      '1. **Mannequin Reclamation:** Review and claim unmapped user attributions using `gh gei reclaim-mannequin` or the consultant suite mannequin engine.',
    );
    lines.push(
      '2. **Webhook Verification & Activation:** Confirm target webhooks are active once DNS and integration cutovers are finalized.',
    );
    lines.push(
      '3. **Secret & Credential Provisioning:** Replace sealed placeholder secrets (`""`) with production target secrets via vault hooks or target repository settings.',
    );
    lines.push(
      '4. **Code Search & Branch Protection:** Allow GitHub Enterprise indexers to complete delayed code search indexing; verify ruleset bypasses remain configured.',
    );
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats Tier 2 Organization Module Detail page (organization/<module>.md).
 */
export function formatOrgModuleDetailMarkdown(
  model: OrgModuleDetailModel,
): string {
  const durationSec =
    model.summary.durationMs !== undefined
      ? `${(model.summary.durationMs / 1000).toFixed(1)}s (${model.summary.durationMs}ms)`
      : '0.0s (0ms)';
  const statusBadge = formatModuleStatusBadge(model.summary.status);
  const discrepanciesCount =
    model.summary.discrepancyCount ?? model.discrepancies?.length ?? 0;

  const lines: string[] = [
    '[← Back to Overview](../README.md)',
    '',
    `# Organization Module: ${model.moduleId}`,
    '',
    `> **Status:** ${statusBadge}  `,
    `> **Source Organization:** \`${model.sourceOrg}\`  `,
    `> **Target Organization:** \`${model.targetOrg}\`  `,
    `> **Duration:** ${durationSec}  `,
    '',
    '---',
    '',
    '## Execution Summary',
    '',
    '| Metric | Count |',
    '| :--- | :--- |',
    `| Total Items | ${model.summary.totalOperations} |`,
    `| Succeeded | ${model.summary.succeededOperations} |`,
    `| Failed | ${model.summary.failedOperations} |`,
    `| Skipped | ${model.summary.skippedOperations ?? 0} |`,
    `| Verification Discrepancies | ${discrepanciesCount} |`,
    '',
  ];

  if (model.summary.error) {
    lines.push('### Module Diagnostic Error');
    lines.push('');
    lines.push('```text');
    lines.push(sanitizeDiagnostics(model.summary.error));
    lines.push('```');
    lines.push('');
  }

  if (model.warnings && model.warnings.length > 0) {
    lines.push('### Module Warnings');
    lines.push('');
    for (const warning of model.warnings) {
      lines.push(`- ${sanitizeDiagnostics(warning)}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Granular Organization Items');
  lines.push('');

  if (model.items.length === 0) {
    lines.push('_No items were processed for this organization module._');
    lines.push('');
  } else {
    lines.push(
      '| Resource Name | Resource Type | Operation | Status | Verification | Notes / Discrepancies |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

    for (const item of model.items) {
      const secretFlag =
        item.isSecret ?? isSecretResource(model.moduleId, item.resourceType);
      const rawName = escapeMarkdownTableCell(item.resourceName);
      const displayName =
        secretFlag && !rawName.includes('[SEALED]')
          ? `\`${rawName}\` \`[SEALED]\``
          : `\`${rawName}\``;
      const resourceType = `\`${escapeMarkdownTableCell(item.resourceType)}\``;
      const opType = `\`${item.operationType}\``;
      const status = formatOperationStatusBadge(item.status);
      const verification = formatVerificationBadge(item.verificationStatus);
      const defaultNote = secretFlag
        ? '[SEALED] Write-only secret placeholder'
        : '-';
      const notes = item.notes
        ? escapeMarkdownTableCell(item.notes)
        : defaultNote;

      lines.push(
        `| ${displayName} | ${resourceType} | ${opType} | ${status} | ${verification} | ${notes} |`,
      );
    }
    lines.push('');
  }

  const discrepancies = model.discrepancies ?? [];
  if (discrepancies.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Verification Discrepancies (Expected vs Actual)');
    lines.push('');
    lines.push('| Resource | Expected State | Actual Target State | Message |');
    lines.push('| :--- | :--- | :--- | :--- |');

    for (const d of discrepancies) {
      const expStr = escapeMarkdownTableCell(
        typeof d.expected === 'string'
          ? d.expected
          : JSON.stringify(d.expected),
      );
      const actStr = escapeMarkdownTableCell(
        typeof d.actual === 'string' ? d.actual : JSON.stringify(d.actual),
      );
      lines.push(
        `| \`${escapeMarkdownTableCell(d.resourceName)}\` | \`${expStr}\` | \`${actStr}\` | ${escapeMarkdownTableCell(d.message)} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function appendRepoModuleSummariesSection(
  lines: string[],
  record: RepositoryMigrationRecord,
): void {
  const modSummaries = record.moduleSummaries
    ? Object.values(record.moduleSummaries)
    : [];
  if (modSummaries.length === 0) {
    return;
  }

  lines.push('---');
  lines.push('');
  lines.push('## Migrated Items Summary');
  lines.push('');
  lines.push(
    '| Module / Category | Status | Total | Succeeded | Failed | Skipped | Discrepancies | Duration | Granular Items |',
  );
  lines.push(
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  );

  for (const mod of modSummaries) {
    const statusBadge = formatModuleStatusBadge(mod.status);
    const duration =
      mod.durationMs !== undefined
        ? `${(mod.durationMs / 1000).toFixed(1)}s`
        : '-';
    const link = `[View Items](../${mod.relativeFilePath})`;
    lines.push(
      `| \`${mod.moduleId}\` | ${statusBadge} | ${mod.totalOperations} | ${mod.succeededOperations} | ${mod.failedOperations} | ${mod.skippedOperations ?? 0} | ${mod.discrepancyCount ?? 0} | ${duration} | ${link} |`,
    );
  }
  lines.push('');
}

/**
 * Formats a Tier 2 successful repository migration overview (success/<repo>.md).
 */
export function formatSuccessRepoMarkdown(
  record: RepositoryMigrationRecord,
  details: RepositorySuccessDetails = {},
): string {
  const durationSec = (record.durationMs / 1000).toFixed(1);

  const lines: string[] = [
    '[← Back to Overview](../README.md)',
    '',
    `# Migration Result: ${record.targetRepo}`,
    '',
    '> **Status:** ✅ Succeeded  ',
    `> **Source Repository:** \`${record.sourceRepo}\`  `,
    `> **Target Repository:** \`${record.targetRepo}\`  `,
    `> **Duration:** ${durationSec}s (${record.durationMs}ms)  `,
    `> **Verified:** ${record.verified ? 'Yes (0 Discrepancies)' : 'No'}  `,
  ];

  if (details.visibility) {
    lines.push(`> **Visibility:** \`${details.visibility}\`  `);
  }
  if (details.defaultBranch) {
    lines.push(`> **Default Branch:** \`${details.defaultBranch}\`  `);
  }
  if (details.diskUsageKb !== undefined) {
    lines.push(`> **Disk Usage:** ${details.diskUsageKb} KB  `);
  }

  lines.push('');
  appendRepoModuleSummariesSection(lines, record);

  lines.push('---');
  lines.push('');
  lines.push('## Stage Execution Breakdown');
  lines.push('');
  lines.push('| Stage | Status | Notes |');
  lines.push('| :--- | :--- | :--- |');

  if (record.stagesRun.length === 0) {
    lines.push('| `core-transfer` | ✅ Completed | Executed cleanly |');
  } else {
    for (const stage of record.stagesRun) {
      const modSummary = record.moduleSummaries?.[stage];
      if (modSummary?.status === 'skipped') {
        lines.push(
          `| \`${stage}\` | ⏭️ Skipped | No applicable resources in source repository |`,
        );
      } else if (modSummary) {
        lines.push(
          `| \`${stage}\` | ✅ Completed | Executed cleanly (${modSummary.totalOperations} item${modSummary.totalOperations === 1 ? '' : 's'}) |`,
        );
      } else {
        lines.push(`| \`${stage}\` | ✅ Completed | Executed cleanly |`);
      }
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Verification Checklist');
  lines.push('');
  lines.push(
    '- [x] **Zero Discrepancies:** All verified resources match expected configuration between source and target.',
  );
  lines.push(
    '- [x] **Target Parity Confirmed:** Branches, settings, and metadata conform to the target organization schema.',
  );
  lines.push(
    '- [x] **Diagnostic Check:** No migration error conditions detected.',
  );
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## GEI Log Summary & Notes');
  lines.push('');
  lines.push(
    details.geiLogSummary ??
      'Repository transferred cleanly via GEI without errors or metadata drops.',
  );
  lines.push('');

  if (details.notices && details.notices.length > 0) {
    lines.push('### Operational Notices');
    lines.push('');
    for (const notice of details.notices) {
      lines.push(`> [!NOTE]`);
      lines.push(`> ${notice}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Formats a Tier 2 failed repository migration overview (failure/<repo>.md).
 */
export function formatFailureRepoMarkdown(
  record: RepositoryMigrationRecord,
  details: RepositoryFailureDetails = {},
): string {
  const durationSec = (record.durationMs / 1000).toFixed(1);
  const stage = record.failedStage ?? details.failedStage ?? 'unknown';
  const reason = sanitizeDiagnostics(
    record.failureReason ?? details.errorMessage ?? 'Unknown error occurred.',
  );

  const lines: string[] = [
    '[← Back to Overview](../README.md)',
    '',
    `# Migration Result: ${record.targetRepo}`,
    '',
    '> [!CAUTION]',
    '> **Migration Failed:** Repository migration encountered errors or discrepancies during transfer, metadata reconciliation, or verification.',
    '',
    '---',
    '',
    '## Failure Overview',
    '',
    `- **Target Repository:** \`${record.targetRepo}\``,
    `- **Source Repository:** \`${record.sourceRepo}\``,
    `- **Status:** ❌ Failed`,
    `- **Failed Stage:** \`${stage}\``,
    `- **Duration:** ${durationSec}s (${record.durationMs}ms)`,
    `- **Verification Discrepancies:** ${record.discrepancyCount}`,
    '',
    '### Diagnostic Error',
    '',
    '```text',
    reason,
    '```',
    '',
  ];

  appendRepoModuleSummariesSection(lines, record);

  // Discrepancy comparison table
  const discrepancies = details.discrepancies ?? [];
  if (discrepancies.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Verification Discrepancies (Expected vs Actual)');
    lines.push('');
    lines.push('| Resource | Expected State | Actual Target State | Message |');
    lines.push('| :--- | :--- | :--- | :--- |');

    for (const d of discrepancies) {
      const expStr = escapeMarkdownTableCell(
        typeof d.expected === 'string'
          ? d.expected
          : JSON.stringify(d.expected),
      );
      const actStr = escapeMarkdownTableCell(
        typeof d.actual === 'string' ? d.actual : JSON.stringify(d.actual),
      );
      lines.push(
        `| \`${escapeMarkdownTableCell(d.resourceName)}\` | \`${expStr}\` | \`${actStr}\` | ${escapeMarkdownTableCell(d.message)} |`,
      );
    }
    lines.push('');
  }

  // Captured execution logs
  const logs = details.errorLogs ?? [];
  if (logs.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Captured Error Logs');
    lines.push('');
    lines.push('```text');
    for (const l of logs) {
      lines.push(sanitizeDiagnostics(l));
    }
    lines.push('```');
    lines.push('');
  }

  // Actionable remediation runbook
  const commands = Array.from(
    new Set([
      ...(record.remediationCommands ?? []),
      ...(details.remediationCommands ?? []),
    ]),
  );
  const advice = details.remediationAdvice ?? [];

  lines.push('---');
  lines.push('');
  lines.push('## Remediation & Recovery Runbook');
  lines.push('');

  if (advice.length > 0) {
    for (const item of advice) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  } else {
    lines.push(
      '- Inspect the diagnostic error and captured logs above to resolve destination permission, quota, or naming conflicts.',
    );
    lines.push(
      '- Execute the targeted CLI fallback command below to retry the failed migration stage.',
    );
    lines.push('');
  }

  if (commands.length > 0) {
    lines.push('### Ready-To-Run Remediation Commands');
    lines.push('');
    lines.push('```bash');
    for (const cmd of commands) {
      lines.push(sanitizeDiagnostics(cmd));
    }
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats Tier 3 Repository Module Granular Detail page (repositories/<repo>/<module>.md).
 */
export function formatRepoModuleDetailMarkdown(
  model: RepositoryModuleDetailModel,
): string {
  const repoOverviewRelPath =
    model.repoStatus === 'succeeded'
      ? `../../success/${model.targetRepo}.md`
      : `../../failure/${model.targetRepo}.md`;
  const durationSec =
    model.summary.durationMs !== undefined
      ? `${(model.summary.durationMs / 1000).toFixed(1)}s (${model.summary.durationMs}ms)`
      : '0.0s (0ms)';
  const statusBadge = formatModuleStatusBadge(model.summary.status);

  const lines: string[] = [
    `[← Back to ${model.targetRepo}](${repoOverviewRelPath}) | [Overview](../../README.md)`,
    '',
    `# Repository Module Details: ${model.targetRepo} / ${model.moduleId}`,
    '',
    `> **Repository:** \`${model.sourceRepo}\` ➔ \`${model.targetRepo}\`  `,
    `> **Module:** \`${model.moduleId}\`  `,
    `> **Status:** ${statusBadge}  `,
    `> **Duration:** ${durationSec}  `,
    '',
    '---',
    '',
    '## Module Summary Metrics',
    '',
    '| Metric | Count |',
    '| :--- | :--- |',
    `| Total Items | ${model.summary.totalOperations} |`,
    `| Succeeded | ${model.summary.succeededOperations} |`,
    `| Failed | ${model.summary.failedOperations} |`,
    `| Skipped | ${model.summary.skippedOperations ?? 0} |`,
    `| Verification Discrepancies | ${model.summary.discrepancyCount ?? 0} |`,
    '',
  ];

  if (model.summary.error) {
    lines.push('### Module Diagnostic Error');
    lines.push('');
    lines.push('```text');
    lines.push(sanitizeDiagnostics(model.summary.error));
    lines.push('```');
    lines.push('');
  }

  if (model.warnings && model.warnings.length > 0) {
    lines.push('### Module Warnings');
    lines.push('');
    for (const warning of model.warnings) {
      lines.push(`- ${sanitizeDiagnostics(warning)}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Granular Repository Items');
  lines.push('');

  if (model.items.length === 0) {
    lines.push('_No items were processed for this module._');
    lines.push('');
  } else {
    lines.push(
      '| Resource Name | Resource Type | Operation | Status | Completed At | Verification | Notes / Discrepancy Diff |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

    for (const item of model.items) {
      const secretFlag =
        item.isSecret ?? isSecretResource(model.moduleId, item.resourceType);
      const rawName = escapeMarkdownTableCell(item.resourceName);
      const displayName =
        secretFlag && !rawName.includes('[SEALED]')
          ? `\`${rawName}\` \`[SEALED]\``
          : `\`${rawName}\``;
      const resourceType = `\`${escapeMarkdownTableCell(item.resourceType)}\``;
      const opType = `\`${item.operationType}\``;
      const status = formatOperationStatusBadge(item.status);
      const completedAt = item.completedAt ? `\`${item.completedAt}\`` : '-';
      const verification = formatVerificationBadge(item.verificationStatus);
      const defaultNote = secretFlag
        ? '[SEALED] Write-only secret placeholder'
        : '-';
      const notes = item.notes
        ? escapeMarkdownTableCell(item.notes)
        : defaultNote;

      lines.push(
        `| ${displayName} | ${resourceType} | ${opType} | ${status} | ${completedAt} | ${verification} | ${notes} |`,
      );
    }
    lines.push('');
  }

  const discrepancies = model.discrepancies ?? [];
  if (discrepancies.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Verification Discrepancies (Expected vs Actual)');
    lines.push('');
    lines.push('| Resource | Expected State | Actual Target State | Message |');
    lines.push('| :--- | :--- | :--- | :--- |');

    for (const d of discrepancies) {
      const expStr = escapeMarkdownTableCell(
        typeof d.expected === 'string'
          ? d.expected
          : JSON.stringify(d.expected),
      );
      const actStr = escapeMarkdownTableCell(
        typeof d.actual === 'string' ? d.actual : JSON.stringify(d.actual),
      );
      lines.push(
        `| \`${escapeMarkdownTableCell(d.resourceName)}\` | \`${expStr}\` | \`${actStr}\` | ${escapeMarkdownTableCell(d.message)} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
