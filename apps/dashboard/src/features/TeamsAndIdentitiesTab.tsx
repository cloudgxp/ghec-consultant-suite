import React, { useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, Flash, Label, UnderlineNav } from '@primer/react';
import {
  DownloadIcon,
  InfoIcon,
  PeopleIcon,
  PersonIcon,
  SyncIcon,
} from '@primer/octicons-react';
import { formatCountMetric, resolveOrgName } from '../lib/formatters.js';
import {
  generateTeamsAndPermissionsCsv,
  generateIdentitiesCsv,
  downloadCsv,
} from '../lib/export-csv.js';
import { ModuleTriggerModal } from '../components/ModuleTriggerModal.js';
import { TeamTreeCanvas } from '../components/TeamTreeCanvas.js';
import {
  CollaboratorsReconciliationPanel,
  type CollaboratorEntityItem,
} from '../components/CollaboratorsReconciliationPanel.js';
import {
  EmuIdentityMappingCard,
  type EmuIdentityItem,
} from '../components/EmuIdentityMappingCard.js';
import type { RawTeamEntity } from '../lib/team-tree.js';

interface TeamsAndIdentitiesTabProps {
  bundle: DiscoveryBundle;
  selectedOrgId: string;
}

export type TeamsSubTab =
  'tree' | 'collaborators' | 'emu' | 'teams' | 'identities';

