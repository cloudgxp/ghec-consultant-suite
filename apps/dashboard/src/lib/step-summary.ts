export type ModuleCategory = 'organization' | 'repository' | 'post-migration';

export interface ModuleOperationSummary {
  moduleId: string;
  displayName: string;
  category: ModuleCategory;
  status: 'completed' | 'failed' | 'skipped' | 'pending';
  creates: number;
  updates: number;
  noops: number;
  skips: number;
  failures: number;
  details?: string[] | undefined;
  errors?: string[] | undefined;
}

export interface StepSummaryParsedData {
  title: string;
  runId?: string | undefined;
  overallStatus?: string | undefined;
  mode?: string | undefined;
  sourceOrg?: string | undefined;
  targetOrg?: string | undefined;
  duration?: string | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  rawMarkdown: string;
  alerts: Array<{
    type: 'note' | 'tip' | 'important' | 'warning' | 'caution';
    title: string;
    items: string[];
  }>;
}

export interface ArtifactFileMetadata {
  filename: string;
  sizeBytes?: number | undefined;
  type: 'plan' | 'verification' | 'preflight' | 'cohort' | 'custom';
  content?: unknown;
}

export const CANONICAL_MODULES: readonly {
  id: string;
  displayName: string;
  category: ModuleCategory;
}[] = [
  // Organization Scope
  {
    id: 'org-variables',
    displayName: 'Organization Variables',
    category: 'organization',
  },
  {
    id: 'org-secrets',
    displayName: 'Organization Secrets (Encrypted)',
    category: 'organization',
  },
  {
    id: 'teams',
    displayName: 'Teams & Hierarchy (DFS)',
    category: 'organization',
  },
  {
    id: 'org-custom-properties',
    displayName: 'Org Custom Property Definitions',
    category: 'organization',
  },
  {
    id: 'webhooks',
    displayName: 'Organization & Repo Webhooks',
    category: 'organization',
  },

  // Repository Scope
  {
    id: 'gei-repo',
    displayName: 'GEI Repository Transfer',
    category: 'repository',
  },
  {
    id: 'repo-variables',
    displayName: 'Repository Variables',
    category: 'repository',
  },
  {
    id: 'repo-secrets',
    displayName: 'Repository Secrets (Sealed-Box)',
    category: 'repository',
  },
  {
    id: 'repo-settings',
    displayName: 'Repository Settings & Merge Rules',
    category: 'repository',
  },
  {
    id: 'repo-custom-properties',
    displayName: 'Repository Property Values',
    category: 'repository',
  },
  {
    id: 'rulesets',
    displayName: 'Repository Rulesets',
    category: 'repository',
  },
  {
    id: 'branch-protection',
    displayName: 'Legacy Branch Protection',
    category: 'repository',
  },
  {
    id: 'environments',
    displayName: 'Deployment Environments',
    category: 'repository',
  },
  {
    id: 'deploy-keys',
    displayName: 'Repository Deploy Keys',
    category: 'repository',
  },
  {
    id: 'releases',
    displayName: 'Releases & Assets Streaming',
    category: 'repository',
  },
  {
    id: 'lfs',
    displayName: 'Git LFS Object Mirroring',
    category: 'repository',
  },
  {
    id: 'collaborators',
    displayName: 'Outside Collaborators & Roles',
    category: 'repository',
  },

  // Post-Migration Scope
  {
    id: 'mannequins',
    displayName: 'EMU Mannequin Reclamation',
    category: 'post-migration',
  },
  {
    id: 'codeowners-repair',
    displayName: 'CODEOWNERS & Team References',
    category: 'post-migration',
  },
  {
    id: 'ghas-security',
    displayName: 'GHAS Security & Alert Matching',
    category: 'post-migration',
  },
];

const SECRET_PATTERNS = [
  /ghp_[0-9a-zA-Z]{36}/g,
  /github_pat_[0-9a-zA-Z_]{82}/g,
  /gho_[0-9a-zA-Z]{36}/g,
  /ghu_[0-9a-zA-Z]{36}/g,
  /ghs_[0-9a-zA-Z]{36}/g,
  /ghr_[0-9a-zA-Z]{36}/g,
  /bearer\s+[A-Za-z0-9_.~+/=-]+/gi,
];

/**
 * Sanitizes failure messages and diagnostics by stripping GitHub PATs and sensitive tokens.
 */
export function sanitizeDiagnostics(text: string): string {
  if (!text) return text;
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }
  return sanitized;
}

/**
 * Parses raw $GITHUB_STEP_SUMMARY Markdown text into structured metadata and alert blocks.
 */
