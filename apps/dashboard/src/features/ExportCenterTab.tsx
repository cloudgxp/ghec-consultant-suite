import React from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import type { EvaluatedInsights } from '@ghec/analysis';
import { resolveOrgName } from '../lib/formatters.js';
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

interface ExportCenterTabProps {
  bundle: DiscoveryBundle;
  insights: EvaluatedInsights;
  selectedOrgId: string;
}

export const ExportCenterTab: React.FC<ExportCenterTabProps> = ({
  bundle,
  insights,
  selectedOrgId,
}) => {
  const orgFilter = selectedOrgId || undefined;

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
          e.kind === 'repository' &&
          (!orgFilter || e.organizationId === orgFilter),
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
      rowsCount: insights.findings.filter(
        (f) => !orgFilter || f.organizationId === orgFilter,
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
          (!orgFilter || e.organizationId === orgFilter),
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
        (e) =>
          e.kind === 'team' && (!orgFilter || e.organizationId === orgFilter),
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
        (e) =>
          e.kind === 'security' &&
          (!orgFilter || e.organizationId === orgFilter),
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
          e.kind === 'integration' &&
          (!orgFilter || e.organizationId === orgFilter),
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
        (e) =>
          e.kind === 'identity' &&
          (!orgFilter || e.organizationId === orgFilter),
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
      rowsCount: bundle.collectors.filter(
        (c) => !orgFilter || c.organizationId === orgFilter,
      ).length,
      columns:
        'Module, Org, Status, Started At, Completed At, Coverage State, Observed, Expected, Errors, Warnings',
      generator: () => generateCollectorHealthCsv(bundle, orgFilter),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <h2 className="text-2xl font-bold text-base-content">
          CSV Export Center
        </h2>
        <p className="text-sm text-base-content/70 mt-1">
          Download structured, formula-safe CSV reports ready for import into
          spreadsheets, reporting tools, or customer deliverables.
          {selectedOrgId && (
            <span className="font-semibold text-primary ml-1">
              (Filtered by {resolveOrgName(bundle, selectedOrgId)})
            </span>
          )}
        </p>
      </div>

      {/* Security & Neutralization Guarantee Card */}
      <div className="alert alert-neutral py-3 text-xs shadow-xs">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-5 w-5 text-primary"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>
          <strong>Spreadsheet Formula Injection Protected</strong>: In
          compliance with <code>DASH-EXPORT-001</code>, all text cells beginning
          with <code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>,
          or control characters are safely neutralized. Unknown metrics are
          explicitly marked without coercing to zero.
        </span>
      </div>

      {/* Export Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exportOptions.map((opt) => (
          <div
            key={opt.id}
            className="card bg-base-100 p-5 rounded-xl border border-base-300 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-base text-base-content">
                  {opt.title}
                </h3>
                <span className="badge badge-sm badge-neutral shrink-0">
                  {opt.rowsCount} rows
                </span>
              </div>
              <p className="text-xs text-base-content/70 mt-2">
                {opt.description}
              </p>
              <div className="mt-3 bg-base-200/50 p-2 rounded text-[11px] text-base-content/60 font-mono">
                <strong>Columns:</strong> {opt.columns}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-base-200">
              <button
                type="button"
                onClick={() => downloadCsv(opt.filename, opt.generator())}
                className="btn btn-primary btn-sm w-full gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
