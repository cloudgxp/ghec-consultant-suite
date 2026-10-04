import { appendFileSync } from 'node:fs';
import type { MigrationRunSummary, StepSummaryOptions } from './types.js';

/**
 * Characters that trigger spreadsheet formula execution when opened in Excel/Sheets/CSV.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralizes spreadsheet formula injection in user-supplied strings.
 */
export function sanitizeFormula(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }
  if (FORMULA_TRIGGERS.some((char) => input.startsWith(char))) {
    return `'${input}`;
  }
  const trimmed = input.trimStart();
  if (FORMULA_TRIGGERS.some((char) => trimmed.startsWith(char))) {
    return `'${input}`;
  }
  return input;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(durationMs: number): string {
  const seconds = (durationMs / 1000).toFixed(2);
  return `${seconds}s`;
}

function getStatusBadge(status: MigrationRunSummary['status']): string {
  switch (status) {
    case 'complete':
      return '🟢 **Complete**';
    case 'partial':
      return '🟡 **Partial**';
    case 'failed':
      return '🔴 **Failed**';
    case 'skipped':
      return '⚪ **Skipped**';
    default:
      return status;
  }
}

/**
 * Formats a comprehensive Markdown summary suitable for $GITHUB_STEP_SUMMARY.
 */
export function formatStepSummaryMarkdown(
  summary: MigrationRunSummary,
  options: StepSummaryOptions = {},
): string {
  const sanitize = (text: string): string => {
    return options.sanitizeFormulas !== false ? sanitizeFormula(text) : text;
  };

  const title = options.title ?? '🚀 Migration Execution Summary';
  const lines: string[] = [];

  lines.push(`## ${title}`);
  lines.push('');

  // 1. Overview Metadata Table
  lines.push('### Overview');
  lines.push('| Metric | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Run ID** | \`${sanitize(summary.runId)}\` |`);
  lines.push(`| **Overall Status** | ${getStatusBadge(summary.status)} |`);
  lines.push(
    `| **Mode** | ${summary.dryRun ? '🧪 Dry-Run (Simulation)' : '⚡ Live Mutation'} |`,
  );
  lines.push(
    `| **Source Organization** | \`${sanitize(summary.sourceOrg)}\` |`,
  );
  lines.push(
    `| **Target Organization** | \`${sanitize(summary.targetOrg)}\` |`,
  );
  lines.push(`| **Duration** | ${formatDuration(summary.durationMs)} |`);
  lines.push(`| **Started At** | \`${summary.startedAt}\` |`);
  lines.push(`| **Completed At** | \`${summary.completedAt}\` |`);
  lines.push('');

  // 2. Preflight Section (if present)
  if (summary.preflight) {
    const pf = summary.preflight;
    lines.push('### 🔍 Stage 1: Preflight Assessment');
    lines.push(
      '| Total Repositories | Ready | Ready w/ Follow-up | Requires Strategy | Blocked | Ruleset Bypass |',
    );
    lines.push('| :---: | :---: | :---: | :---: | :---: | :---: |');
    lines.push(
      `| **${pf.totalRepositories}** | 🟢 ${pf.ready} | 🟡 ${pf.readyWithFollowUp} | 🟠 ${pf.requiresSpecialStrategy} | 🔴 ${pf.blocked} | ${pf.rulesetBypassExempt ? '✅ Exempt' : '❌ Non-Exempt'} |`,
    );
    lines.push('');
  }

  // 3. Core Transfer & Strategies (GEI, LFS, Releases)
  if (summary.coreTransfer) {
    const ct = summary.coreTransfer;
    lines.push('### 📦 Stage 2–4: Core Transfers & Fallback Strategies');
    lines.push(
      '| Stage / Strategy | Total Repos | Succeeded | Failed | Key Metrics |',
    );
    lines.push('| :--- | :---: | :---: | :---: | :--- |');

    if (ct.gei) {
      lines.push(
        `| **GEI Repository Transfer** | ${ct.gei.total} | ${ct.gei.succeeded} | ${ct.gei.failed} | ${ct.gei.skippedReleases > 0 ? `⚠️ Skipped releases on ${ct.gei.skippedReleases} repo(s)` : 'Standard GEI'} |`,
      );
    }
    if (ct.lfs) {
      lines.push(
        `| **Git LFS Mirroring** | ${ct.lfs.repositoriesWithLfs} | ${ct.lfs.repositoriesWithLfs} | 0 | ${ct.lfs.objectsTransferred} objects (${formatBytes(ct.lfs.bytesTransferred)}) |`,
      );
    }
    if (ct.largeReleases) {
      lines.push(
        `| **Large Releases Fallback** | ${ct.largeReleases.repositoriesWithLargeReleases} | ${ct.largeReleases.repositoriesWithLargeReleases} | 0 | ${ct.largeReleases.assetsStreamed} assets streamed (${formatBytes(ct.largeReleases.bytesStreamed)}) |`,
      );
    }
    lines.push('');
  }

  // 4. Configuration Rehydration (API Modules)
  if (summary.rehydration) {
    const rh = summary.rehydration;
    lines.push('### ⚙️ Stage 5: Configuration Rehydration');
    lines.push('| Component | Planned | Succeeded | Failed | Status |');
    lines.push('| :--- | :---: | :---: | :---: | :---: |');

    const addModuleRow = (name: string, counts?: typeof rh.variables) => {
      if (!counts) return;
      const statusIcon =
        counts.failed > 0
          ? '❌ Failed'
          : counts.succeeded > 0
            ? '✅ Complete'
            : '⚪ None';
      lines.push(
        `| **${name}** | ${counts.planned} | ${counts.succeeded} | ${counts.failed} | ${statusIcon} |`,
      );
    };

    addModuleRow('Repository Variables', rh.variables);
    addModuleRow('Repository Secrets (DEC-004)', rh.secrets);
    addModuleRow('Deployment Environments', rh.environments);
    addModuleRow('Repository Rulesets', rh.rulesets);
    addModuleRow('Branch Protection Rules', rh.branchProtection);
    addModuleRow('Teams & Permissions', rh.teams);
    lines.push('');
  }

  // 5. Post-Migration Reconciliations
  if (summary.postMigration) {
    const pm = summary.postMigration;
    lines.push('### 👥 Stage 6: Post-Migration Reconciliations');
    if (pm.mannequins) {
      lines.push('| Metric | Count |');
      lines.push('| :--- | :---: |');
      lines.push(`| Total Mannequins Discovered | ${pm.mannequins.total} |`);
      lines.push(`| Reclaimed / Attributed | 🟢 ${pm.mannequins.reclaimed} |`);
      lines.push(
        `| Unmapped Contributors | ${pm.mannequins.unmapped > 0 ? `⚠️ ${pm.mannequins.unmapped}` : '0'} |`,
      );
      lines.push('');
    }
    if (pm.webhooks) {
      lines.push(`- **Webhooks Re-enabled:** ${pm.webhooks.reEnabled}`);
      lines.push('');
    }
  }

  // 6. Target State Verification
  if (summary.verification) {
    const v = summary.verification;
    lines.push('### 🛡️ Stage 7: Target State Verification');
    if (v.verified) {
      lines.push(
        '✅ **Verification Passed:** Target enterprise configuration strictly matches planned specification with 0 discrepancies.',
      );
    } else {
      lines.push('> [!WARNING]');
      lines.push(
        `> **Verification Discrepancies Detected (${v.totalDiscrepancies}):**`,
      );
      if (v.discrepancySummaries && v.discrepancySummaries.length > 0) {
        for (const d of v.discrepancySummaries.slice(0, 10)) {
          lines.push(`> - ${sanitize(d)}`);
        }
        if (v.discrepancySummaries.length > 10) {
          lines.push(
            `> - ... and ${v.discrepancySummaries.length - 10} additional discrepancy(ies)`,
          );
        }
      }
    }
    lines.push('');
  }

  // 7. Errors
  if (summary.errors && summary.errors.length > 0) {
    lines.push('> [!CAUTION]');
    lines.push(`> **Errors Encountered (${summary.errors.length}):**`);
    for (const err of summary.errors.slice(0, 10)) {
      lines.push(`> - ${sanitize(err)}`);
    }
    if (summary.errors.length > 10) {
      lines.push(`> - ... and ${summary.errors.length - 10} more error(s)`);
    }
    lines.push('');
  }

  // 8. Warnings
  if (summary.warnings && summary.warnings.length > 0) {
    lines.push('> [!WARNING]');
    lines.push(`> **Operational Warnings (${summary.warnings.length}):**`);
    for (const warn of summary.warnings.slice(0, 10)) {
      lines.push(`> - ${sanitize(warn)}`);
    }
    if (summary.warnings.length > 10) {
      lines.push(`> - ... and ${summary.warnings.length - 10} more warning(s)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Safely appends Markdown content to $GITHUB_STEP_SUMMARY.
 * Degrades gracefully if GITHUB_STEP_SUMMARY environment variable is not defined.
 */
export function appendStepSummary(
  markdown: string,
  customPath?: string,
): boolean {
  const filePath = customPath ?? process.env.GITHUB_STEP_SUMMARY;
  if (!filePath || !filePath.trim()) {
    return false;
  }

  try {
    appendFileSync(filePath.trim(), `${markdown}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}
