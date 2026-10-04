import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, Flash, Label, UnderlineNav } from '@primer/react';
import { DownloadIcon, InfoIcon } from '@primer/octicons-react';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bgColor-default)] p-6 rounded-lg border border-[var(--borderColor-default)] shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[var(--fgColor-default)]">
            Teams, Access & Pseudonymized Identities
          </h2>
          <p className="text-sm text-[var(--fgColor-muted)] mt-1">
            Review team structures, repository permissions, outside
            collaborators, and SSO mapping status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={handleExportTeamsCsv}
          >
            Export Teams (CSV)
          </Button>
          <Button
            variant="default"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={handleExportIdentitiesCsv}
          >
            Export Identities (CSV)
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <UnderlineNav aria-label="Teams and identities subviews">
        <UnderlineNav.Item
          as="button"
          aria-current={activeSubTab === 'teams' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setActiveSubTab('teams');
          }}
          className="cursor-pointer"
        >
          Teams & Repository Access ({teams.length})
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={activeSubTab === 'identities' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setActiveSubTab('identities');
          }}
          className="cursor-pointer"
        >
          Pseudonymized Identities ({identities.length})
        </UnderlineNav.Item>
      </UnderlineNav>

      {/* Sub-Tab 1: Teams */}
      {activeSubTab === 'teams' && (
        <div
          tabIndex={0}
          role="region"
          aria-label="Teams and permissions table container"
          className="overflow-x-auto rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] shadow-xs"
        >
          <table
            className="w-full text-left border-collapse text-sm"
            aria-label="Teams and permissions table"
          >
            <thead className="bg-[var(--bgColor-muted)] text-xs text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Team Name
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Organization
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Parent Team
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Members
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Repository Access Grants
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-8 text-[var(--fgColor-muted)] px-3 py-2.5"
                  >
                    No teams found in this scope.
                  </td>
                </tr>
              ) : (
                teams.map((team) => (
                  <tr
                    key={team.id}
                    className="border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)]/50 odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                  >
                    <td className="font-bold text-sm text-[var(--fgColor-default)] px-3 py-2.5">
                      {team.name}
                      <div className="text-[10px] font-mono text-[var(--fgColor-muted)]">
                        {team.id}
                      </div>
                    </td>
                    <td className="text-xs text-[var(--fgColor-muted)] px-3 py-2.5">
                      {resolveOrgName(bundle, team.organizationId)}
                    </td>
                    <td className="text-xs font-mono text-[var(--fgColor-muted)] px-3 py-2.5">
                      {team.parentTeamId ?? 'None (Top Level)'}
                    </td>
                    <td className="text-xs font-semibold text-[var(--fgColor-default)] px-3 py-2.5">
                      {formatCountMetric(team.membershipCount)}
                    </td>
                    <td className="px-3 py-2.5">
                      {team.repositoryAccess.length === 0 ? (
                        <span className="text-xs text-[var(--fgColor-muted)]">
                          No direct repo grants
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {team.repositoryAccess.map((acc, idx) => (
                            <Label
                              key={idx}
                              variant="secondary"
                              size="small"
                              className="font-mono text-xs"
                            >
                              {acc.repositoryId} (
                              <span className="text-[var(--fgColor-accent)] font-bold">
                                {acc.permission}
                              </span>
                              )
                            </Label>
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
          <Flash variant="default" className="text-xs shadow-xs">
            <span className="flex items-center gap-2">
              <InfoIcon className="h-4 w-4 shrink-0" />
              <span>
                <strong>PII Redaction Applied</strong>: In compliance with
                strict privacy standards, human identities are pseudonymized
                into deterministic tokens (e.g., <code>fictional-person-1</code>
                ).
              </span>
            </span>
          </Flash>

          <div
            tabIndex={0}
            role="region"
            aria-label="Identities and access table container"
            className="overflow-x-auto rounded-lg border border-[var(--borderColor-default)] bg-[var(--bgColor-default)] shadow-xs"
          >
            <table
              className="w-full text-left border-collapse text-sm"
              aria-label="Identities and access table"
            >
              <thead className="bg-[var(--bgColor-muted)] text-xs text-[var(--fgColor-muted)] font-bold border-b border-[var(--borderColor-default)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5">
                    Pseudonym
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Organization
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Membership Role
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Outside Collaborator
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    SSO Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {identities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-8 text-[var(--fgColor-muted)] px-3 py-2.5"
                    >
                      No identity records found in this scope.
                    </td>
                  </tr>
                ) : (
                  identities.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[var(--borderColor-muted)] hover:bg-[var(--bgColor-muted)]/50 odd:bg-[var(--bgColor-default)] even:bg-[var(--bgColor-muted)]/20"
                    >
                      <td className="font-mono text-xs font-bold text-[var(--fgColor-default)] px-3 py-2.5">
                        {user.pseudonym}
                      </td>
                      <td className="text-xs text-[var(--fgColor-muted)] px-3 py-2.5">
                        {resolveOrgName(bundle, user.organizationId)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Label
                          variant={
                            user.membership === 'owner'
                              ? 'attention'
                              : 'secondary'
                          }
                          size="small"
                          className="capitalize"
                        >
                          {user.membership}
                        </Label>
                      </td>
                      <td className="px-3 py-2.5">
                        <Label
                          variant={
                            user.outsideCollaborator === true
                              ? 'danger'
                              : user.outsideCollaborator === false
                                ? 'secondary'
                                : 'default'
                          }
                          size="small"
                        >
                          {user.outsideCollaborator === null
                            ? 'Unknown'
                            : user.outsideCollaborator
                              ? 'Outside Collaborator'
                              : 'Member'}
                        </Label>
                      </td>
                      <td className="px-3 py-2.5">
                        <Label
                          variant={
                            user.ssoStatus === 'linked'
                              ? 'success'
                              : user.ssoStatus === 'unlinked'
                                ? 'attention'
                                : 'secondary'
                          }
                          size="small"
                          className="capitalize"
                        >
                          {user.ssoStatus}
                        </Label>
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
