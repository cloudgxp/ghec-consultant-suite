import { parseArgs } from 'node:util';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  MIGRATION_SCHEMA_VERSION,
  validateVerificationReport,
  type VerificationReport,
} from '@ghec/contracts';
import { appendStepSummary } from '@ghec/migration';

export interface AgentReviewOptions {
  readonly reportPath: string;
  readonly specPath?: string | undefined;
  readonly outputPath: string;
  readonly outputMarkdownPath: string;
  readonly appendStepSummary: boolean;
  readonly verbose?: boolean | undefined;
}

export interface RemediationAction {
  readonly id: string;
  readonly category:
    | 'secrets-and-variables'
    | 'security-and-policies'
    | 'assets-and-storage'
    | 'identity-and-access'
    | 'webhooks-and-integrations'
    | 'general';
  readonly moduleId: string;
  readonly resourceName: string;
  readonly description: string;
  readonly command: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RemediationPlan {
  readonly schemaVersion: string;
  readonly planId: string;
  readonly generatedAt: string;
  readonly reportId: string;
  readonly sourceOrg: string;
  readonly targetOrg: string;
  readonly totalDiscrepancies: number;
  readonly actionableCount: number;
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
    outputPath: values.output || './scans/remediation-plan.json',
    outputMarkdownPath:
      values['output-markdown'] || './scans/remediation-plan.md',
    appendStepSummary: values['append-step-summary'] ?? true,
    verbose: values.verbose,
  };
}

export function generateRemediationPlan(
  report: VerificationReport,
  specContent?: string | undefined,
): RemediationPlan {
  void specContent;
  const actions: RemediationAction[] = [];
  let actionCounter = 1;

  for (const moduleResult of report.modules) {
    if (moduleResult.verified && moduleResult.discrepancies.length === 0) {
      continue;
    }

    const modId = moduleResult.moduleId;

    for (const disc of moduleResult.discrepancies) {
      const actionId = `action-${actionCounter++}`;

      if (modId === 'repo-secrets' || modId === 'actions-secrets') {
        actions.push({
          id: actionId,
          category: 'secrets-and-variables',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: `Missing secret "${disc.resourceName}". Secrets must be populated at destination.`,
          command: `# Set secret for target repository\ngh secret set "${disc.resourceName}" --repo "${report.targetOrg}/${disc.resourceName.split('/')[0] ?? ''}"`,
          severity: 'critical',
        });
      } else if (modId === 'repo-variables') {
        const expectedVal =
          typeof disc.expected === 'string'
            ? disc.expected
            : JSON.stringify(disc.expected ?? '');
        actions.push({
          id: actionId,
          category: 'secrets-and-variables',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: `Missing or drifted repository variable "${disc.resourceName}".`,
          command: `gh variable set "${disc.resourceName}" --body "${expectedVal.replace(/"/g, '\\"')}" --repo "${report.targetOrg}/${disc.resourceName.split('/')[0] ?? ''}"`,
          severity: 'medium',
        });
      } else if (modId === 'rulesets' || modId === 'branch-protection') {
        actions.push({
          id: actionId,
          category: 'security-and-policies',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: `Policy configuration discrepancy in "${disc.resourceName}": ${disc.message}`,
          command: `ghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"`,
          severity: 'high',
        });
      } else if (modId === 'releases') {
        actions.push({
          id: actionId,
          category: 'assets-and-storage',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: `Release or binary asset missing in "${disc.resourceName}".`,
          command: `ghec-consultant-cli migrate --modules releases --scope "./scopes/${report.scopeName}.json"`,
          severity: 'high',
        });
      } else if (modId === 'lfs') {
        actions.push({
          id: actionId,
          category: 'assets-and-storage',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: `Git LFS object transfer incomplete for "${disc.resourceName}".`,
          command: `ghec-consultant-cli migrate --modules lfs --scope "./scopes/${report.scopeName}.json"`,
          severity: 'high',
        });
      } else if (modId === 'collaborators' || modId === 'teams') {
        actions.push({
          id: actionId,
          category: 'identity-and-access',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: `Identity reconciliation discrepancy for "${disc.resourceName}".`,
          command: `ghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"`,
          severity: 'medium',
        });
      } else {
        actions.push({
          id: actionId,
          category: 'general',
          moduleId: modId,
          resourceName: disc.resourceName,
          description: disc.message,
          command: `ghec-consultant-cli migrate --modules "${modId}" --scope "./scopes/${report.scopeName}.json"`,
          severity: 'medium',
        });
      }
    }
  }

  const scriptHeader = `#!/usr/bin/env bash\n# Automated Migration Remediation Script\n# Target Enterprise: ${report.targetOrg}\n# Generated: ${new Date().toISOString()}\nset -euo pipefail\n\n`;
  const scriptBody = actions
    .map(
      (a) =>
        `# [${a.severity.toUpperCase()}] ${a.description}\necho "Executing remediation for ${a.resourceName}..."\n${a.command}\n`,
    )
    .join('\n');

  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    planId: `remedy-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    reportId: report.reportId,
    sourceOrg: report.sourceOrg,
    targetOrg: report.targetOrg,
    totalDiscrepancies: report.summary.discrepancyCount,
    actionableCount: actions.length,
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

  if (plan.actions.length === 0) {
    lines.push('### ✅ Zero Discrepancies Detected');
    lines.push(
      'Target state is 100% compliant with source configuration. No remediation required.',
    );
    return lines.join('\n');
  }

  lines.push('### 📋 Discrepancy & Remediation Summary');
  lines.push('');
  lines.push('| Severity | Category | Module | Resource | Action / Command |');
  lines.push('|:---|:---|:---|:---|:---|');

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
    lines.push(
      `| ${sevBadge} | \`${action.category}\` | \`${action.moduleId}\` | \`${action.resourceName}\` | \`${shortCmd}\` |`,
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

  const plan = generateRemediationPlan(reportValidation.data, specContent);
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
