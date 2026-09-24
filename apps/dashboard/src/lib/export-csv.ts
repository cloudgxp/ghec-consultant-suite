import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import {
  formatBytesMetric,
  formatCountMetric,
  resolveOrgName,
} from './formatters.js';

/**
 * Neutralizes spreadsheet formula injection per DASH-EXPORT-001.
 * Prefixes cells starting with '=', '+', '-', '@', '\t', '\r', '\n' with a single quote.
 * Escapes double quotes and encloses in quotes if delimiters or newlines are present.
 */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Strip or neutralize formula trigger characters
  if (/^[\t\r\n=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // Quote and escape if comma, quote, or newline is present
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Triggers a client-side file download of CSV text.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildCsvRow(fields: unknown[]): string {
  return fields.map(sanitizeCsvField).join(',');
}

/**
 * 1. Repositories Inventory CSV
 */
export function generateRepositoriesCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Organization ID',
    'Organization Name',
    'Repository ID',
    'Repository Name',
    'Visibility',
    'Archived',
    'Fork',
    'Default Branch',
    'Size (Formatted)',
    'Size (Bytes)',
    'Size Availability',
    'Size Reason',
    'Git LFS Detected',
    'LFS Storage',
    'Workflows Count',
    'Self-Hosted Runners',
    'Dependabot',
    'Code Scanning',
    'Open Alerts',
  ];

  const repos = bundle.entities.filter(
    (e) =>
      e.kind === 'repository' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );

  const lfsEntities = bundle.entities.filter((e) => e.kind === 'lfs');
  const actionsEntities = bundle.entities.filter((e) => e.kind === 'actions');
  const secEntities = bundle.entities.filter((e) => e.kind === 'security');

  const rows = repos.map((repo) => {
    if (repo.kind !== 'repository') return '';
    const lfs = lfsEntities.find(
      (l) => l.kind === 'lfs' && l.repositoryId === repo.id,
    );
    const actions = actionsEntities.find(
      (a) => a.kind === 'actions' && a.repositoryId === repo.id,
    );
    const sec = secEntities.find(
      (s) => s.kind === 'security' && s.repositoryId === repo.id,
    );

    return buildCsvRow([
      repo.organizationId,
      resolveOrgName(bundle, repo.organizationId),
      repo.id,
      repo.name,
      repo.visibility,
      repo.archived ?? 'unknown',
      repo.fork ?? 'unknown',
      repo.defaultBranch ?? 'unknown',
      formatBytesMetric(repo.size),
      repo.size.value ?? '',
      repo.size.availability,
      repo.size.reason ?? '',
      lfs?.kind === 'lfs' ? lfs.indicator : 'not_detected',
      lfs?.kind === 'lfs' ? formatBytesMetric(lfs.storage) : 'N/A',
      actions?.kind === 'actions'
        ? formatCountMetric(actions.workflowCount)
        : '0',
      actions?.kind === 'actions'
        ? actions.runnerTypes.includes('self-hosted')
          ? 'Yes'
          : 'No'
        : 'unknown',
      sec?.kind === 'security' ? sec.dependabot : 'unknown',
      sec?.kind === 'security' ? sec.codeScanning : 'unknown',
      sec?.kind === 'security'
        ? formatCountMetric(sec.openAlertCount)
        : 'unknown',
    ]);
  });

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 2. Migration Readiness & Findings CSV
 */
export function generateMigrationReadinessCsv(
  bundle: DiscoveryBundle,
  insights: EvaluatedInsights,
  filteredOrgId?: string,
): string {
  const headers = [
    'Rule ID',
    'Severity',
    'Classification',
    'Confidence',
    'Organization ID',
    'Organization Name',
    'Finding Title',
    'Description',
    'Affected Entity IDs',
    'Evidence Collector IDs',
    'Limitations & Caveats',
  ];

  const findings = insights.findings.filter(
    (f) => !filteredOrgId || f.organizationId === filteredOrgId,
  );

  const rows = findings.map((f) =>
    buildCsvRow([
      f.ruleId,
      f.severity.toUpperCase(),
      f.classification,
      f.confidence,
      f.organizationId,
      resolveOrgName(bundle, f.organizationId),
      f.title,
      f.description,
      f.entityIds.join('; '),
      f.evidenceExecutionIds.join('; '),
      f.limitations.join('; '),
    ]),
  );

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 3. Actions, Workflows & Secrets Inventory CSV
 */
export function generateActionsAndSecretsCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Kind',
    'Organization ID',
    'Organization Name',
    'Target Repository ID',
    'Item Name',
    'Configuration Kind',
    'Scope Level',
    'Workflows Count',
    'Workflow Names',
    'Runner Count',
    'Runner Types',
    'Last Updated',
  ];

  const secrets = bundle.entities.filter(
    (e) =>
      e.kind === 'actions-secret' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );
  const actions = bundle.entities.filter(
    (e) =>
      e.kind === 'actions' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );

  const secretRows = secrets.map((s) => {
    if (s.kind !== 'actions-secret') return '';
    return buildCsvRow([
      'Secret/Variable',
      s.organizationId,
      resolveOrgName(bundle, s.organizationId),
      s.repositoryId ?? 'Organization-wide',
      s.name,
      s.configurationKind,
      s.level,
      '',
      '',
      '',
      '',
      s.updatedAt ?? 'unknown',
    ]);
  });

  const actionRows = actions.map((a) => {
    if (a.kind !== 'actions') return '';
    return buildCsvRow([
      'Actions Workflow',
      a.organizationId,
      resolveOrgName(bundle, a.organizationId),
      a.repositoryId,
      a.workflowNames.join('; '),
      'N/A',
      'repository',
      formatCountMetric(a.workflowCount),
      a.workflowNames.join('; '),
      formatCountMetric(a.runnerCount),
      a.runnerTypes.join('; '),
      '',
    ]);
  });

  return [buildCsvRow(headers), ...secretRows, ...actionRows].join('\r\n');
}

