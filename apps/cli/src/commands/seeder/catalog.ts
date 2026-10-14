import type {
  SeedItemCategory,
  SeedItemDefinition,
  SeedScopeLevel,
} from '@ghec/contracts';

export const SEED_CATALOG_ITEMS: readonly SeedItemDefinition[] = [
  // Organization-level (13 items)
  {
    id: 'org-settings',
    name: 'Organization Settings & Policies',
    scopeLevel: 'organization',
    category: 'core-governance',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Default repository permissions, member creation rights, forking policies, and 2FA',
  },
  {
    id: 'actions-policies',
    name: 'Actions Organization Policies',
    scopeLevel: 'organization',
    category: 'actions-and-security',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Allowed actions, repository execution access, and fork PR approval rules',
  },
  {
    id: 'actions-runners',
    name: 'Self-Hosted Runner Groups',
    scopeLevel: 'organization',
    category: 'actions-and-security',
    dependencies: [],
    enterpriseOnly: true,
    description:
      'Self-hosted runner group definitions with assigned repository visibility',
  },
  {
    id: 'org-variables',
    name: 'Organization Actions & Dependabot Variables',
    scopeLevel: 'organization',
    category: 'actions-and-security',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Global configuration variables (e.g. GLOBAL_REGION, DEPLOY_TIER)',
  },
  {
    id: 'org-secrets',
    name: 'Organization Sealed Actions Secrets',
    scopeLevel: 'organization',
    category: 'actions-and-security',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Sealed organization secrets encrypted via libsodium sealed-box',
  },
  {
    id: 'org-custom-properties',
    name: 'Organization Custom Property Schema',
    scopeLevel: 'organization',
    category: 'core-governance',
    dependencies: [],
    enterpriseOnly: true,
    description:
      'Custom property schema definitions across string, select, and boolean types',
  },
  {
    id: 'teams',
    name: 'Nested Team Hierarchy',
    scopeLevel: 'organization',
    category: 'core-governance',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Multi-level team structure (parent engineering, child infra, frontend)',
  },
  {
    id: 'custom-roles',
    name: 'Custom Repository Roles',
    scopeLevel: 'organization',
    category: 'core-governance',
    dependencies: [],
    enterpriseOnly: true,
    description:
      'Organization-level custom repository roles (e.g. Release Manager, Triage Specialist)',
  },
  {
    id: 'ip-allow-lists',
    name: 'IP Allow List Entries',
    scopeLevel: 'organization',
    category: 'core-governance',
    dependencies: [],
    enterpriseOnly: true,
    description: 'Organization IP allow list CIDR ranges and descriptions',
  },
  {
    id: 'org-webhooks',
    name: 'Organization Webhooks',
    scopeLevel: 'organization',
    category: 'artifacts-and-code',
    dependencies: [],
    enterpriseOnly: false,
    description: 'Org-level webhooks configured to synthetic test sinks',
  },
  {
    id: 'projects-v2',
    name: 'GitHub Projects v2 Boards',
    scopeLevel: 'organization',
    category: 'collaboration',
    dependencies: [],
    enterpriseOnly: false,
    description: 'Projects v2 boards with custom status and priority fields',
  },
  {
    id: 'apps-inventory',
    name: 'GitHub Apps Inventory',
    scopeLevel: 'organization',
    category: 'artifacts-and-code',
    dependencies: [],
    enterpriseOnly: false,
    description: 'Installed GitHub Apps verification and mock integrations',
  },
  {
    id: 'post-migration-mannequins',
    name: 'Mock Mannequin Attributions',
    scopeLevel: 'organization',
    category: 'collaboration',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Synthetic mannequin committer attributions for identity reclamation rehearsal',
  },

  // Repository-level (19 items)
  {
    id: 'gei-repo',
    name: 'Base Repository & Settings',
    scopeLevel: 'repository',
    category: 'core-governance',
    dependencies: [],
    enterpriseOnly: false,
    description:
      'Repository bootstrapping, description, topics, merge strategies, and auto-merge',
  },
  {
    id: 'repo-variables',
    name: 'Repository Actions & Codespaces Variables',
    scopeLevel: 'repository',
    category: 'actions-and-security',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'Repository-level environment variables',
  },
  {
    id: 'repo-secrets',
    name: 'Repository Sealed Actions Secrets',
    scopeLevel: 'repository',
    category: 'actions-and-security',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'Repository secrets encrypted via libsodium sealed-box',
  },
  {
    id: 'repo-custom-properties',
    name: 'Applied Repository Custom Properties',
    scopeLevel: 'repository',
    category: 'core-governance',
    dependencies: ['gei-repo', 'org-custom-properties'],
    enterpriseOnly: true,
    description:
      'Property values applied to the repository conforming to org schema',
  },
  {
    id: 'environments',
    name: 'Deployment Environments',
    scopeLevel: 'repository',
    category: 'actions-and-security',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'Deployment environments with wait timers and branch policies',
  },
  {
    id: 'branch-protection',
    name: 'Classic Branch Protection',
    scopeLevel: 'repository',
    category: 'actions-and-security',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Branch protection rules on default branch (approvals, admin enforcement)',
  },
  {
    id: 'rulesets',
    name: 'Modern Repository Rulesets',
    scopeLevel: 'repository',
    category: 'actions-and-security',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Branch and tag rulesets with author regex and review criteria',
  },
  {
    id: 'repo-webhooks',
    name: 'Repository Webhooks',
    scopeLevel: 'repository',
    category: 'artifacts-and-code',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'Repository webhook subscriptions to synthetic sink',
  },
  {
    id: 'autolinks',
    name: 'Autolink References',
    scopeLevel: 'repository',
    category: 'collaboration',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'External issue tracker references (JIRA-, TICKET-)',
  },
  {
    id: 'collaborators',
    name: 'Repository Collaborators & Teams',
    scopeLevel: 'repository',
    category: 'core-governance',
    dependencies: ['gei-repo', 'teams'],
    enterpriseOnly: false,
    description: 'Team repository permissions and collaborator mappings',
  },
  {
    id: 'deploy-keys',
    name: 'Deploy Keys',
    scopeLevel: 'repository',
    category: 'artifacts-and-code',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Read-only and write deploy keys with synthetic SSH public keys',
  },
  {
    id: 'issues',
    name: 'Sample Issues & Milestones',
    scopeLevel: 'repository',
    category: 'collaboration',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'Issue threads with markdown bodies, labels, and milestones',
  },
  {
    id: 'pull-requests',
    name: 'Pull Requests & Review Comments',
    scopeLevel: 'repository',
    category: 'collaboration',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Active and merged pull requests with feature commits and review comments',
  },
  {
    id: 'discussions',
    name: 'Repository Discussions',
    scopeLevel: 'repository',
    category: 'collaboration',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: 'Discussion categories, Q&A threads, and answered states',
  },
  {
    id: 'releases',
    name: 'Releases & Assets',
    scopeLevel: 'repository',
    category: 'artifacts-and-code',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Git tags, releases with release notes, and synthetic downloadable assets',
  },
  {
    id: 'lfs',
    name: 'Git LFS Objects',
    scopeLevel: 'repository',
    category: 'artifacts-and-code',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description: '.gitattributes configuration and real Git LFS pointer files',
  },
  {
    id: 'packages',
    name: 'GitHub Packages',
    scopeLevel: 'repository',
    category: 'artifacts-and-code',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Package registry integration and synthetic package references',
  },
  {
    id: 'post-migration-codeowners',
    name: 'CODEOWNERS File',
    scopeLevel: 'repository',
    category: 'collaboration',
    dependencies: ['gei-repo', 'teams'],
    enterpriseOnly: false,
    description: '.github/CODEOWNERS referencing provisioned team hierarchy',
  },
  {
    id: 'security',
    name: 'GHAS Security Configurations',
    scopeLevel: 'repository',
    category: 'actions-and-security',
    dependencies: ['gei-repo'],
    enterpriseOnly: false,
    description:
      'Dependabot, secret scanning, push protection, and CodeQL workflow',
  },
];

