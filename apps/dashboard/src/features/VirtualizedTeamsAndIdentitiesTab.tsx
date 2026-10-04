import React, { useMemo, useState } from 'react';
import type { DiscoveryBundle } from '@ghec/contracts';
import { Button, Flash, Label, UnderlineNav } from '@primer/react';
import { DownloadIcon, InfoIcon } from '@primer/octicons-react';
import {
  VirtualizedTable,
  type VirtualizedColumn,
} from '../components/VirtualizedTable.js';
import { formatCountMetric, resolveOrgName } from '../lib/formatters.js';
import {
  generateTeamsAndPermissionsCsv,
  generateIdentitiesCsv,
  downloadCsv,
} from '../lib/export-csv.js';
import { PageHeader } from '../components/ui/index.js';

interface Props {
  bundle: DiscoveryBundle;
  selectedOrgIds: readonly string[];
}
type Team = Extract<DiscoveryBundle['entities'][number], { kind: 'team' }>;
type Identity = Extract<
  DiscoveryBundle['entities'][number],
  { kind: 'identity' }
>;

export const VirtualizedTeamsAndIdentitiesTab: React.FC<Props> = ({
  bundle,
  selectedOrgIds,
}) => {
  const [tab, setTab] = useState<'teams' | 'identities'>('teams');
  const teams = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Team =>
          entity.kind === 'team' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const identities = useMemo(
    () =>
      bundle.entities.filter(
        (entity): entity is Identity =>
          entity.kind === 'identity' &&
          (selectedOrgIds.length === 0 ||
            selectedOrgIds.includes(entity.organizationId)),
      ),
    [bundle, selectedOrgIds],
  );
  const teamColumns = useMemo<readonly VirtualizedColumn<Team>[]>(
    () => [
      {
        header: 'Team Name',
        width: '1.2fr',
        cell: (team) => (
          <>
            <div className="font-bold text-sm text-[var(--fgColor-default)]">
              {team.name}
            </div>
            <div className="text-[10px] font-mono text-[var(--fgColor-muted)]">
              {team.id}
            </div>
          </>
        ),
      },
      {
        header: 'Organization',
        cell: (team) => (
          <span className="text-xs text-[var(--fgColor-muted)]">
            {resolveOrgName(bundle, team.organizationId)}
          </span>
        ),
      },
      {
        header: 'Parent Team',
        width: '1.2fr',
        className: 'text-xs font-mono text-[var(--fgColor-muted)]',
        cell: (team) => team.parentTeamId ?? 'None (Top Level)',
      },
      {
        header: 'Members',
        width: '0.7fr',
        className: 'text-xs font-semibold text-[var(--fgColor-default)]',
        cell: (team) => formatCountMetric(team.membershipCount),
      },
      {
        header: 'Repository Access Grants',
        width: '2fr',
        cell: (team) =>
          team.repositoryAccess.length ? (
            <div className="flex flex-wrap gap-1">
              {team.repositoryAccess.map((access) => (
                <Label
                  key={`${access.repositoryId}:${access.permission}`}
                  variant="secondary"
                  size="small"
                  className="font-mono"
                >
                  {access.repositoryId} ({access.permission})
                </Label>
              ))}
            </div>
          ) : (
            <span className="text-xs text-[var(--fgColor-muted)]">
              No direct repo grants
            </span>
          ),
      },
    ],
    [bundle],
  );
  const identityColumns = useMemo<readonly VirtualizedColumn<Identity>[]>(
    () => [
      {
        header: 'Pseudonym',
        width: '1.2fr',
        className: 'font-mono text-xs font-bold text-[var(--fgColor-default)]',
        cell: (identity) => identity.pseudonym,
      },
      {
        header: 'Organization',
        cell: (identity) => (
          <span className="text-xs text-[var(--fgColor-muted)]">
            {resolveOrgName(bundle, identity.organizationId)}
          </span>
        ),
      },
      {
        header: 'Membership Role',
        cell: (identity) => (
          <Label
            variant={
              identity.membership === 'owner' ? 'attention' : 'secondary'
            }
            size="small"
            className="capitalize"
          >
            {identity.membership}
          </Label>
        ),
      },
      {
        header: 'Outside Collaborator',
        width: '1.2fr',
        cell: (identity) => (
          <Label
            variant={
              identity.outsideCollaborator === true
                ? 'danger'
                : identity.outsideCollaborator === false
                  ? 'secondary'
                  : 'default'
            }
            size="small"
          >
            {identity.outsideCollaborator === null
              ? 'Unknown'
              : identity.outsideCollaborator
                ? 'Outside Collaborator'
                : 'Member'}
          </Label>
        ),
      },
      {
        header: 'SSO Status',
        cell: (identity) => (
          <Label
            variant={
              identity.ssoStatus === 'linked'
                ? 'success'
                : identity.ssoStatus === 'unlinked'
                  ? 'attention'
                  : 'secondary'
            }
            size="small"
            className="capitalize"
          >
            {identity.ssoStatus}
          </Label>
        ),
      },
    ],
    [bundle],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams, Access & Pseudonymized Identities"
        description="Review team structures, repository permissions, outside collaborators, and SSO mapping status."
        primaryAction={
          <Button
            variant="primary"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `teams-and-permissions-${bundle.scan.id}.csv`,
                generateTeamsAndPermissionsCsv(
                  bundle,
                  selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
                ),
              )
            }
          >
            Export Teams (CSV)
          </Button>
        }
        secondaryActions={
          <Button
            variant="default"
            size="small"
            leadingVisual={DownloadIcon}
            onClick={() =>
              downloadCsv(
                `identities-and-access-${bundle.scan.id}.csv`,
                generateIdentitiesCsv(
                  bundle,
                  selectedOrgIds.length === 1 ? selectedOrgIds[0] : undefined,
                ),
              )
            }
          >
            Export Identities (CSV)
          </Button>
        }
      />
      <UnderlineNav aria-label="Teams and identities views">
        <UnderlineNav.Item
          as="button"
          aria-current={tab === 'teams' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setTab('teams');
          }}
          className="cursor-pointer"
        >
          Teams & Repository Access ({teams.length})
        </UnderlineNav.Item>
        <UnderlineNav.Item
          as="button"
          aria-current={tab === 'identities' ? 'page' : 'false'}
          onSelect={(e) => {
            e.preventDefault();
            setTab('identities');
          }}
          className="cursor-pointer"
        >
          Pseudonymized Identities ({identities.length})
        </UnderlineNav.Item>
      </UnderlineNav>
      {tab === 'teams' ? (
        <VirtualizedTable
          ariaLabel="Teams and permissions table"
          rows={teams}
          columns={teamColumns}
          getRowKey={(row) => row.id}
          emptyMessage="No teams found in this scope."
          estimateRowHeight={68}
          minWidth={900}
        />
      ) : (
        <div className="space-y-4">
          <Flash variant="default" className="text-xs">
            <span className="flex items-center gap-2">
              <InfoIcon className="h-4 w-4 shrink-0" />
              <span>
                <strong>PII Redaction Applied:</strong> Human identities are
                represented by deterministic pseudonyms.
              </span>
            </span>
          </Flash>
          <VirtualizedTable
            ariaLabel="Identities and access table"
            rows={identities}
            columns={identityColumns}
            getRowKey={(row) => row.id}
            emptyMessage="No identity records found in this scope."
            minWidth={800}
          />
        </div>
      )}
    </div>
  );
};
