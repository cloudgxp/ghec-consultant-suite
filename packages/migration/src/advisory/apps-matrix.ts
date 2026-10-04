import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { GitHubAppInstallationInfo } from './types.js';

interface RawAppInstallation {
  readonly id?: number | undefined;
  readonly app_id?: number | undefined;
  readonly app_slug?: string | undefined;
  readonly target_type?: string | undefined;
  readonly repository_selection?: string | undefined;
  readonly permissions?: Record<string, string> | undefined;
  readonly events?: readonly string[] | undefined;
  readonly html_url?: string | undefined;
}

interface RawInstallationsResponse {
  readonly total_count?: number | undefined;
  readonly installations?: readonly RawAppInstallation[] | undefined;
}

/**
 * Sanitizes a CSV cell against spreadsheet formula injection and escapes quotes/commas.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);

  // Neutralize formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Quote if necessary
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class GitHubAppsAdvisoryPlanner {
  /**
   * Discovers installed GitHub Apps from live API or pre-collected discovery bundle.
   */
  async discover(
    sourceOrg: string,
    targetOrg: string,
    adapter?: GitHubReadAdapter | undefined,
    discoveryBundle?: DiscoveryBundle | undefined,
    signal?: AbortSignal | undefined,
  ): Promise<GitHubAppInstallationInfo[]> {
    const apps: GitHubAppInstallationInfo[] = [];

    // 1. Query live API if adapter is available
    if (adapter) {
      try {
        const res = await adapter.readSingle<RawInstallationsResponse>(
          {
            id: 'rest.apps.listInstallations',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/installations',
            pathParams: { org: sourceOrg },
          },
          signal ?? new AbortController().signal,
        );

        if (res.status === 200 && res.data?.installations) {
          for (const inst of res.data.installations) {
            const appId = inst.app_id ?? 0;
            const slug = inst.app_slug ?? `app-${appId}`;
            apps.push({
              id: inst.id ?? 0,
              appId,
              slug,
              name: slug,
              targetType: inst.target_type ?? 'Organization',
              repositorySelection:
                inst.repository_selection === 'all' ? 'all' : 'selected',
              permissions: inst.permissions ?? {},
              events: inst.events ?? [],
              htmlUrl: inst.html_url ?? `https://github.com/apps/${slug}`,
              destinationInstallUrl: `https://github.com/apps/${slug}/installations/new`,
            });
          }
        }
      } catch {
        // Fall back to bundle if live API fails
      }
    }

    // 2. Supplement or fallback with discovery bundle if apps list is empty
    if (apps.length === 0 && discoveryBundle) {
      let idx = 0;
      for (const e of discoveryBundle.entities) {
        if (e.kind === 'integration' && e.integrationKind === 'github_app') {
          const slug = e.label.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          apps.push({
            id: idx + 1,
            appId: 1000 + idx,
            slug,
            name: e.label,
            targetType: 'Organization',
            repositorySelection: 'selected',
            permissions: {},
            events: [],
            htmlUrl: `https://github.com/apps/${slug}`,
            destinationInstallUrl: `https://github.com/apps/${slug}/installations/new`,
          });
          idx++;
        }
      }
    }

    return apps;
  }

  /**
   * Generates the GitHub Apps Reinstallation Matrix CSV.
   */
  generateAppsMatrixCsv(apps: readonly GitHubAppInstallationInfo[]): string {
    const headers = [
      'App Name',
      'App ID',
      'App Slug',
      'Target Type',
      'Repository Selection',
      'Permissions Requested',
      'Subscribed Events',
      'Destination Install URL',
    ];

    const rows = apps.map((app) => {
      const permissionsStr = Object.entries(app.permissions)
        .map(([k, v]) => `${k}:${v}`)
        .join('; ');
      const eventsStr = app.events.join('; ');

      return [
        sanitizeCsvCell(app.name),
        sanitizeCsvCell(app.appId),
        sanitizeCsvCell(app.slug),
        sanitizeCsvCell(app.targetType),
        sanitizeCsvCell(app.repositorySelection),
        sanitizeCsvCell(permissionsStr),
        sanitizeCsvCell(eventsStr),
        sanitizeCsvCell(app.destinationInstallUrl),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