export const PRESET_MAPPINGS: Record<
  SeedItemCategory | 'all',
  readonly string[]
> = {
  all: SEED_CATALOG_ITEMS.map((item) => item.id),
  'core-governance': [
    'org-settings',
    'teams',
    'custom-roles',
    'ip-allow-lists',
    'org-custom-properties',
    'gei-repo',
    'repo-custom-properties',
    'collaborators',
  ],
  'actions-and-security': [
    'actions-policies',
    'actions-runners',
    'org-variables',
    'org-secrets',
    'repo-variables',
    'repo-secrets',
    'environments',
    'branch-protection',
    'rulesets',
    'security',
  ],
  collaboration: [
    'projects-v2',
    'issues',
    'pull-requests',
    'discussions',
    'autolinks',
    'post-migration-codeowners',
    'post-migration-mannequins',
  ],
  'artifacts-and-code': [
    'releases',
    'lfs',
    'packages',
    'deploy-keys',
    'org-webhooks',
    'repo-webhooks',
    'apps-inventory',
  ],
};

const ALIASES: Record<string, string[]> = {
  webhooks: ['org-webhooks', 'repo-webhooks'],
  'repo-settings': ['gei-repo'],
  codeowners: ['post-migration-codeowners'],
  mannequins: ['post-migration-mannequins'],
};

