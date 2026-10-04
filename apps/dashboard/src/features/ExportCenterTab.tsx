import React from 'react';
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
} from '../lib/export-csv.js';
import { downloadPdfReport } from '../lib/export-pdf.js';

interface ExportCenterTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgIds: readonly string[];
}

export const ExportCenterTab: React.FC<ExportCenterTabProps> = ({
  bundle,
  insights,
  selectedOrgIds,
}) => {
  const orgFilter = selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined;
  const includesOrganization = (organizationId: string) =>
    selectedOrgIds.length === 0 || selectedOrgIds.includes(organizationId);

  const exportOptions = [
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
      rowsCount: bundle.entities.filter(
        (e) =>
          e.kind === 'repository' && includesOrganization(e.organizationId),
      ).length,
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
      rowsCount: insights.findings.filter((f) =>
        includesOrganization(f.organizationId),
      ).length,
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
      rowsCount: bundle.entities.filter(
        (e) =>
          (e.kind === 'actions' || e.kind === 'actions-secret') &&
          includesOrganization(e.organizationId),
      ).length,
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
      rowsCount: bundle.entities.filter(
        (e) => e.kind === 'team' && includesOrganization(e.organizationId),
      ).length,
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
      rowsCount: bundle.entities.filter(
        (e) => e.kind === 'security' && includesOrganization(e.organizationId),
      ).length,
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
      rowsCount: bundle.entities.filter(
        (e) =>
          e.kind === 'integration' && includesOrganization(e.organizationId),
      ).length,
      columns: 'Org, Integration ID, Kind, Label, Target Repo, Active Status',
      generator: () => generateIntegrationsCsv(bundle, orgFilter),
    },
    {
      id: 'identities',
      title: 'Identities & SSO Posture',
      filename: `identities-and-access-${bundle.scan.id}.csv`,
      description:
        'Pseudonymized human identities with membership roles, outside collaborator flags, and SAML/SCIM SSO link statuses.',
      rowsCount: bundle.entities.filter(
        (e) => e.kind === 'identity' && includesOrganization(e.organizationId),
      ).length,
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
      rowsCount: bundle.collectors.filter((c) =>
        includesOrganization(c.organizationId),
      ).length,
      columns:
        'Module, Org, Status, Started At, Completed At, Coverage State, Observed, Expected, Errors, Warnings',
      generator: () => generateCollectorHealthCsv(bundle, orgFilter),
    },
  ];

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

      {/* Export Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exportOptions.map((opt) => (
          <SurfaceCard
            key={opt.id}
            className="p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-[var(--fgColor-default)]">
                  {opt.title}
                </h3>
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
  );
};
