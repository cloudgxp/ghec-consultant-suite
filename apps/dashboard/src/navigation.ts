export type DashboardView =
  | 'overview'
  | 'remediation'
  | 'readiness'
  | 'dependency-map'
  | 'repositories'
  | 'packages'
  | 'releases-assets'
  | 'actions'
  | 'projects'
  | 'portfolio'
  | 'code-ownership'
  | 'secrets-variables'
  | 'security'
  | 'teams'
  | 'health'
  | 'export';

export type NavigationIcon =
  | 'overview'
  | 'compare'
  | 'readiness'
  | 'repository'
  | 'automation'
  | 'shield'
  | 'people'
  | 'health'
  | 'export';

export interface NavigationItem {
  id: DashboardView;
  label: string;
  description: string;
  icon: NavigationIcon;
  comparisonOnly?: boolean;
}

export interface NavigationGroup {
  label: 'Assess' | 'Inventory' | 'Govern' | 'Deliver';
  items: readonly NavigationItem[];
}

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    label: 'Assess',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        description: 'Assessment summary and key indicators',
        icon: 'overview',
      },
      {
        id: 'remediation',
        label: 'Remediation Tracker',
        description: 'Changes between comparison scans',
        icon: 'compare',
        comparisonOnly: true,
      },
      {
        id: 'readiness',
        label: 'Migration Readiness',
        description: 'Risks, blockers, and recommendations',
        icon: 'readiness',
      },
      {
        id: 'dependency-map',
        label: 'Dependency Map',
        description: 'Blast radius, traversal, and migration cohorts',
        icon: 'compare',
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        id: 'repositories',
        label: 'Repositories',
        description: 'Repository inventory and sizing',
        icon: 'repository',
      },
      {
        id: 'packages',
        label: 'Packages',
        description: 'Registry inventory, versions, and migration disposition',
        icon: 'repository',
      },
      {
        id: 'releases-assets',
        label: 'Releases & Assets',
        description: 'Releases, binaries, large assets, and Git LFS',
        icon: 'repository',
      },
      {
        id: 'actions',
        label: 'Actions',
        description: 'Automation, runners, environments, and policies',
        icon: 'automation',
      },
      {
        id: 'projects',
        label: 'Projects',
        description: 'Projects v2 inventory and repository relationships',
        icon: 'repository',
      },
      {
        id: 'portfolio',
        label: 'Portfolio',
        description: 'Repository classification and migration segmentation',
        icon: 'repository',
      },
    ],
  },
  {
    label: 'Govern',
    items: [
      {
        id: 'code-ownership',
        label: 'Code Ownership',
        description: 'CODEOWNERS posture and ownership gaps',
        icon: 'people',
      },
      {
        id: 'secrets-variables',
        label: 'Secrets & Variables',
        description: 'Metadata-only sensitive configuration inventory',
        icon: 'shield',
      },
      {
        id: 'security',
        label: 'Security & Governance',
        description: 'Security tooling and policy posture',
        icon: 'shield',
      },
      {
        id: 'teams',
        label: 'Teams & Access',
        description: 'Teams, identities, and permissions',
        icon: 'people',
      },
      {
        id: 'health',
        label: 'Collector Health',
        description: 'Coverage, warnings, and evidence quality',
        icon: 'health',
      },
    ],
  },
  {
    label: 'Deliver',
    items: [
      {
        id: 'export',
        label: 'Export Center',
        description: 'PDF and CSV deliverables',
        icon: 'export',
      },
    ],
  },
];

export function visibleNavigationGroups(
  comparisonActive: boolean,
): readonly NavigationGroup[] {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.comparisonOnly || comparisonActive,
    ),
  }));
}

export function navigationItem(view: DashboardView): NavigationItem {
  return NAVIGATION_GROUPS.flatMap((group) => group.items).find(
    (item) => item.id === view,
  )!;
}

export function isDashboardView(value: string): value is DashboardView {
  return NAVIGATION_GROUPS.some((group) =>
    group.items.some((item) => item.id === value),
  );
}