/**
 * 4. Teams & Permissions CSV
 */
export function generateTeamsAndPermissionsCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Organization ID',
    'Organization Name',
    'Team ID',
    'Team Name',
    'Parent Team ID',
    'Membership Count',
    'Target Repository ID',
    'Granted Permission',
  ];

  const teams = bundle.entities.filter(
    (e) =>
      e.kind === 'team' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );

  const rows: string[] = [];
  for (const team of teams) {
    if (team.kind !== 'team') continue;
    if (team.repositoryAccess.length === 0) {
      rows.push(
        buildCsvRow([
          team.organizationId,
          resolveOrgName(bundle, team.organizationId),
          team.id,
          team.name,
          team.parentTeamId ?? 'None',
          formatCountMetric(team.membershipCount),
          'None',
          'None',
        ]),
      );
    } else {
      for (const access of team.repositoryAccess) {
        rows.push(
          buildCsvRow([
            team.organizationId,
            resolveOrgName(bundle, team.organizationId),
            team.id,
            team.name,
            team.parentTeamId ?? 'None',
            formatCountMetric(team.membershipCount),
            access.repositoryId,
            access.permission,
          ]),
        );
      }
    }
  }

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 5. Security Posture CSV
 */
export function generateSecurityPostureCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Organization ID',
    'Organization Name',
    'Repository ID',
    'Code Scanning Status',
    'Dependabot Status',
    'Open Alert Count',
    'Alert Availability',
    'Alert Reason',
  ];

  const secEntities = bundle.entities.filter(
    (e) =>
      e.kind === 'security' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );

  const rows = secEntities.map((s) => {
    if (s.kind !== 'security') return '';
    return buildCsvRow([
      s.organizationId,
      resolveOrgName(bundle, s.organizationId),
      s.repositoryId,
      s.codeScanning,
      s.dependabot,
      s.openAlertCount.value ?? '',
      s.openAlertCount.availability,
      s.openAlertCount.reason ?? '',
    ]);
  });

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 6. Integrations CSV
 */
