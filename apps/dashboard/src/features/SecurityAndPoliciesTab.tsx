import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { formatCountMetric, resolveOrgName } from '../lib/formatters.js';
import {
  generateSecurityPostureCsv,
  generateIntegrationsCsv,
  downloadCsv,
} from '../lib/export-csv.js';

interface SecurityAndPoliciesTabProps {
  bundle: DiscoveryBundle;
  selectedOrgId: string;
}

export const SecurityAndPoliciesTab: React.FC<SecurityAndPoliciesTabProps> = ({
  bundle,
  selectedOrgId,
}) => {
  const [subSection, setSubSection] = useState<
    'security' | 'policies' | 'integrations'
  >('security');

  const secEntities = bundle.entities.filter(
    (e) =>
      e.kind === 'security' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'security' }>[];

  const policyEntities = bundle.entities.filter(
    (e) =>
      e.kind === 'policy' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'policy' }>[];

  const integrationEntities = bundle.entities.filter(
    (e) =>
      e.kind === 'integration' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'integration' }>[];

  const handleExportSecCsv = () => {
    const csv = generateSecurityPostureCsv(bundle, selectedOrgId || undefined);
    downloadCsv(`security-posture-${bundle.scan.id}.csv`, csv);
  };

  const handleExportIntCsv = () => {
    const csv = generateIntegrationsCsv(bundle, selectedOrgId || undefined);
    downloadCsv(`integrations-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-base-content">
            Security, Governance & Integrations
          </h2>
          <p className="text-sm text-base-content/70 mt-1">
            Review security tool enablement, branch rulesets, and external
            integration points.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportSecCsv}
            className="btn btn-primary btn-sm gap-2"
          >
            Export Security (CSV)
          </button>
          <button
            type="button"
            onClick={handleExportIntCsv}
            className="btn btn-outline btn-sm gap-2"
          >
            Export Integrations (CSV)
          </button>
        </div>
      </div>

      {/* Sub Section Tabs */}
      <div className="tabs tabs-boxed bg-base-100 p-2 rounded-xl border border-base-300 shadow-xs">
        <button
          type="button"
          className={`tab ${subSection === 'security' ? 'tab-active' : ''}`}
          onClick={() => setSubSection('security')}
        >
          Security Posture ({secEntities.length})
        </button>
        <button
          type="button"
          className={`tab ${subSection === 'policies' ? 'tab-active' : ''}`}
          onClick={() => setSubSection('policies')}
        >
          Policies & Rulesets ({policyEntities.length})
        </button>
        <button
          type="button"
          className={`tab ${subSection === 'integrations' ? 'tab-active' : ''}`}
          onClick={() => setSubSection('integrations')}
        >
          Integrations & Keys ({integrationEntities.length})
        </button>
      </div>

      {/* Section 1: Security Posture */}
      {subSection === 'security' && (
        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
          <table
            className="table table-sm table-zebra w-full"
            aria-label="Security posture table"
          >
            <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Organization</th>
                <th scope="col">Code Scanning</th>
                <th scope="col">Dependabot</th>
                <th scope="col">Open Alerts</th>
                <th scope="col">Alert Availability Note</th>
              </tr>
            </thead>
            <tbody>
              {secEntities.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-base-content/60"
                  >
                    No security posture records found.
                  </td>
                </tr>
              ) : (
                secEntities.map((sec) => (
                  <tr key={sec.id} className="hover:bg-base-200/50">
                    <td className="font-mono text-xs font-bold text-base-content">
                      {sec.repositoryId}
                    </td>
                    <td className="text-xs text-base-content/70">
                      {resolveOrgName(bundle, sec.organizationId)}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm font-semibold capitalize ${
                          sec.codeScanning === 'enabled'
                            ? 'badge-success'
                            : sec.codeScanning === 'disabled'
                              ? 'badge-error'
                              : 'badge-ghost'
                        }`}
                      >
                        {sec.codeScanning}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm font-semibold capitalize ${
                          sec.dependabot === 'enabled'
                            ? 'badge-success'
                            : sec.dependabot === 'disabled'
                              ? 'badge-error'
                              : 'badge-ghost'
                        }`}
                      >
                        {sec.dependabot}
                      </span>
                    </td>
                    <td className="text-xs font-mono">
                      {formatCountMetric(sec.openAlertCount)}
                    </td>
                    <td className="text-xs text-base-content/60">
                      {sec.openAlertCount.reason ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 2: Policies & Rulesets */}
      {subSection === 'policies' && (
        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
          <table
            className="table table-sm table-zebra w-full"
            aria-label="Policies and rulesets table"
          >
            <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
              <tr>
                <th scope="col">Policy Name</th>
                <th scope="col">Policy Kind</th>
                <th scope="col">Enforcement</th>
                <th scope="col">Target Scope / Repository</th>
                <th scope="col">Organization</th>
              </tr>
            </thead>
            <tbody>
              {policyEntities.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8 text-base-content/60"
                  >
                    No policy records found.
                  </td>
                </tr>
              ) : (
                policyEntities.map((policy) => (
                  <tr key={policy.id} className="hover:bg-base-200/50">
                    <td className="font-bold text-xs text-base-content">
                      {policy.name}
                    </td>
                    <td>
                      <span className="badge badge-sm badge-outline font-mono text-xs">
                        {policy.policyKind}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm font-semibold capitalize ${
                          policy.enforcement === 'active'
                            ? 'badge-success'
                            : policy.enforcement === 'evaluate'
                              ? 'badge-warning'
                              : 'badge-ghost'
                        }`}
                      >
                        {policy.enforcement}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-base-content/70">
                      {policy.repositoryId ?? 'Organization-wide'}
                    </td>
                    <td className="text-xs text-base-content/70">
                      {resolveOrgName(bundle, policy.organizationId)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 3: Integrations & Keys */}
      {subSection === 'integrations' && (
        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
          <table
            className="table table-sm table-zebra w-full"
            aria-label="Integrations table"
          >
            <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
              <tr>
                <th scope="col">Label / Identifier</th>
                <th scope="col">Integration Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Target Scope</th>
                <th scope="col">Organization</th>
              </tr>
            </thead>
            <tbody>
              {integrationEntities.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8 text-base-content/60"
                  >
                    No integration records found.
                  </td>
                </tr>
              ) : (
                integrationEntities.map((item) => (
                  <tr key={item.id} className="hover:bg-base-200/50">
                    <td className="font-bold text-xs text-base-content font-mono">
                      {item.label}
                    </td>
                    <td>
                      <span className="badge badge-sm badge-neutral capitalize">
                        {item.integrationKind.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {item.active === true ? (
                        <span className="badge badge-sm badge-success font-semibold">
                          Active
                        </span>
                      ) : item.active === false ? (
                        <span className="badge badge-sm badge-ghost">
                          Inactive
                        </span>
                      ) : (
                        <span className="badge badge-sm badge-outline">
                          Unknown
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs text-base-content/70">
                      {item.repositoryId ?? 'Organization-wide'}
                    </td>
                    <td className="text-xs text-base-content/70">
                      {resolveOrgName(bundle, item.organizationId)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
