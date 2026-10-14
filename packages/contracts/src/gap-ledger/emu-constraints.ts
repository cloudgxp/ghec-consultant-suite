import type { EmuGovernanceConstraint } from './types.js';

export const EMU_SCIM_IDENTITY_CONSTRAINT: EmuGovernanceConstraint = {
  type: 'scim_identity',
  description:
    'Direct user invitations (POST /orgs/{org}/invitations) and member additions are prohibited in EMU; accounts must be provisioned via SCIM.',
  mitigation:
    'Pre-provision enterprise identities via IdP SCIM integration prior to initiating repository migration waves.',
};

export const EMU_IDP_GROUP_SYNC_CONSTRAINT: EmuGovernanceConstraint = {
  type: 'saml_sso',
  description:
    'Team membership in EMU is synced from IdP groups; direct API assignment of members to teams is disallowed or overridden.',
  mitigation:
    'Decouple team structure migration from user membership; map IdP groups to migrated team slugs post-cutover (DEC-005).',
};

export const EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT: EmuGovernanceConstraint = {
  type: 'mannequin_mapping',
  description:
    'GEI assigns unmapped authors to mannequins; invitation-based reclamation emails are not supported for managed accounts.',
  mitigation:
    'Reclaim mannequins with --skip-invitation via GraphQL mutation directly attributing activity to EMU accounts (DEC-013).',
};

export const EMU_VISIBILITY_POLICY_CONSTRAINT: EmuGovernanceConstraint = {
  type: 'visibility_policy',
  description:
    'EMU enterprise policy prohibits public repositories. GEI creates repositories as private by default.',
  mitigation:
    'Constrain post-migration visibility reconciliation to internal or private; never attempt to promote to public without enterprise policy waiver (DEC-015).',
};

export const EMU_OUTSIDE_COLLABORATOR_CONSTRAINT: EmuGovernanceConstraint = {
  type: 'outside_collaborator',
  description:
    'Outside collaborators cannot use standard personal GitHub accounts in an EMU enterprise.',
  mitigation:
    'Convert external contributors to enterprise guest EMU accounts or grant access through IdP-managed groups.',
};

export const EMU_RUNNER_NETWORK_CONSTRAINT: EmuGovernanceConstraint = {
  type: 'runner_network',
  description:
    'Enterprise policies often restrict GitHub Actions runners to private network subnets or require Azure Private Networking.',
  mitigation:
    'Configure self-hosted runner groups with designated VNet routing and persistent disk storage (DEC-007).',
};