export function generateIntegrationsCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Organization ID',
    'Organization Name',
    'Integration ID',
    'Kind',
    'Label',
    'Target Repository ID',
    'Active',
  ];

  const integrations = bundle.entities.filter(
    (e) =>
      e.kind === 'integration' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );

  const rows = integrations.map((i) => {
    if (i.kind !== 'integration') return '';
    return buildCsvRow([
      i.organizationId,
      resolveOrgName(bundle, i.organizationId),
      i.id,
      i.integrationKind,
      i.label,
      i.repositoryId ?? 'Organization-wide',
      i.active ?? 'unknown',
    ]);
  });

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 7. Identities & Users CSV
 */
export function generateIdentitiesCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Organization ID',
    'Organization Name',
    'Pseudonym',
    'Membership Role',
    'Outside Collaborator',
    'SSO Status',
  ];

  const users = bundle.entities.filter(
    (e) =>
      e.kind === 'identity' &&
      (!filteredOrgId || e.organizationId === filteredOrgId),
  );

  const rows = users.map((u) => {
    if (u.kind !== 'identity') return '';
    return buildCsvRow([
      u.organizationId,
      resolveOrgName(bundle, u.organizationId),
      u.pseudonym,
      u.membership,
      u.outsideCollaborator ?? 'unknown',
      u.ssoStatus,
    ]);
  });

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 8. Collector Health & Audit CSV
 */
export function generateCollectorHealthCsv(
  bundle: DiscoveryBundle,
  filteredOrgId?: string,
): string {
  const headers = [
    'Module',
    'Organization ID',
    'Organization Name',
    'Status',
    'Started At',
    'Completed At',
    'Coverage State',
    'Observed Count',
    'Expected Count',
    'Coverage Reason',
    'Errors Count',
    'Error Details',
    'Warnings Count',
    'Warning Details',
  ];

  const collectors = bundle.collectors.filter(
    (c) => !filteredOrgId || c.organizationId === filteredOrgId,
  );

  const rows = collectors.map((c) =>
    buildCsvRow([
      c.module,
      c.organizationId,
      resolveOrgName(bundle, c.organizationId),
      c.status,
      c.startedAt,
      c.completedAt,
      c.coverage.state,
      c.coverage.observed,
      c.coverage.expected ?? 'N/A',
      c.coverage.reason ?? '',
      c.errors.length,
      c.errors.map((e) => `[${e.code}] ${e.message}`).join('; '),
      c.warnings.length,
      c.warnings.join('; '),
    ]),
  );

  return [buildCsvRow(headers), ...rows].join('\r\n');
}

/**
 * 9. Executive Assessment Summary CSV
 */
export function generateExecutiveSummaryCsv(
  bundle: DiscoveryBundle,
  insights: EvaluatedInsights,
): string {
  const meta = [
    ['Discovery Scan ID', bundle.scan.id],
    ['Producer', `${bundle.scan.producer} v${bundle.scan.producerVersion}`],
    ['Scan Started', bundle.scan.startedAt],
    ['Scan Completed', bundle.scan.completedAt],
    ['Scan Status', bundle.scan.status],
    ['Scope Kind', bundle.scope.kind],
    [
      'Scope Target',
      bundle.scope.kind === 'enterprise'
        ? bundle.scope.slug
        : bundle.scope.organizationId,
    ],
    [
      'Enterprise Enumeration',
      bundle.scope.kind === 'enterprise' ? bundle.scope.enumeration : 'N/A',
    ],
    ['Synthetic Fixture', bundle.synthetic ? 'Yes' : 'No'],
    ['Redaction Profile', bundle.configuration.redactionProfile],
    ['Total Organizations Assessed', bundle.summary.organizationCount],
    ['Total Repositories Assessed', bundle.summary.repositoryCount],
    ['Complete Collectors', bundle.summary.completeCollectorCount],
    ['Incomplete Collectors', bundle.summary.incompleteCollectorCount],
    ['Total Advisory Findings', insights.findings.length],
    [],
    ['Migration Dimension', 'Status', 'Summary', 'Caveats'],
  ];

  const dimRows = insights.dimensions.map((d) => [
    d.name,
    d.statusLabel,
    d.summary,
    d.caveats.join('; '),
  ]);

  return [
    ...meta.map((r) => buildCsvRow(r)),
    ...dimRows.map((r) => buildCsvRow(r)),
  ].join('\r\n');
}