/**
 * Resolves a list of item IDs given scopeLevel and contentType (preset or comma-separated list),
 * expands dependencies, and returns the sorted items in topological dependency order.
 */
export function resolveSeederItems(
  scopeLevel: SeedScopeLevel,
  contentType: string,
): SeedItemDefinition[] {
  const normalized = contentType.trim().toLowerCase();
  let requestedIds: string[] = [];

  if (normalized in PRESET_MAPPINGS) {
    requestedIds = [
      ...PRESET_MAPPINGS[normalized as keyof typeof PRESET_MAPPINGS],
    ];
  } else {
    // Comma-separated list
    const parts = normalized
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (ALIASES[part]) {
        requestedIds.push(...ALIASES[part]);
      } else {
        requestedIds.push(part);
      }
    }
  }

  // Filter items by scopeLevel
  const catalogMap = new Map<string, SeedItemDefinition>(
    SEED_CATALOG_ITEMS.map((item) => [item.id, item]),
  );

  const matchedItems: SeedItemDefinition[] = [];
  for (const id of requestedIds) {
    const item = catalogMap.get(id);
    if (!item) continue;
    if (scopeLevel === 'organization' && item.scopeLevel !== 'organization')
      continue;
    if (scopeLevel === 'repository' && item.scopeLevel !== 'repository')
      continue;
    matchedItems.push(item);
  }

  // Expand dependencies
  const includedIds = new Set<string>(matchedItems.map((item) => item.id));
  const queue = [...matchedItems];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const depId of current.dependencies) {
      const depItem = catalogMap.get(depId);
      if (!depItem) continue;
      // If we are in repo-only mode, we don't pull org-level deps unless they can be satisfied
      if (scopeLevel === 'repository' && depItem.scopeLevel === 'organization')
        continue;
      if (!includedIds.has(depId)) {
        includedIds.add(depId);
        queue.push(depItem);
      }
    }
  }

  // Topologically sort items so dependencies appear before dependents
  const selectedItems = SEED_CATALOG_ITEMS.filter((item) =>
    includedIds.has(item.id),
  );
  return topologicalSortItems(selectedItems);
}

function topologicalSortItems(
  items: SeedItemDefinition[],
): SeedItemDefinition[] {
  const result: SeedItemDefinition[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const itemMap = new Map(items.map((i) => [i.id, i]));

  function visit(item: SeedItemDefinition) {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) {
      // Circular dependency fallback
      return;
    }
    visiting.add(item.id);
    for (const depId of item.dependencies) {
      const dep = itemMap.get(depId);
      if (dep) {
        visit(dep);
      }
    }
    visiting.delete(item.id);
    visited.add(item.id);
    result.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return result;
}