export function parseStepSummaryMarkdown(
  markdown: string,
): StepSummaryParsedData {
  const result: StepSummaryParsedData = {
    title: 'Migration Execution Summary',
    rawMarkdown: markdown,
    alerts: [],
  };

  if (!markdown) return result;

  const lines = markdown.split(/\r?\n/);
  let currentAlert: {
    type: 'note' | 'tip' | 'important' | 'warning' | 'caution';
    title: string;
    items: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Check title
    if (line.startsWith('## ')) {
      result.title = line.replace(/^##\s+/, '').trim();
      continue;
    }

    // Check overview table rows
    const tableMatch = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|\s*(.*?)\s*\|$/);
    if (tableMatch) {
      const key = tableMatch[1]!.trim().toLowerCase();
      const val = tableMatch[2]!.trim().replace(/^`|`$/g, '');

      if (key.includes('run id')) result.runId = val;
      else if (key.includes('overall status')) result.overallStatus = val;
      else if (key.includes('mode')) result.mode = val;
      else if (key.includes('source organization')) result.sourceOrg = val;
      else if (key.includes('target organization')) result.targetOrg = val;
      else if (key.includes('duration')) result.duration = val;
      else if (key.includes('started at')) result.startedAt = val;
      else if (key.includes('completed at')) result.completedAt = val;
      continue;
    }

    // Alert blocks (> [!WARNING], > [!CAUTION], etc.)
    const alertMatch = line.match(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i,
    );
    if (alertMatch) {
      if (currentAlert) {
        result.alerts.push(currentAlert);
      }
      const alertType = alertMatch[1]!.toLowerCase() as
        'note' | 'tip' | 'important' | 'warning' | 'caution';
      currentAlert = {
        type: alertType,
        title: '',
        items: [],
      };
      continue;
    }

    if (currentAlert) {
      if (line.startsWith('>')) {
        const alertLine = line.replace(/^>\s*/, '').trim();
        if (alertLine.startsWith('**') && alertLine.endsWith('**')) {
          currentAlert.title = alertLine.replace(/^\*\*|\*\*$/g, '');
        } else if (alertLine.startsWith('- ')) {
          currentAlert.items.push(alertLine.replace(/^- \s*/, ''));
        } else if (alertLine) {
          if (!currentAlert.title) {
            currentAlert.title = alertLine;
          } else {
            currentAlert.items.push(alertLine);
          }
        }
      } else if (line === '') {
        result.alerts.push(currentAlert);
        currentAlert = null;
      }
    }
  }

  if (currentAlert) {
    result.alerts.push(currentAlert);
  }

  return result;
}

export interface AggregateReportsInput {
  plan?:
    | {
        modules?: Record<string, unknown> | undefined;
        plannedOperations?:
          Array<{ module: string; action: string }> | undefined;
      }
    | undefined;
  verification?:
    | {
        discrepancies?: Array<{ module: string; message: string }> | undefined;
      }
    | undefined;
  cohorts?:
    | Array<{
        id: string;
        modules?:
          | Record<
              string,
              {
                creates?: number | undefined;
                updates?: number | undefined;
                noops?: number | undefined;
                skips?: number | undefined;
                failures?: number | undefined;
                errors?: string[] | undefined;
              }
            >
          | undefined;
        operations?:
          | {
              created?: number | undefined;
              updated?: number | undefined;
              noop?: number | undefined;
              failed?: number | undefined;
            }
          | undefined;
      }>
    | undefined;
  rawSummary?: Record<string, unknown> | undefined;
}

/**
 * Aggregates operations breakdown across all 17 canonical migration modules from execution reports.
 */
export function aggregateOperationsBreakdown(
  reports?: AggregateReportsInput | undefined,
): ModuleOperationSummary[] {
  const cohortList = reports?.cohorts || [];
  const discrepancies = reports?.verification?.discrepancies || [];

  return CANONICAL_MODULES.map((mod) => {
    let creates = 0;
    let updates = 0;
    let noops = 0;
    let skips = 0;
    let failures = 0;
    const errors: string[] = [];

    // Aggregate from cohorts
    for (const cohort of cohortList) {
      if (cohort.modules && cohort.modules[mod.id]) {
        const stats = cohort.modules[mod.id]!;
        creates += stats.creates ?? 0;
        updates += stats.updates ?? 0;
        noops += stats.noops ?? 0;
        skips += stats.skips ?? 0;
        failures += stats.failures ?? 0;
        if (stats.errors) {
          errors.push(...stats.errors.map(sanitizeDiagnostics));
        }
      }
    }

    // Include verification discrepancies if related
    for (const d of discrepancies) {
      if (d.module === mod.id) {
        failures++;
        errors.push(sanitizeDiagnostics(d.message));
      }
    }

    // Determine status
    let status: ModuleOperationSummary['status'] = 'pending';
    const totalOps = creates + updates + noops + skips + failures;
    if (totalOps > 0) {
      status = failures > 0 ? 'failed' : 'completed';
    } else if (cohortList.length > 0) {
      status = 'skipped';
    }

    return {
      moduleId: mod.id,
      displayName: mod.displayName,
      category: mod.category,
      status,
      creates,
      updates,
      noops,
      skips,
      failures,
      errors: errors.length > 0 ? errors : undefined,
    };
  });
}
