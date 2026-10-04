import { sanitizeCsvCell } from '../../advisory/apps-matrix.js';
import type { TeamDefinition } from './types.js';

/**
 * Generates an IdP Group Sync Blueprint CSV for directory administrators
 * configuring SCIM / SAML group sync in GHEC-EMU.
 */
export function exportIdpGroupSyncBlueprint(
  teams: readonly TeamDefinition[],
  targetOrg: string,
): string {
  const headers = [
    'Team Slug',
    'Team Name',
    'Parent Team Slug',
    'Privacy',
    'Member Count',
    'Recommended IdP Group Name',
    'Recommended SCIM Display Name',
    'Repository Permissions',
  ];

  const rows = teams.map((team) => {
    const recommendedIdpGroupName = `gh-${targetOrg}-${team.slug}`;
    const recommendedScimDisplayName = `GitHub ${targetOrg} - ${team.name}`;
    const permissionsSummary = team.repositoryAccess
      .map((access) => `${access.repositoryName}:${access.permission}`)
      .join('; ');

    return [
      sanitizeCsvCell(team.slug),
      sanitizeCsvCell(team.name),
      sanitizeCsvCell(team.parentSlug ?? ''),
      sanitizeCsvCell(team.privacy),
      sanitizeCsvCell(team.membershipCount),
      sanitizeCsvCell(recommendedIdpGroupName),
      sanitizeCsvCell(recommendedScimDisplayName),
      sanitizeCsvCell(permissionsSummary),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