export const TeamsAndIdentitiesTab: React.FC<TeamsAndIdentitiesTabProps> = ({
  bundle,
  selectedOrgId,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TeamsSubTab>('tree');

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

  const rawTeams: RawTeamEntity[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    parentTeamId: t.parentTeamId,
    membershipCount: t.membershipCount,
    repositoryAccess: t.repositoryAccess,
  }));

  const outsideCollaboratorsList: CollaboratorEntityItem[] = identities
    .filter((i) => i.outsideCollaborator === true || i.membership === 'outside')
    .map((i) => ({
      id: i.id,
      pseudonym: i.pseudonym,
      outsideCollaborator: i.outsideCollaborator,
      ssoStatus: i.ssoStatus,
      membership: i.membership,
    }));

  const emuIdentitiesList: EmuIdentityItem[] = identities.map((i) => ({
    id: i.id,
    sourceLogin: i.pseudonym,
    membership: i.membership,
    outsideCollaborator: Boolean(i.outsideCollaborator),
    ssoStatus: i.ssoStatus,
    mannequinStatus: i.ssoStatus === 'linked' ? 'claimed' : 'pending',
  }));

  const [activeTrigger, setActiveTrigger] = useState<{
    title: string;
    description: string;
    modules: string[];
    affectedCount?: number;
    entityLabel?: string;
    prerequisites?: string[];
    customOptions?: React.ReactNode;
  } | null>(null);
  const [dispatchedRun, setDispatchedRun] = useState<{
    workflowId: string;
    modules: string[];
    isDryRun: boolean;
  } | null>(null);

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

  const outsideCollaboratorsCount = identities.filter(
    (i) => i.outsideCollaborator === true || i.membership === 'outside',
  ).length;

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

      {/* 1-Click Module Migration Triggers */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--canvas-subtle)] border border-[var(--borderColor-default)] rounded-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--fgColor-default)] uppercase tracking-wide mr-1">
            Module Actions:
          </span>
          <Button
            size="small"
            leadingVisual={PeopleIcon}
            onClick={() =>
              setActiveTrigger({
                title: 'Sync Teams & Hierarchy',
                description:
                  'Migrate team hierarchy, parent-child relationships, and repository permissions using topological sort.',
                modules: ['teams'],
                affectedCount: teams.length,
                entityLabel: 'teams',
                prerequisites: [
                  'Target organization created and accessible',
                  'Admin permissions on target organization',
                ],
              })
            }
          >
            Sync Teams & Hierarchy
          </Button>
          <Button
            size="small"
            leadingVisual={PersonIcon}
            onClick={() =>
              setActiveTrigger({
                title: 'Reconcile Outside Collaborators',
                description:
                  'Identify and re-invite direct outside repository collaborators with mapped permission levels.',
                modules: ['collaborators'],
                affectedCount: outsideCollaboratorsCount,
                entityLabel: 'outside collaborators',
                prerequisites: [
                  'Target repositories created',
                  'Target invitation policies allow outside collaborators',
                ],
              })
            }
          >
            Reconcile Outside Collaborators
          </Button>
          <Button
            size="small"
            leadingVisual={SyncIcon}
            onClick={() =>
              setActiveTrigger({
                title: 'Reclaim EMU Mannequins',
                description:
                  'Map unlinked GEI mannequins to target enterprise SAML EMU identities and reclaim commit attributions with --skip-invitation.',
                modules: ['mannequins'],
                affectedCount: identities.length,
                entityLabel: 'identities',
                prerequisites: [
                  'GEI repository migration completed',
                  'Target enterprise EMU SAML accounts provisioned',
                ],
                customOptions: (
                  <p className="text-xs text-[var(--fgColor-muted)]">
                    In Enterprise Managed Users (EMU) environments, contributor
                    reclamation automatically applies{' '}
                    <code>--skip-invitation</code> to reclaim attributions
                    directly without sending emails.
                  </p>
                ),
              })
            }
          >
            Reclaim EMU Mannequins
          </Button>
        </div>
      </div>

      {dispatchedRun && (
        <Flash variant="success">
          <div className="flex items-center justify-between text-xs">
            <span>
              Dispatched <strong>{dispatchedRun.modules.join(', ')}</strong> (
              {dispatchedRun.isDryRun ? 'Dry-Run Simulation' : 'Live Apply'}) to
              workflow <code>{dispatchedRun.workflowId}</code>.
            </span>
            <Button size="small" onClick={() => setDispatchedRun(null)}>
              Dismiss
            </Button>
          </div>
        </Flash>
      )}

      {/* Tabs */}
      <UnderlineNav aria-label="Teams and identities subviews">
        <UnderlineNav.Item
          as="button"
          aria-current={activeSubTab === 'tree' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setActiveSubTab('tree');
          }}
          className="cursor-pointer"
        >
          Hierarchy Tree Canvas
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={activeSubTab === 'collaborators' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setActiveSubTab('collaborators');
          }}
          className="cursor-pointer"
        >
          Outside Collaborators ({outsideCollaboratorsList.length})
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={activeSubTab === 'emu' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setActiveSubTab('emu');
          }}
          className="cursor-pointer"
        >
          EMU SAML Mapping ({identities.length})
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={activeSubTab === 'teams' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setActiveSubTab('teams');
          }}
          className="cursor-pointer"
        >
          Teams Directory ({teams.length})
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
          Identities Table ({identities.length})
        </UnderlineNav.Item>
      </UnderlineNav>

      {/* Sub-Tab 1: Tree Canvas */}
      {activeSubTab === 'tree' && <TeamTreeCanvas teams={rawTeams} />}

      {/* Sub-Tab 2: Outside Collaborators */}
      {activeSubTab === 'collaborators' && (
        <CollaboratorsReconciliationPanel
          collaborators={outsideCollaboratorsList}
          onTriggerReconciliation={() =>
            setActiveTrigger({
              title: 'Reconcile Outside Collaborators',
              description:
                'Discover outside collaborators, verify organization invite status, and align destination repository direct permission grants.',
              modules: ['collaborators'],
              affectedCount: outsideCollaboratorsList.length,
              entityLabel: 'outside collaborators',
              prerequisites: [
                'Ensure target organization allows outside collaborator repository access',
                'Verify user emails exist in target enterprise SAML directory',
              ],
            })
          }
        />
      )}

      {/* Sub-Tab 3: EMU SAML Mapping */}
      {activeSubTab === 'emu' && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg border border-[var(--borderColor-default)] bg-[var(--canvas-subtle)] flex items-center justify-between text-xs text-[var(--fgColor-muted)]">
            <span>
              Enterprise Managed Users (EMU) identity flow. Suffix rule{' '}
              <code>_gxp</code> applied to all mapped logins.
            </span>
            <span className="font-mono">
              {emuIdentitiesList.length} total identities
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {emuIdentitiesList.map((idItem) => (
              <EmuIdentityMappingCard key={idItem.id} identity={idItem} />
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Teams Directory */}
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
      {activeTrigger && (
        <ModuleTriggerModal
          isOpen={true}
          onClose={() => setActiveTrigger(null)}
          title={activeTrigger.title}
          description={activeTrigger.description}
          modules={activeTrigger.modules}
          sourceOrg={
            selectedOrgId
              ? resolveOrgName(bundle, selectedOrgId)
              : bundle.organizations[0]?.login || 'source-org'
          }
          affectedCount={activeTrigger.affectedCount}
          entityLabel={activeTrigger.entityLabel}
          prerequisites={activeTrigger.prerequisites}
          customOptions={activeTrigger.customOptions}
          onDispatched={(res) => {
            setDispatchedRun(res);
            setActiveTrigger(null);
          }}
        />
      )}
    </div>
  );
};
