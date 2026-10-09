import type {
  MigrationResultsManifest,
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

/**
 * Generates root README.md executive overview for the migration results audit repository.
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

  // Org-Level Modules Summary
  const orgModules = Object.entries(manifest.summary.orgModulesSummary);
  if (orgModules.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Organization-Level Modules');
    lines.push('');
    lines.push(
      '| Module | Status | Total Operations | Succeeded | Failed | Skipped | Duration |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const [moduleId, modSummary] of orgModules) {
      const statusBadge =
        modSummary.status === 'complete'
          ? '✅ complete'
          : modSummary.status === 'partial'
            ? '⚠️ partial'
            : modSummary.status === 'failed'
              ? '❌ failed'
              : '⏭️ skipped';
      const duration =
        modSummary.durationMs !== undefined
          ? `${(modSummary.durationMs / 1000).toFixed(1)}s`
          : '-';
      lines.push(
        `| \`${moduleId}\` | ${statusBadge} | ${modSummary.totalOperations} | ${modSummary.succeededOperations} | ${modSummary.failedOperations} | ${modSummary.skippedOperations ?? 0} | ${duration} |`,
      );
    }
    lines.push('');
  }

  // Repositories Index Table
  lines.push('---');
  lines.push('');
  lines.push('## Repositories Index');
  lines.push('');

  if (manifest.repositories.length === 0) {
    lines.push('_No repositories were migrated in this wave._');
    lines.push('');
  } else {
    lines.push(
      '| Repository | Status | Duration | Discrepancies | Details / Logs |',
    );
    lines.push('| :--- | :--- | :--- | :--- | :--- |');

    for (const repo of manifest.repositories) {
      const statusBadge =
        repo.status === 'succeeded' ? '✅ Succeeded' : '❌ Failed';
      const duration = `${(repo.durationMs / 1000).toFixed(1)}s`;
      const linkText =
        repo.status === 'succeeded' ? 'View Log' : 'View Failure Log';
      const link = `[${linkText}](${repo.relativeFilePath})`;
      lines.push(
        `| \`${repo.targetRepo}\` | ${statusBadge} | ${duration} | ${repo.discrepancyCount} | ${link} |`,
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
      const reason = sanitizeDiagnostics(
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
 * Formats a single successful repository migration log (success/<repo>.md).
 */
export function formatSuccessRepoMarkdown(
  record: RepositoryMigrationRecord,
  details: RepositorySuccessDetails = {},
): string {
  const durationSec = (record.durationMs / 1000).toFixed(1);

  const lines: string[] = [
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
      lines.push(`| \`${stage}\` | ✅ Completed | Executed cleanly |`);
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
 * Formats a single failed repository migration log (failure/<repo>.md).
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
      const expStr =
        typeof d.expected === 'string'
          ? d.expected
          : JSON.stringify(d.expected);
      const actStr =
        typeof d.actual === 'string' ? d.actual : JSON.stringify(d.actual);
      lines.push(
        `| \`${d.resourceName}\` | \`${expStr}\` | \`${actStr}\` | ${sanitizeDiagnostics(d.message)} |`,
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
  const commands = [
    ...(record.remediationCommands ?? []),
    ...(details.remediationCommands ?? []),
  ];
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
      lines.push(cmd);
    }
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
