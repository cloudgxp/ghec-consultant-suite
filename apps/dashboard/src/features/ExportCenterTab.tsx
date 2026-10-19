import React, { useMemo } from 'react';
import { PageHeader, SurfaceCard } from '../components/ui/index.js';
import { Button, Flash, Label } from '@primer/react';
import { DownloadIcon, ShieldCheckIcon } from '@primer/octicons-react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import {
  generateRepositoriesCsv,
  generateMigrationReadinessCsv,
  generateActionsAndSecretsCsv,
  generateTeamsAndPermissionsCsv,
  generateSecurityPostureCsv,
  generateIntegrationsCsv,
  generateIdentitiesCsv,
  generateCollectorHealthCsv,
  generateExecutiveSummaryCsv,
  downloadCsv,
  sanitizeCsvField,
} from '../lib/export-csv.js';
import { downloadPdfReport } from '../lib/export-pdf.js';
import type {
  HydratedOperationRow,
  HydratedPostCareItem,
  HydratedSkippedArchivedRow,
  ResultsHydrationData,
} from '../lib/importer.js';

interface ExportCenterTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgIds: readonly string[];
  resultsHydration?: ResultsHydrationData | undefined;
}

function buildPostCareCsv(items: readonly HydratedPostCareItem[]): string {
  const headers = [
    'Item ID',
    'Priority',
    'Category',
    'Scope Level',
    'Target Org',
    'Target Repo',
    'Environment',
    'Sub-Domain',
    'Module ID',
    'Resource Name',
    'Migration Status',
    'Action Required',
    'Settings URL',
    'Secondary URL',
    'CLI Command',
    'Notes',
  ];
  const rows = items.map((item) =>
    [
      item.itemId,
      item.priority,
      item.category,
      item.scopeLevel,
      item.targetOrg,
      item.targetRepo ?? '',
      item.environmentName ?? '',
      item.subDomain,
      item.moduleId,
      item.resourceName,
      item.migrationStatus,
      item.actionRequired,
      item.settingsUrl,
      item.secondaryUrl ?? '',
      item.cliCommand ?? '',
      item.notes ?? '',
    ]
      .map((val) => sanitizeCsvField(val))
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

function buildOperationsCsv(rows: readonly HydratedOperationRow[]): string {
  const headers = [
    'Scope Level',
    'Target Org',
    'Target Repo',
    'Sub-Domain',
    'Module ID',
    'Resource Type',
    'Resource Name',
    'Operation Type',
    'Status',
    'Verification Status',
    'Requires Post-Care',
    'Sealed Secret',
    'Settings URL',
    'CLI Command',
    'Notes',
  ];
  const lines = rows.map((r) =>
    [
      r.scopeLevel,
      r.targetOrg,
      r.targetRepo,
      r.subDomain,
      r.moduleId,
      r.resourceType,
      r.resourceName,
      r.operationType,
      r.status,
      r.verificationStatus,
      r.requiresPostCare ? 'true' : 'false',
      r.isSecret ? 'true' : 'false',
      r.settingsUrl,
      r.cliCommand,
      r.notes,
    ]
      .map((val) => sanitizeCsvField(val))
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

function buildSkippedArchivedCsv(
  rows: readonly HydratedSkippedArchivedRow[],
): string {
  const headers = [
    'Source Org',
    'Source Repo',
    'Visibility',
    'Is Fork',
    'Archived Status',
    'Disposition',
    'Source URL',
    'Notes',
  ];
  const lines = rows.map((r) =>
    [
      r.sourceOrg,
      r.sourceRepo,
      r.visibility,
      r.isFork ? 'true' : 'false',
      r.archivedStatus,
      r.disposition,
      r.sourceUrl,
      r.notes,
    ]
      .map((val) => sanitizeCsvField(val))
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

export const ExportCenterTab: React.FC<ExportCenterTabProps> = ({
  bundle,
  insights,
  selectedOrgIds,
  resultsHydration,
}) => {
  const orgFilter = selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined;
  const includesOrganization = useMemo(
    () => (organizationId: string) =>
      selectedOrgIds.length === 0 || selectedOrgIds.includes(organizationId),
    [selectedOrgIds],
  );

  // ⚡ Bolt: Calculate all entity metrics in a single O(N) pass to prevent redundant array iterations
  const metrics = useMemo(() => {
    const counts = {
      repositories: 0,
      actions: 0,
      teams: 0,
      security: 0,
      integrations: 0,
      identities: 0,
    };

    for (const entity of bundle.entities) {
      if (includesOrganization(entity.organizationId)) {
        if (entity.kind === 'repository') counts.repositories++;
        else if (entity.kind === 'actions' || entity.kind === 'actions-secret')
          counts.actions++;
        else if (entity.kind === 'team') counts.teams++;
        else if (entity.kind === 'security') counts.security++;
        else if (entity.kind === 'integration') counts.integrations++;
        else if (entity.kind === 'identity') counts.identities++;
      }
    }

    return counts;
  }, [bundle.entities, includesOrganization]);

  const readinessFindingsCount = useMemo(
    () =>
      insights.findings.filter((f) => includesOrganization(f.organizationId))
        .length,
    [insights.findings, includesOrganization],
  );

  const healthCollectorsCount = useMemo(
    () =>
      bundle.collectors.filter((c) => includesOrganization(c.organizationId))
        .length,
    [bundle.collectors, includesOrganization],
  );

  const postCareExportOptions = useMemo(() => {
    if (!resultsHydration) return [];
    const items = resultsHydration.postCare.items;
    const ops = resultsHydration.postCare.operationRows;
    const skipped = resultsHydration.postCare.skippedArchivedRows;
    if (items.length === 0 && ops.length === 0 && skipped.length === 0) {
      return [];
    }
    const secrets = items.filter((i) => i.category === 'secret');
    const apps = items.filter((i) => i.category === 'github-app');
    const webhooks = items.filter((i) => i.category === 'webhook');
    const runners = items.filter((i) => i.category === 'runner');
    const identity = items.filter(
      (i) =>
        i.category === 'idp-team' ||
        i.category === 'mannequin' ||
        i.category === 'collaborator' ||
        i.category === 'deploy-key',
    );
    const governance = items.filter(
      (i) =>
        i.category === 'policy' ||
        i.category === 'package' ||
        i.category === 'security' ||
        i.category === 'failed-operation',
    );

    return [
      {
        id: 'post-care-items',
        title: 'All Post-Care Action Items',
        filename: 'post-care-items.csv',
        description:
          'Complete post-migration operator checklist across all 6 cutover categories with direct GitHub Settings links and CLI commands.',
        rowsCount: items.length,
        columns:
          'Item ID, Priority, Category, Scope, Target Org/Repo, Resource, Status, Action Required, Settings URL, CLI Command',
        generator: () => buildPostCareCsv(items),
      },
      {
        id: 'secrets-to-populate',
        title: 'Secrets to Populate ([SEALED])',
        filename: 'secrets-to-populate.csv',
        description:
          'Organization, repository, and environment secrets created as empty [SEALED] placeholders requiring secret value population.',
        rowsCount: secrets.length,
        columns:
          'Item ID, Priority, Scope, Target Org/Repo, Environment, Sub-Domain, Secret Name, Settings URL, gh secret set Command',
        generator: () => buildPostCareCsv(secrets),
      },
      {
        id: 'github-apps-reinstall',
        title: 'GitHub Apps to Re-Install',
        filename: 'github-apps-reinstall.csv',
        description:
          'GitHub App installations requiring target organization installation and OAuth/webhook endpoint verification.',
        rowsCount: apps.length,
        columns:
          'Item ID, Priority, Target Org, App Slug, Action Required, Target App Settings URL, Source App URL',
        generator: () => buildPostCareCsv(apps),
      },
      {
        id: 'webhooks-reconfiguration',
        title: 'Webhooks Reconfiguration',
        filename: 'webhooks-reconfiguration.csv',
        description:
          'Organization and repository webhooks migrated in Inactive state requiring shared secret entry and activation.',
        rowsCount: webhooks.length,
        columns:
          'Item ID, Priority, Scope, Target Org/Repo, Webhook Resource, Action Required, Settings URL, gh api Activation Command',
        generator: () => buildPostCareCsv(webhooks),
      },
      {
        id: 'runners-registration',
        title: 'Self-Hosted & Larger Runners',
        filename: 'runners-registration.csv',
        description:
          'Self-hosted runners and runner groups requiring daemon re-registration and Actions billing verification.',
        rowsCount: runners.length,
        columns:
          'Item ID, Priority, Scope, Target Org/Repo, Runner / Group Name, Action Required, Runner Settings URL',
        generator: () => buildPostCareCsv(runners),
      },
      {
        id: 'identity-and-access',
        title: 'Identity, Teams & EMU Mannequins',
        filename: 'identity-and-access.csv',
        description:
          'EMU mannequin reclamation items, IdP team group bindings, deploy keys, and outside collaborator access reviews.',
        rowsCount: identity.length,
        columns:
          'Item ID, Priority, Target Org/Repo, Identity Resource, Action Required, Settings URL, CLI Command',
        generator: () => buildPostCareCsv(identity),
      },
      {
        id: 'governance-and-remediation',
        title: 'Governance & Remediation',
        filename: 'governance-and-remediation.csv',
        description:
          'Custom repository roles, rulesets, packages, and failed/skipped module remediations.',
        rowsCount: governance.length,
        columns:
          'Item ID, Priority, Scope, Target Org/Repo, Resource, Action Required, Settings URL, CLI Command',
        generator: () => buildPostCareCsv(governance),
      },
      {
        id: 'migration-operations-full',
        title: 'Full Migration Operations Audit Log',
        filename: 'migration-operations-full.csv',
        description:
          'Every granular organization and repository module operation (mutated, noop, skipped, failed) with verification status.',
        rowsCount: ops.length,
        columns:
          'Scope, Target Org, Repo, Module ID, Resource, Operation, Status, Verification, [SEALED], Settings URL, Notes',
        generator: () => buildOperationsCsv(ops),
      },
      {
        id: 'archived-repositories-skipped',
        title: 'Skipped Archived Repositories',
        filename: 'archived-repositories-skipped.csv',
        description:
          'Archived source repositories intentionally excluded from default migration scope (re-run with --include-archived to migrate).',
        rowsCount: skipped.length,
        columns:
          'Source Org, Source Repo, Visibility, Is Fork, Archived Status, Disposition, Source URL, Notes',
        generator: () => buildSkippedArchivedCsv(skipped),
      },
    ];
  }, [resultsHydration]);

  const exportOptions = useMemo(
    () => [
      {
        id: 'executive',
        title: 'Executive Assessment Summary',
        filename: `executive-summary-${bundle.scan.id}.csv`,
        description:
          'High-level roll-up of discovery scan metadata, scope boundaries, summary KPIs, and migration dimension statuses.',
        rowsCount: insights.dimensions.length + 15,
        columns:
          'Scan ID, Scope, Producer, Total Orgs, Total Repos, Dimension Ratings, Findings',
        generator: () => generateExecutiveSummaryCsv(bundle, insights),
      },
      {
        id: 'repositories',
        title: 'Repositories Full Inventory',
        filename: `repositories-${bundle.scan.id}.csv`,
        description:
          'Detailed inventory of all discovered repositories including size, visibility, branch, LFS status, security status, and actions workflows.',
        rowsCount: metrics.repositories,
        columns:
          'Org, Repo ID, Name, Visibility, Archived, Size (Formatted/Bytes), LFS, Actions, Dependabot, Code Scanning',
        generator: () => generateRepositoriesCsv(bundle, orgFilter),
      },
      {
        id: 'readiness',
        title: 'Migration Findings & Advisories',
        filename: `migration-findings-${bundle.scan.id}.csv`,
        description:
          'Documented analytical and advisory findings with severity, confidence, affected entity IDs, collector evidence references, and limitations.',
        rowsCount: readinessFindingsCount,
        columns:
          'Rule ID, Severity, Classification, Confidence, Org, Title, Description, Entity IDs, Evidence IDs, Limitations',
        generator: () =>
          generateMigrationReadinessCsv(bundle, insights, orgFilter),
      },
      {
        id: 'actions',
        title: 'Actions Workflows & Secrets Inventory',
        filename: `actions-and-secrets-${bundle.scan.id}.csv`,
        description:
          'Inventory of GitHub Actions workflows, self-hosted vs hosted runner environments, and secrets/variables metadata names.',
        rowsCount: metrics.actions,
        columns:
          'Kind, Org, Target Repo, Name, Config Type, Level, Workflows, Runners, Last Updated',
        generator: () => generateActionsAndSecretsCsv(bundle, orgFilter),
      },
      {
        id: 'teams',
        title: 'Teams & Repository Permissions',
        filename: `teams-and-permissions-${bundle.scan.id}.csv`,
        description:
          'Team organizational hierarchies, membership counts, and mapped repository permission grants.',
        rowsCount: metrics.teams,
        columns:
          'Org, Team ID, Team Name, Parent Team, Members, Target Repo, Granted Permission',
        generator: () => generateTeamsAndPermissionsCsv(bundle, orgFilter),
      },
      {
        id: 'security',
        title: 'Security Tooling Posture',
        filename: `security-posture-${bundle.scan.id}.csv`,
        description:
          'Repository-level security configurations for Dependabot, Code Scanning, and open alert counts with coverage caveats.',
        rowsCount: metrics.security,
        columns:
          'Org, Repo ID, Code Scanning, Dependabot, Open Alert Count, Availability, Reason',
        generator: () => generateSecurityPostureCsv(bundle, orgFilter),
      },
      {
        id: 'integrations',
        title: 'External Integrations & Keys',
        filename: `integrations-${bundle.scan.id}.csv`,
        description:
          'Discovered webhooks, GitHub Apps, and deploy keys requiring cutover planning and re-authorization.',
        rowsCount: metrics.integrations,
        columns: 'Org, Integration ID, Kind, Label, Target Repo, Active Status',
        generator: () => generateIntegrationsCsv(bundle, orgFilter),
      },
      {
        id: 'identities',
        title: 'Identities & SSO Posture',
        filename: `identities-and-access-${bundle.scan.id}.csv`,
        description:
          'Pseudonymized human identities with membership roles, outside collaborator flags, and SAML/SCIM SSO link statuses.',
        rowsCount: metrics.identities,
        columns:
          'Org, Pseudonym, Membership Role, Outside Collaborator, SSO Status',
        generator: () => generateIdentitiesCsv(bundle, orgFilter),
      },
      {
        id: 'health',
        title: 'Collector Health & Evidence Audit',
        filename: `collector-health-${bundle.scan.id}.csv`,
        description:
          'Full execution audit of every collector module including terminal states, coverage ratios, warnings, and errors.',
        rowsCount: healthCollectorsCount,
        columns:
          'Module, Org, Status, Started At, Completed At, Coverage State, Observed, Expected, Errors, Warnings',
        generator: () => generateCollectorHealthCsv(bundle, orgFilter),
      },
    ],
    [
      bundle,
      insights,
      orgFilter,
      metrics,
      readinessFindingsCount,
      healthCollectorsCount,
    ],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Export Center"
        description={
          <>
            Generate presentation-ready PDFs or download structured,
            formula-safe CSV reports. All exports are created in browser memory.
            {selectedOrgIds.length > 0 && (
              <span className="font-semibold text-[var(--fgColor-accent)] ml-1">
                (Filtered by {selectedOrgIds.length} organization(s))
              </span>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SurfaceCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[var(--fgColor-default)]">
              Executive Assessment PDF
            </h3>
            <p className="text-xs text-[var(--fgColor-muted)] mt-2">
              Executive scorecard, KPIs, scope disclosures, and prioritized
              migration blockers.
            </p>
          </div>
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadPdfReport('executive', bundle, insights, orgFilter)
            }
            className="mt-4 self-start"
          >
            Download Executive PDF
          </Button>
        </SurfaceCard>
        <SurfaceCard className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[var(--fgColor-default)]">
              Technical Discovery PDF
            </h3>
            <p className="text-xs text-[var(--fgColor-muted)] mt-2">
              Repository inventory, CI/CD, security posture, and collector
              provenance audit.
            </p>
          </div>
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadPdfReport('technical', bundle, insights, orgFilter)
            }
            className="mt-4 self-start"
          >
            Download Technical PDF
          </Button>
        </SurfaceCard>
      </div>

      {/* Security & Neutralization Guarantee Banner */}
      <Flash variant="default">
        <div className="flex items-start gap-2 text-xs">
          <ShieldCheckIcon className="shrink-0 text-[var(--fgColor-accent)] mt-0.5" />
          <span>
            <strong>Spreadsheet Formula Injection Protected</strong>: In
            compliance with <code>DASH-EXPORT-001</code>, all text cells
            beginning with <code>=</code>, <code>+</code>, <code>-</code>,{' '}
            <code>@</code>, or control characters are safely neutralized.
            Unknown metrics are explicitly marked without coercing to zero.
          </span>
        </div>
      </Flash>

      {/* Post-Migration & Post-Care CSV Deliverables */}
      {postCareExportOptions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--fgColor-muted)] m-0">
            Post-Migration & Post-Care CSV Deliverables (exports/*.csv)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {postCareExportOptions.map((opt) => (
              <SurfaceCard
                key={opt.id}
                className="p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-[var(--fgColor-default)] m-0">
                      {opt.title}
                    </h4>
                    <Label
                      size="small"
                      variant="accent"
                      className="shrink-0 font-mono"
                    >
                      {opt.rowsCount} rows
                    </Label>
                  </div>
                  <p className="text-xs text-[var(--fgColor-muted)] mt-2">
                    {opt.description}
                  </p>
                  <div className="mt-3 bg-[var(--bgColor-muted)] p-2 rounded text-[11px] text-[var(--fgColor-muted)] font-mono border border-[var(--borderColor-default)]">
                    <strong>File:</strong> <code>exports/{opt.filename}</code>
                    <div className="mt-1">
                      <strong>Columns:</strong> {opt.columns}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[var(--borderColor-default)]">
                  <Button
                    block
                    size="small"
                    variant="primary"
                    leadingVisual={DownloadIcon}
                    onClick={() => downloadCsv(opt.filename, opt.generator())}
                  >
                    Download {opt.filename}
                  </Button>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </div>
      )}

      {/* Discovery Inventory Export Cards Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--fgColor-muted)] m-0">
          Discovery & Readiness Inventory Exports
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exportOptions.map((opt) => (
            <SurfaceCard
              key={opt.id}
              className="p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-sm text-[var(--fgColor-default)] m-0">
                    {opt.title}
                  </h4>
                  <Label size="small" variant="secondary" className="shrink-0">
                    {opt.rowsCount} rows
                  </Label>
                </div>
                <p className="text-xs text-[var(--fgColor-muted)] mt-2">
                  {opt.description}
                </p>
                <div className="mt-3 bg-[var(--bgColor-muted)] p-2 rounded text-[11px] text-[var(--fgColor-muted)] font-mono border border-[var(--borderColor-default)]">
                  <strong>Columns:</strong> {opt.columns}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[var(--borderColor-default)]">
                <Button
                  block
                  size="small"
                  variant="primary"
                  leadingVisual={DownloadIcon}
                  onClick={() => downloadCsv(opt.filename, opt.generator())}
                >
                  Download CSV
                </Button>
              </div>
            </SurfaceCard>
          ))}
        </div>
      </div>
    </div>
  );
};
