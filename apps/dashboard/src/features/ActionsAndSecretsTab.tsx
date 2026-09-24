import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import {
  formatCountMetric,
  formatMinutesMetric,
  formatTimestamp,
  resolveOrgName,
} from '../lib/formatters.js';
import {
  generateActionsAndSecretsCsv,
  downloadCsv,
} from '../lib/export-csv.js';

interface ActionsAndSecretsTabProps {
  bundle: DiscoveryBundle;
  selectedOrgId: string;
}

export const ActionsAndSecretsTab: React.FC<ActionsAndSecretsTabProps> = ({
  bundle,
  selectedOrgId,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'actions' | 'secrets'>(
    'actions',
  );
  const [searchQuery, setSearchQuery] = useState('');

  const actionsEntities = bundle.entities.filter(
    (e) =>
      e.kind === 'actions' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'actions' }>[];

  const secretsEntities = bundle.entities.filter(
    (e) =>
      e.kind === 'actions-secret' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'actions-secret' }>[];

  const filteredActions = actionsEntities.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.repositoryId.toLowerCase().includes(q) ||
      a.workflowNames.some((w) => w.toLowerCase().includes(q))
    );
  });

  const filteredSecrets = secretsEntities.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.repositoryId && s.repositoryId.toLowerCase().includes(q))
    );
  });

  const handleExportCsv = () => {
    const csv = generateActionsAndSecretsCsv(
      bundle,
      selectedOrgId || undefined,
    );
    downloadCsv(`actions-and-secrets-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-base-content">
            Actions, Runners & Configuration
          </h2>
          <p className="text-sm text-base-content/70 mt-1">
            Audit workflow automation, runner environments, and
            secrets/variables inventories.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="btn btn-primary btn-sm gap-2 shrink-0"
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
          Export Workflows & Secrets (CSV)
        </button>
      </div>

      {/* Sub-tab Navigation and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-base-100 p-4 rounded-xl border border-base-300 shadow-xs">
        <div className="tabs tabs-boxed">
          <button
            type="button"
            className={`tab ${activeSubTab === 'actions' ? 'tab-active' : ''}`}
            onClick={() => setActiveSubTab('actions')}
          >
            Workflows & Runners ({actionsEntities.length})
          </button>
          <button
            type="button"
            className={`tab ${activeSubTab === 'secrets' ? 'tab-active' : ''}`}
            onClick={() => setActiveSubTab('secrets')}
          >
            Secrets & Variables ({secretsEntities.length})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="search"
            placeholder={`Search ${activeSubTab}...`}
            className="input input-sm input-bordered w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Sub-Tab 1: Workflows & Runners */}
      {activeSubTab === 'actions' && (
        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
          <table
            className="table table-sm table-zebra w-full"
            aria-label="Actions workflows table"
          >
            <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
              <tr>
                <th scope="col">Target Repository</th>
                <th scope="col">Organization</th>
                <th scope="col">Workflows</th>
                <th scope="col">Workflow Names</th>
                <th scope="col">Runners</th>
                <th scope="col">Runner Infrastructure</th>
                <th scope="col">Usage</th>
              </tr>
            </thead>
            <tbody>
              {filteredActions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-8 text-base-content/60"
                  >
                    No actions entities found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredActions.map((action) => (
                  <tr key={action.id} className="hover:bg-base-200/50">
                    <td className="font-mono text-xs font-bold text-base-content">
                      {action.repositoryId}
                    </td>
                    <td className="text-xs text-base-content/70">
                      {resolveOrgName(bundle, action.organizationId)}
                    </td>
                    <td className="font-semibold text-xs">
                      {formatCountMetric(action.workflowCount)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {action.workflowNames.map((name) => (
                          <span
                            key={name}
                            className="badge badge-xs badge-ghost font-mono"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-xs font-mono">
                      {formatCountMetric(action.runnerCount)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {action.runnerTypes.map((type) => (
                          <span
                            key={type}
                            className={`badge badge-xs font-semibold ${
                              type === 'self-hosted'
                                ? 'badge-error'
                                : 'badge-neutral'
                            }`}
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-xs font-mono text-base-content/70">
                      {formatMinutesMetric(action.usage)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-Tab 2: Secrets & Variables */}
      {activeSubTab === 'secrets' && (
        <div className="space-y-4">
          <div className="alert alert-info py-3 text-xs shadow-xs">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <strong>Zero Secret Values Stored</strong>: For security, GitHub
              APIs and discovery bundles only provide secret names, scopes, and
              timestamps. Secret values must be regenerated or copied by
              authorized personnel in the target destination.
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
            <table
              className="table table-sm table-zebra w-full"
              aria-label="Secrets and variables inventory table"
            >
              <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Configuration Kind</th>
                  <th scope="col">Scope Level</th>
                  <th scope="col">Target Repository / Scope</th>
                  <th scope="col">Organization</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredSecrets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-8 text-base-content/60"
                    >
                      No configuration items found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSecrets.map((secret) => (
                    <tr key={secret.id} className="hover:bg-base-200/50">
                      <td className="font-mono text-xs font-bold text-base-content">
                        {secret.name}
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm font-semibold capitalize ${
                            secret.configurationKind === 'secret'
                              ? 'badge-warning'
                              : 'badge-info'
                          }`}
                        >
                          {secret.configurationKind}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-sm badge-ghost capitalize">
                          {secret.level}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-base-content/70">
                        {secret.repositoryId ?? 'Organization-wide'}
                      </td>
                      <td className="text-xs text-base-content/70">
                        {resolveOrgName(bundle, secret.organizationId)}
                      </td>
                      <td className="text-xs text-base-content/60">
                        {formatTimestamp(secret.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
