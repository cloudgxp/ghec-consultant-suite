import { appendFileSync } from 'node:fs';
import type {
  SeedExecutionSummary,
  SeedItemExecutionResult,
} from '@ghec/contracts';

function getActionBadge(action: SeedItemExecutionResult['action']): string {
  switch (action) {
    case 'created':
      return '🟢 Created';
    case 'updated':
      return '🔵 Updated';
    case 'deleted':
      return '🔴 Deleted';
    case 'skipped':
      return '⚪ Skipped';
    case 'dry-run-create':
      return '🟡 Dry-Run (Create)';
    case 'dry-run-update':
      return '🟡 Dry-Run (Update)';
    case 'dry-run-skip':
      return '⚪ Dry-Run (Skip)';
    case 'failed':
      return '❌ Failed';
    default:
      return action;
  }
}

export function formatMarkdownSummary(summary: SeedExecutionSummary): string {
  const lines: string[] = [];

  lines.push('## 🚀 Synthetic Demo Content Seeding Report');
  lines.push('');
  lines.push('| Execution Parameter | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Organization** | \`${summary.organization}\` |`);
  lines.push(`| **Repository** | \`${summary.repository ?? '(none)'}\` |`);
  lines.push(`| **Scope Level** | \`${summary.scopeLevel}\` |`);
  lines.push(`| **Content Preset / Filter** | \`${summary.contentType}\` |`);
  lines.push(
    `| **Execution Mode** | \`${summary.dryRun ? 'DRY-RUN (Simulated)' : 'LIVE'}\` |`,
  );
  lines.push(`| **Cleanup Prior** | \`${summary.cleanupExisting}\` |`);
  lines.push(
    `| **Duration** | \`${(summary.totalDurationMs / 1000).toFixed(2)}s\` |`,
  );
  lines.push(`| **Completed At** | \`${summary.completedAt}\` |`);
  lines.push('');

  lines.push('### 📊 Summary Metrics');
  lines.push('');
  lines.push(
    '| Total Evaluated | Created | Updated | Skipped | Deleted | Failed |',
  );
  lines.push('| :---: | :---: | :---: | :---: | :---: | :---: |');
  lines.push(
    `| **${summary.counts.total}** | ${summary.counts.created} | ${summary.counts.updated} | ${summary.counts.skipped} | ${summary.counts.deleted} | ${summary.counts.failed} |`,
  );
  lines.push('');

  lines.push('### 📦 Detailed Item Breakdown');
  lines.push('');
  lines.push(
    '| Status | Module | Scope | Resource Identifier | Duration | Notes |',
  );
  lines.push('| :---: | :--- | :---: | :--- | :---: | :--- |');

  for (const item of summary.items) {
    const badge = getActionBadge(item.action);
    const scopeBadge = item.scope === 'organization' ? 'Org' : 'Repo';
    const note = item.error
      ? `**Error**: ${item.error}`
      : item.warning
        ? `*Warning*: ${item.warning}`
        : (item.details ?? '-');

    lines.push(
      `| ${badge} | ${item.itemName} (\`${item.itemId}\`) | ${scopeBadge} | \`${item.resourceIdentifier}\` | ${item.durationMs}ms | ${note} |`,
    );
  }

  if (summary.warnings.length > 0) {
    lines.push('');
    lines.push('### ⚠️ Warnings & Advisories');
    lines.push('');
    for (const warn of summary.warnings) {
      lines.push(`- ${warn}`);
    }
  }

  if (summary.errors.length > 0) {
    lines.push('');
    lines.push('### ❌ Errors & Failures');
    lines.push('');
    for (const err of summary.errors) {
      lines.push(`- ${err}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function appendGithubStepSummary(summary: SeedExecutionSummary): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  try {
    const md = formatMarkdownSummary(summary);
    appendFileSync(summaryFile, `\n${md}\n`, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Seeder] Warning writing to $GITHUB_STEP_SUMMARY: ${msg}`);
  }
}
