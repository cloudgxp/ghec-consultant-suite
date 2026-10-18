import type { CapabilityGapEntry } from './types.js';
import {
  EMU_SCIM_IDENTITY_CONSTRAINT,
  EMU_IDP_GROUP_SYNC_CONSTRAINT,
  EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT,
  EMU_VISIBILITY_POLICY_CONSTRAINT,
  EMU_OUTSIDE_COLLABORATOR_CONSTRAINT,
  EMU_RUNNER_NETWORK_CONSTRAINT,
} from './emu-constraints.js';

export const GAP_LEDGER_CATALOG: readonly CapabilityGapEntry[] = [
  // 1. Git Repository Source
  {
    id: 'git-repo-source',
    name: 'Git Repository Source & Commit Graph',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'gei_native',
    status: 'implemented',
    existingModuleId: 'gei-repo',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'GEI transfers complete commit graph, refs, tags, and commit trees natively.',
  },
  // 2. Pull Requests
  {
    id: 'pull-requests',
    name: 'Pull Requests & Review History',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'gei_native',
    status: 'implemented',
    existingModuleId: 'pull-requests',
    secretHandling: 'none',
    emuConstraints: [EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT],
    notes:
      'GEI migrates PR bodies and reviews; module reconciles mentions and reviewers.',
  },
  // 3. Issues & Milestones
  {
    id: 'issues-and-milestones',
    name: 'Issues, Labels & Milestones',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'gei_native',
    status: 'implemented',
    existingModuleId: 'issues',
    secretHandling: 'none',
    emuConstraints: [EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT],
    notes: 'GEI transfers issue bodies, comments, and milestones natively.',
  },
  // 4. Repository Wikis
  {
    id: 'repository-wikis',
    name: 'Repository Wikis',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'gei_native',
    status: 'implemented',
    existingModuleId: 'gei-repo',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Wiki Git repositories are migrated natively by GEI without attachments.',
  },
  // 5. Standard Releases
  {
    id: 'releases-standard',
    name: 'Standard Releases (<10 GiB)',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'gei_native',
    status: 'implemented',
    existingModuleId: 'gei-repo',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'GEI transfers release metadata and binary assets under 10 GiB.',
  },
  // 6. Oversized Releases
  {
    id: 'releases-oversized',
    name: 'Oversized Releases (>10 GiB)',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'releases',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'Preflight skips releases in GEI; module streams assets in chunks.',
  },
  // 7. Git LFS Objects
  {
    id: 'git-lfs',
    name: 'Git Large File Storage (LFS)',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-git-lfs-objects-in-archives-of-your-repository.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'lfs',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Transfers LFS objects via streamed dual-remote push on persistent runners.',
  },
  // 8. Classic Branch Protections
  {
    id: 'branch-protection',
    name: 'Classic Branch Protections & Dropped Rules',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'branch-protection',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Reconciles the 7 specific settings dropped by GEI via in-place PUT.',
  },
  // 9. Repository Rulesets
  {
    id: 'repo-rulesets',
    name: 'Repository Rulesets',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'rulesets',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'GEI drops rulesets; module reconstructs branch and tag rulesets via REST API.',
  },
  // 10. Organization Rulesets
  {
    id: 'org-rulesets',
    name: 'Organization-Level Rulesets',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'org-rulesets',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Reconstructs org-wide rulesets applying to repositories across the enterprise.',
  },
  // 11. Repository Variables
  {
    id: 'repo-variables',
    name: 'Repository Actions Variables',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/workflows-and-actions/variables.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'repo-variables',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'Reconstructs Actions repository variables via REST API.',
  },
  // 12. Organization Variables
  {
    id: 'org-variables',
    name: 'Organization Actions Variables',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/workflows-and-actions/variables.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'org-variables',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Reconstructs Actions organization variables and repo allowlists via REST API.',
  },
  // 13. Repository Secrets
  {
    id: 'repo-secrets',
    name: 'Repository Actions Secrets',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/security/secrets.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'repo-secrets',
    secretHandling: 'sealed_box_blank',
    emuConstraints: [],
    notes:
      'Provisions target secrets with sealed empty strings or vault hooks.',
  },
  // 14. Organization Secrets
  {
    id: 'org-secrets',
    name: 'Organization Actions Secrets',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/security/secrets.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'org-secrets',
    secretHandling: 'sealed_box_blank',
    emuConstraints: [],
    notes:
      'Provisions target secrets with sealed empty strings or vault hooks.',
  },
  // 15. Deployment Environments
  {
    id: 'environments',
    name: 'Deployment Environments & Protection Rules',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/workflows-and-actions/deployment-environments.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'environments',
    secretHandling: 'sealed_box_blank',
    emuConstraints: [],
    notes:
      'Recreates environment variables, protection policies, and sealed secrets.',
  },
  // 16. Repository Webhooks
  {
    id: 'repo-webhooks',
    name: 'Repository Webhooks & Secret Rehydration',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'webhooks',
    secretHandling: 'vault_hook',
    emuConstraints: [],
    notes:
      'Matches GEI-created disabled hooks, rehydrates secret, enables active: true.',
  },
  // 17. Organization Webhooks
  {
    id: 'org-webhooks',
    name: 'Organization Webhooks',
    category: 'organization',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'org-webhooks',
    secretHandling: 'vault_hook',
    emuConstraints: [],
    notes:
      'Matches org hooks, rehydrates secrets from vault/env, and activates delivery.',
  },
  // 18. Repository Settings
  {
    id: 'repo-settings',
    name: 'Repository Settings & Visibility Restoration',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/index.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'repo-settings',
    secretHandling: 'none',
    emuConstraints: [EMU_VISIBILITY_POLICY_CONSTRAINT],
    notes:
      'Restores features and internal visibility without violating EMU public bans.',
  },
  // 19. Organization Custom Properties
  {
    id: 'org-custom-properties',
    name: 'Organization Custom Property Definitions',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/managing-custom-properties-for-repositories-in-your-organization.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'org-custom-properties',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Reconstructs custom property schemas, allowed options, and default values.',
  },
  // 20. Repository Custom Properties
  {
    id: 'repo-custom-properties',
    name: 'Repository Custom Property Values',
    category: 'repository',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/sync-external-custom-properties.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'repo-custom-properties',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'Assigns property values to target repositories post-import.',
  },
  // 21. Deploy Keys
  {
    id: 'deploy-keys',
    name: 'Repository Deploy Keys',
    category: 'repository',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/restricting-deploy-keys-in-your-organization.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'deploy-keys',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'Recreates public SSH deploy keys on target repositories.',
  },
  // 22. Collaborators
  {
    id: 'collaborators',
    name: 'Collaborators & Direct Permissions',
    category: 'repository',
    docsRef:
      'references/github-docs/content/organizations/managing-user-access-to-your-organizations-repositories/managing-outside-collaborators/index.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'collaborators',
    secretHandling: 'none',
    emuConstraints: [
      EMU_OUTSIDE_COLLABORATOR_CONSTRAINT,
      EMU_SCIM_IDENTITY_CONSTRAINT,
    ],
    notes:
      'Re-establishes direct repository access adhering to EMU guest identity rules.',
  },
  // 23. Teams & Hierarchies
  {
    id: 'teams',
    name: 'Teams, Hierarchies & Repository Permissions',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/organizing-members-into-teams/about-teams.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'teams',
    secretHandling: 'none',
    emuConstraints: [EMU_IDP_GROUP_SYNC_CONSTRAINT],
    notes:
      'Recreates team hierarchy and permissions while decoupling user membership.',
  },
  // 24. Custom Roles
  {
    id: 'custom-roles',
    name: 'Custom Repository Roles',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/about-custom-repository-roles.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'custom-roles',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Recreates granular organization custom roles and permission mappings.',
  },
  // 25. CODEOWNERS
  {
    id: 'codeowners',
    name: 'CODEOWNERS File & Ownership Mapping',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'post-migration-codeowners',
    secretHandling: 'none',
    emuConstraints: [EMU_SCIM_IDENTITY_CONSTRAINT],
    notes:
      'Performs regex replacement for renamed EMU usernames and teams in CODEOWNERS files.',
  },
  // 26. GHAS Security Settings
  {
    id: 'ghas-security',
    name: 'GitHub Advanced Security (GHAS) Features',
    category: 'security',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'security',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Enables secret scanning, push protection, code scanning, and Dependabot post-GEI.',
  },
  // 27. Packages Registry
  {
    id: 'packages',
    name: 'GitHub Packages Registry',
    category: 'repository',
    docsRef:
      'references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'packages',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Streams package versions and container images from source to target registry.',
  },
  // 28. Mannequin Reattribution
  {
    id: 'mannequins',
    name: 'Mannequin Reattribution Engine',
    category: 'identity',
    docsRef:
      'references/github-docs/content/migrations/overview/mannequins-and-user-activity.md',
    mechanism: 'graphql_mutation',
    status: 'implemented',
    existingModuleId: 'post-migration-mannequins',
    secretHandling: 'none',
    emuConstraints: [
      EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT,
      EMU_SCIM_IDENTITY_CONSTRAINT,
    ],
    notes:
      'Executes fast-track mannequin reattribution using --skip-invitation.',
  },
  // 29. Autolinks (IMPLEMENTED)
  {
    id: 'autolinks',
    name: 'Autolink References',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/configuring-autolinks-to-reference-external-resources.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'autolinks',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'Rehydrates external ticket autolinks via REST API.',
  },
  // 30. Repository Topics (PARTIAL)
  {
    id: 'repository-topics',
    name: 'Repository Topics & Categorization',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics.md',
    mechanism: 'rest_rehydration',
    status: 'partial',
    proposedModuleId: 'repo-topics',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Collected during discovery; needs explicit rehydration verification.',
  },
  // 31. Repository Templates (PARTIAL)
  {
    id: 'repository-templates',
    name: 'Repository Templates & Issue Forms',
    category: 'repository',
    docsRef:
      'references/github-docs/content/actions/how-tos/reuse-automations/create-workflow-templates.md',
    mechanism: 'rest_rehydration',
    status: 'partial',
    proposedModuleId: 'repo-templates',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Template files transfer in Git tree; mention repair required for EMU accounts.',
  },
  // 32. Organization Settings (IMPLEMENTED)
  {
    id: 'org-settings',
    name: 'Organization Settings & Member Privileges',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/index.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'org-settings',
    secretHandling: 'none',
    emuConstraints: [
      EMU_VISIBILITY_POLICY_CONSTRAINT,
      EMU_SCIM_IDENTITY_CONSTRAINT,
    ],
    notes:
      'Base permissions, repo creation limits, private forking policy, commit signoff.',
  },
  // 33. Actions Policies (IMPLEMENTED)
  {
    id: 'actions-policies',
    name: 'Actions Policies & Allowed Actions Allowlist',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/about-actions-policies.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'actions-policies',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Configures allowed actions allowlists, fork PR permissions, and token defaults.',
  },
  // 34. Actions Runners (IMPLEMENTED)
  {
    id: 'actions-runners',
    name: 'Actions Self-Hosted Runner Groups',
    category: 'actions',
    docsRef:
      'references/github-docs/content/actions/concepts/runners/runner-groups.md',
    mechanism: 'rest_rehydration',
    status: 'implemented',
    existingModuleId: 'actions-runners',
    secretHandling: 'none',
    emuConstraints: [EMU_RUNNER_NETWORK_CONSTRAINT],
    notes:
      'Reconstructs runner groups and repository access allowlists via REST API.',
  },
  // 35. Discussions (IMPLEMENTED)
  {
    id: 'discussions',
    name: 'Repository Discussions',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/enabling-or-disabling-github-discussions-for-a-repository.md',
    mechanism: 'graphql_mutation',
    status: 'implemented',
    existingModuleId: 'discussions',
    secretHandling: 'none',
    emuConstraints: [EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT],
    notes: 'GEI drops discussions; requires GraphQL mutation reconstruction.',
  },
  // 36. Projects v2 (IMPLEMENTED)
  {
    id: 'projects-v2',
    name: 'Projects v2 (Memex)',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/allowing-project-visibility-changes-in-your-organization.md',
    mechanism: 'graphql_mutation',
    status: 'implemented',
    existingModuleId: 'projects-v2',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'GEI drops Projects v2; requires GraphQL creation of boards, views, and custom fields.',
  },
  // 37. GitHub Apps Inventory (IMPLEMENTED)
  {
    id: 'apps-inventory',
    name: 'GitHub Apps & Integrations Inventory',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-programmatic-access-to-your-organization/reviewing-github-apps-installed-in-your-organization.md',
    mechanism: 'manual_advisory',
    status: 'implemented',
    existingModuleId: 'apps-inventory',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Apps cannot be migrated via API; requires audit report and manual re-installation.',
  },
  // 38. IP Allow Lists (IMPLEMENTED)
  {
    id: 'ip-allow-lists',
    name: 'IP Allow Lists / CIDR Restrictions',
    category: 'security',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/index.md',
    mechanism: 'graphql_mutation',
    status: 'implemented',
    existingModuleId: 'ip-allow-lists',
    secretHandling: 'none',
    emuConstraints: [EMU_RUNNER_NETWORK_CONSTRAINT],
    notes:
      'Reconstructs CIDR allow lists and enforcement toggles via GraphQL/REST.',
  },
  // 39. Interaction Limits (MISSING)
  {
    id: 'interaction-limits',
    name: 'Repository Interaction Limits',
    category: 'repository',
    docsRef:
      'references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-the-push-policy-for-your-repository.md',
    mechanism: 'rest_rehydration',
    status: 'missing',
    proposedModuleId: 'interaction-limits',
    secretHandling: 'none',
    emuConstraints: [],
    notes: 'Reconstructs active temporary interaction limits via REST API.',
  },
  // 40. Historical Audit Logs (MANUAL ADVISORY)
  {
    id: 'audit-logs',
    name: 'Historical Audit Logs Archive',
    category: 'security',
    docsRef:
      'references/github-docs/content/migrations/overview/about-githubs-migration-tooling.md',
    mechanism: 'manual_advisory',
    status: 'missing',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Audit log entries cannot be backfilled; advises cold SIEM archive export.',
  },
  // 41. User PATs and Keys (MANUAL ADVISORY)
  {
    id: 'user-pats-and-keys',
    name: 'User Personal Access Tokens & SSH Keys',
    category: 'identity',
    docsRef:
      'references/github-docs/content/organizations/managing-programmatic-access-to-your-organization/github-credential-types.md',
    mechanism: 'manual_advisory',
    status: 'missing',
    secretHandling: 'none',
    emuConstraints: [EMU_SCIM_IDENTITY_CONSTRAINT],
    notes:
      'User keys cannot be migrated across identity tenants; users must regenerate.',
  },
  // 42. Verified Domains (MANUAL ADVISORY)
  {
    id: 'verified-domains',
    name: 'Verified & Approved Domains',
    category: 'organization',
    docsRef:
      'references/github-docs/content/organizations/managing-organization-settings/verifying-or-approving-a-domain-for-your-organization.md',
    mechanism: 'manual_advisory',
    status: 'missing',
    secretHandling: 'none',
    emuConstraints: [],
    notes:
      'Customer must create DNS TXT verification records in destination tenant.',
  },
];
