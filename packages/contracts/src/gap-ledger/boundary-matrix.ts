import type { MigrationMechanism } from './types.js';

export interface BoundaryProfile {
  readonly id: string;
  readonly name: string;
  readonly mechanism: MigrationMechanism;
  readonly geiNativeSupport: 'full' | 'partial' | 'none';
  readonly droppedAttributes?: readonly string[];
  readonly rehydrationStrategy?: string;
  readonly thresholdLimits?: string;
}

/**
 * Authoritative boundary matrix mapping all GitHub platform resources to their
 * transfer mechanisms, GEI native behaviors, and API rehydration requirements.
 */
export const BOUNDARY_PROFILES: readonly BoundaryProfile[] = [
  {
    id: 'git-repository-source',
    name: 'Git Repository Source & Commit History',
    mechanism: 'gei_native',
    geiNativeSupport: 'full',
  },
  {
    id: 'pull-requests',
    name: 'Pull Requests & Review Comments',
    mechanism: 'gei_native',
    geiNativeSupport: 'full',
  },
  {
    id: 'issues-and-milestones',
    name: 'Issues, Labels & Milestones',
    mechanism: 'gei_native',
    geiNativeSupport: 'full',
  },
  {
    id: 'repository-wikis',
    name: 'Repository Wikis',
    mechanism: 'gei_native',
    geiNativeSupport: 'full',
  },
  {
    id: 'releases-standard',
    name: 'Releases & Assets (<10 GiB)',
    mechanism: 'gei_native',
    geiNativeSupport: 'full',
    thresholdLimits:
      'Total release asset size <= 10 GiB and repository metadata <= 40 GiB.',
  },
  {
    id: 'releases-oversized',
    name: 'Releases & Assets (>10 GiB)',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Release binary assets exceeding 10 GiB'],
    rehydrationStrategy: 'Chunked binary stream upload via REST API (DEC-010).',
    thresholdLimits:
      'Total release asset size > 10 GiB or repository metadata > 40 GiB.',
  },
  {
    id: 'git-lfs-objects',
    name: 'Git LFS Objects',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'LFS binary blobs (only pointer files migrated by GEI)',
    ],
    rehydrationStrategy:
      'Dual-remote mirror-and-push stream on persistent runner (DEC-011).',
  },
  {
    id: 'classic-branch-protections',
    name: 'Classic Branch Protections',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: [
      'bypass_pull_request_allowances',
      'require_last_push_approval',
      'required_deployments_enforcement_level',
      'lock_branch',
      'block_creations',
      'restrictions.users (force push user restrictions)',
      'dismissal_restrictions (review dismissal exemptions)',
    ],
    rehydrationStrategy:
      'In-place PUT reconciliation restoring the 7 dropped rules (DEC-009).',
  },
  {
    id: 'repository-rulesets',
    name: 'Repository Rulesets',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Branch and tag rulesets, bypass lists, condition targets',
    ],
    rehydrationStrategy:
      'Full extraction from source and REST API recreation at target.',
  },
  {
    id: 'organization-rulesets',
    name: 'Organization-Level Rulesets',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Org-wide rulesets, bypass lists, condition targets'],
    rehydrationStrategy:
      'Full extraction from source and REST API recreation at target.',
  },
  {
    id: 'repository-variables',
    name: 'Repository Actions Variables',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Actions variables'],
    rehydrationStrategy: 'Recreate repository variables via REST API.',
  },
  {
    id: 'organization-variables',
    name: 'Organization Actions Variables',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Organization-level variables and repository access allowlists',
    ],
    rehydrationStrategy:
      'Recreate org variables and repository access via REST API.',
  },
  {
    id: 'repository-secrets',
    name: 'Repository Actions Secrets',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Actions secrets'],
    rehydrationStrategy:
      'Create libsodium sealed empty placeholders ("") or vault hooks (DEC-004).',
  },
  {
    id: 'organization-secrets',
    name: 'Organization Actions Secrets',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Organization-level secrets and repository access allowlists',
    ],
    rehydrationStrategy:
      'Create libsodium sealed empty placeholders ("") or vault hooks (DEC-004).',
  },
  {
    id: 'environments',
    name: 'Deployment Environments & Secrets',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Environments, environment protection rules, secrets, variables',
    ],
    rehydrationStrategy:
      'Recreate environments, protection policies, variables, and sealed secrets.',
  },
  {
    id: 'repository-webhooks',
    name: 'Repository Webhooks',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: [
      'Active state (migrated disabled)',
      'Webhook secret tokens',
    ],
    rehydrationStrategy:
      'Match target URL, assign secret from vault/env, and PATCH active: true (DEC-014).',
  },
  {
    id: 'organization-webhooks',
    name: 'Organization Webhooks',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: [
      'Active state (migrated disabled)',
      'Webhook secret tokens',
    ],
    rehydrationStrategy:
      'Match target URL, assign secret from vault/env, and PATCH active: true.',
  },
  {
    id: 'repository-settings',
    name: 'Repository Settings & Merge Options',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: ['Repository visibility defaults to private'],
    rehydrationStrategy:
      'Reconcile settings and restore internal/public visibility per policy (DEC-015).',
  },
  {
    id: 'organization-settings',
    name: 'Organization Settings & Member Privileges',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Base permissions, repo creation limits, private forking policy, commit signoff',
    ],
    rehydrationStrategy:
      'Extract source settings and update target organization via REST API.',
  },
  {
    id: 'teams-and-hierarchies',
    name: 'Teams, Hierarchies & Repository Permissions',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: [
      'Teams (dropped during repo migrations)',
      'User memberships',
    ],
    rehydrationStrategy:
      'Recreate team slugs, parent-child DAG, and repository permissions (DEC-005).',
  },
  {
    id: 'custom-repository-roles',
    name: 'Custom Repository Roles',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Organization custom roles and granular permission sets',
    ],
    rehydrationStrategy:
      'Recreate custom repository roles and base permissions via REST API.',
  },
  {
    id: 'custom-properties-definitions',
    name: 'Organization Custom Property Definitions',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Custom property schema, allowed values, default values',
    ],
    rehydrationStrategy: 'Recreate custom property definitions via REST API.',
  },
  {
    id: 'custom-properties-values',
    name: 'Repository Custom Property Values',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Assigned repository property values'],
    rehydrationStrategy: 'Assign custom property values via REST API.',
  },
  {
    id: 'deploy-keys',
    name: 'Repository Deploy Keys',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Deploy keys (public keys)'],
    rehydrationStrategy: 'Recreate public deploy keys via REST API.',
  },
  {
    id: 'collaborators-and-access',
    name: 'Collaborators & Direct Repository Access',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Direct collaborator permissions'],
    rehydrationStrategy:
      'Re-add outside collaborators or team access conforming to EMU guest policy.',
  },
  {
    id: 'codeowners-file',
    name: 'CODEOWNERS File & Ownership',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: [
      'Team and user mention alignment for renamed EMU entities',
    ],
    rehydrationStrategy:
      'Regex repair on CODEOWNERS files to point to provisioned EMU accounts/teams.',
  },
  {
    id: 'ghas-security-settings',
    name: 'GitHub Advanced Security (GHAS) Settings',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Code scanning, secret scanning, Dependabot alerts/updates enablement',
    ],
    rehydrationStrategy: 'Enable GHAS features via REST API post-GEI.',
  },
  {
    id: 'packages-registry',
    name: 'GitHub Packages (Container / npm / Maven / NuGet)',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Package versions and container images'],
    rehydrationStrategy:
      'Stream package artifacts from source registry and republish to target registry.',
  },
  {
    id: 'mannequins-reattribution',
    name: 'Mannequin Reattribution',
    mechanism: 'graphql_mutation',
    geiNativeSupport: 'partial',
    droppedAttributes: ['Automatic user identity association'],
    rehydrationStrategy:
      'Reclaim mannequins with --skip-invitation via GraphQL in GHEC-EMU (DEC-013).',
  },
  {
    id: 'actions-policies',
    name: 'Actions Policies & Allowed Actions Allowlist',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Allowed actions allowlist, fork PR run policies, GITHUB_TOKEN permissions',
    ],
    rehydrationStrategy:
      'Replicate Actions permissions via PUT /orgs/{org}/actions/permissions.',
  },
  {
    id: 'actions-runner-groups',
    name: 'Actions Self-Hosted Runner Groups',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Runner groups, repository access allowlists, workflow restrictions',
    ],
    rehydrationStrategy:
      'Recreate runner groups via REST API; provide advisory for daemon registrations.',
  },
  {
    id: 'autolink-references',
    name: 'Autolink References',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: [
      'Autolink references (dropped across GHES-to-GHEC or third-party sources)',
    ],
    rehydrationStrategy:
      'Recreate autolink references via POST /repos/{owner}/{repo}/autolinks.',
  },
  {
    id: 'discussions',
    name: 'Repository Discussions',
    mechanism: 'graphql_mutation',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Discussion categories, discussions, comments, answers',
    ],
    rehydrationStrategy:
      'Reconstruct categories and discussions via GraphQL mutations.',
  },
  {
    id: 'projects-v2',
    name: 'Projects v2 (Memex)',
    mechanism: 'graphql_mutation',
    geiNativeSupport: 'none',
    droppedAttributes: ['Projects v2 boards, custom fields, views, item links'],
    rehydrationStrategy:
      'Reconstruct Projects v2 boards, fields, views, and items via GraphQL mutations.',
  },
  {
    id: 'ip-allow-lists',
    name: 'IP Allow Lists / CIDR Restrictions',
    mechanism: 'graphql_mutation',
    geiNativeSupport: 'none',
    droppedAttributes: ['IP allow list entries and active enforcement flags'],
    rehydrationStrategy:
      'Recreate IP allow list entries via GraphQL mutations.',
  },
  {
    id: 'apps-and-integrations',
    name: 'GitHub Apps & Integrations',
    mechanism: 'manual_advisory',
    geiNativeSupport: 'none',
    droppedAttributes: ['App installations, authorization tokens, webhooks'],
    rehydrationStrategy:
      'Audit installations at source and provide operator checklist for target reinstallation.',
  },
  {
    id: 'audit-logs',
    name: 'Historical Audit Logs',
    mechanism: 'manual_advisory',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Historical audit logs (cannot be backfilled into destination cloud log)',
    ],
    rehydrationStrategy:
      'Export source audit logs to SIEM / cold storage archive for compliance.',
  },
  {
    id: 'user-pats-and-keys',
    name: 'User Personal Access Tokens & SSH Keys',
    mechanism: 'manual_advisory',
    geiNativeSupport: 'none',
    droppedAttributes: ['User SSH keys, GPG signing keys, PATs'],
    rehydrationStrategy:
      'Instruct EMU users to generate new PATs/keys in destination identity tenant.',
  },
  {
    id: 'repository-topics',
    name: 'Repository Topics',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'partial',
    droppedAttributes: ['Topics across some GHES/third-party migration paths'],
    rehydrationStrategy:
      'Ensure topics synchronization via PUT /repos/{owner}/{repo}/topics.',
  },
  {
    id: 'repository-interaction-limits',
    name: 'Repository Interaction Limits',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: ['Temporary interaction limit blocks'],
    rehydrationStrategy:
      'Recreate interaction limits via REST API where active.',
  },
  {
    id: 'organization-announcements',
    name: 'Organization Announcement Banner',
    mechanism: 'rest_rehydration',
    geiNativeSupport: 'none',
    droppedAttributes: [
      'Announcement banner text, expiration, user dismissability',
    ],
    rehydrationStrategy: 'Recreate announcement banner via REST API.',
  },
  {
    id: 'verified-domains',
    name: 'Verified & Approved Domains',
    mechanism: 'manual_advisory',
    geiNativeSupport: 'none',
    droppedAttributes: ['Domain verification records'],
    rehydrationStrategy:
      'Provide DNS TXT verification token instructions for target organization.',
  },
];

export function getBoundaryProfile(id: string): BoundaryProfile | undefined {
  return BOUNDARY_PROFILES.find((p) => p.id === id);
}

export function getAllBoundaryProfiles(): readonly BoundaryProfile[] {
  return BOUNDARY_PROFILES;
}

export function isGeiNativeSupported(id: string): boolean {
  const profile = getBoundaryProfile(id);
  return (
    profile?.geiNativeSupport === 'full' ||
    profile?.geiNativeSupport === 'partial'
  );
}

export function requiresApiRehydration(id: string): boolean {
  const profile = getBoundaryProfile(id);
  return (
    profile?.mechanism === 'rest_rehydration' ||
    profile?.mechanism === 'graphql_mutation'
  );
}
