import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { formatCountMetric, resolveOrgName } from '../lib/formatters.js';
import {
  generateTeamsAndPermissionsCsv,
  generateIdentitiesCsv,
  downloadCsv,
} from '../lib/export-csv.js';

interface TeamsAndIdentitiesTabProps {
  bundle: DiscoveryBundle;
  selectedOrgId: string;
}

export const TeamsAndIdentitiesTab: React.FC<TeamsAndIdentitiesTabProps> = ({
  bundle,
  selectedOrgId,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'teams' | 'identities'>(
    'teams',
  );

  const teams = bundle.entities.filter(
    (e) =>
      e.kind === 'team' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'team' }>[];

  const identities = bundle.entities.filter(
    (e) =>
      e.kind === 'identity' &&
      (!selectedOrgId || e.organizationId === selectedOrgId),
  ) as Extract<(typeof bundle.entities)[number], { kind: 'identity' }>[];

  const handleExportTeamsCsv = () => {
    const csv = generateTeamsAndPermissionsCsv(
      bundle,
      selectedOrgId || undefined,
    );
    downloadCsv(`teams-and-permissions-${bundle.scan.id}.csv`, csv);
  };

  const handleExportIdentitiesCsv = () => {
    const csv = generateIdentitiesCsv(bundle, selectedOrgId || undefined);
    downloadCsv(`identities-and-access-${bundle.scan.id}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-base-content">
            Teams, Access & Pseudonymized Identities
          </h2>
          <p className="text-sm text-base-content/70 mt-1">
            Review team structures, repository permissions, outside
            collaborators, and SSO mapping status.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportTeamsCsv}
            className="btn btn-primary btn-sm gap-2"
          >
            Export Teams (CSV)
          </button>
          <button
            type="button"
            onClick={handleExportIdentitiesCsv}
            className="btn btn-outline btn-sm gap-2"
          >
            Export Identities (CSV)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-100 p-2 rounded-xl border border-base-300 shadow-xs">
        <button
          type="button"
          className={`tab ${activeSubTab === 'teams' ? 'tab-active' : ''}`}
          onClick={() => setActiveSubTab('teams')}
        >
          Teams & Repository Access ({teams.length})
        </button>
        <button
          type="button"
          className={`tab ${activeSubTab === 'identities' ? 'tab-active' : ''}`}
          onClick={() => setActiveSubTab('identities')}
        >
          Pseudonymized Identities ({identities.length})
        </button>
      </div>

      {/* Sub-Tab 1: Teams */}
      {activeSubTab === 'teams' && (
        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
          <table
            className="table table-sm table-zebra w-full"
            aria-label="Teams and permissions table"
          >
            <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
              <tr>
                <th scope="col">Team Name</th>
                <th scope="col">Organization</th>
                <th scope="col">Parent Team</th>
                <th scope="col">Members</th>
                <th scope="col">Repository Access Grants</th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8 text-base-content/60"
                  >
                    No teams found in this scope.
                  </td>
                </tr>
              ) : (
                teams.map((team) => (
                  <tr key={team.id} className="hover:bg-base-200/50">
                    <td className="font-bold text-sm text-base-content">
                      {team.name}
                      <div className="text-[10px] font-mono text-base-content/50">
                        {team.id}
                      </div>
                    </td>
                    <td className="text-xs text-base-content/70">
                      {resolveOrgName(bundle, team.organizationId)}
                    </td>
                    <td className="text-xs font-mono text-base-content/70">
                      {team.parentTeamId ?? 'None (Top Level)'}
                    </td>
                    <td className="text-xs font-semibold">
                      {formatCountMetric(team.membershipCount)}
                    </td>
                    <td>
                      {team.repositoryAccess.length === 0 ? (
                        <span className="text-xs text-base-content/50">
                          No direct repo grants
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {team.repositoryAccess.map((acc, idx) => (
                            <span
                              key={idx}
                              className="badge badge-sm badge-neutral font-mono text-xs"
                            >
                              {acc.repositoryId} (
                              <span className="text-primary font-bold">
                                {acc.permission}
                              </span>
                              )
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-Tab 2: Identities */}
      {activeSubTab === 'identities' && (
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
              <strong>PII Redaction Applied</strong>: In compliance with strict
              privacy standards, human identities are pseudonymized into
              deterministic tokens (e.g., <code>fictional-person-1</code>).
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-xs">
            <table
              className="table table-sm table-zebra w-full"
              aria-label="Identities and access table"
            >
              <thead className="bg-base-200/60 text-xs text-base-content/80 font-bold">
                <tr>
                  <th scope="col">Pseudonym</th>
                  <th scope="col">Organization</th>
                  <th scope="col">Membership Role</th>
                  <th scope="col">Outside Collaborator</th>
                  <th scope="col">SSO Status</th>
                </tr>
              </thead>
              <tbody>
                {identities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-8 text-base-content/60"
                    >
                      No identity records found in this scope.
                    </td>
                  </tr>
                ) : (
                  identities.map((user) => (
                    <tr key={user.id} className="hover:bg-base-200/50">
                      <td className="font-mono text-xs font-bold text-base-content">
                        {user.pseudonym}
                      </td>
                      <td className="text-xs text-base-content/70">
                        {resolveOrgName(bundle, user.organizationId)}
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm capitalize ${
                            user.membership === 'owner'
                              ? 'badge-warning font-semibold'
                              : 'badge-ghost'
                          }`}
                        >
                          {user.membership}
                        </span>
                      </td>
                      <td>
                        {user.outsideCollaborator === true ? (
                          <span className="badge badge-sm badge-error font-semibold">
                            Outside Collaborator
                          </span>
                        ) : user.outsideCollaborator === false ? (
                          <span className="badge badge-sm badge-ghost text-base-content/60">
                            Member
                          </span>
                        ) : (
                          <span className="badge badge-sm badge-outline">
                            Unknown
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm font-semibold capitalize ${
                            user.ssoStatus === 'linked'
                              ? 'badge-success'
                              : user.ssoStatus === 'unlinked'
                                ? 'badge-warning'
                                : 'badge-ghost'
                          }`}
                        >
                          {user.ssoStatus}
                        </span>
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
