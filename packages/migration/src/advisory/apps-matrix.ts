import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import {
  buildGitHubAppManifest,
  buildGitHubAppUrlParametersLink,
  buildRecreatedAppSlug,
  classifyGitHubApp,
} from '../modules/apps-inventory/manifest.js';
import type { RawGitHubAppDetailsResponse } from '../modules/apps-inventory/types.js';
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
  if (/^[\t\r\n=+\-@]/.test(str)) {
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
    const activeSignal = signal ?? new AbortController().signal;

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
          activeSignal,
        );

        if (res.status === 200 && res.data?.installations) {
          for (const inst of res.data.installations) {
            const appId = inst.app_id ?? 0;
            const slug = inst.app_slug ?? `app-${appId}`;
            const permissions = inst.permissions ?? {};
            const events = inst.events ?? [];
            const htmlUrl = inst.html_url ?? `https://github.com/apps/${slug}`;

            let status: number | null;
            let details: RawGitHubAppDetailsResponse | null;
            try {
              const appRes =
                await adapter.readSingle<RawGitHubAppDetailsResponse>(
                  {
                    id: 'rest.apps.getBySlug',
                    transport: 'rest',
                    verifiedReadOnly: true,
                    unauthenticated: true,
                    path: '/apps/{app_slug}',
                    pathParams: { app_slug: slug },
                  },
                  activeSignal,
                );
              status = appRes.status;
              details = appRes.data;
            } catch {
              status = 404;
              details = null;
            }

            if (status !== 200) {
              try {
                const authAppRes =
                  await adapter.readSingle<RawGitHubAppDetailsResponse>(
                    {
                      id: 'rest.apps.getBySlugAuthenticated',
                      transport: 'rest',
                      verifiedReadOnly: true,
                      path: '/apps/{app_slug}',
                      pathParams: { app_slug: slug },
                    },
                    activeSignal,
                  );
                if (authAppRes.status === 200 && authAppRes.data) {
                  details = authAppRes.data;
                  if (status === 403 || status === 429) {
                    status = 200;
                  }
                }
              } catch {
                // Ignore authenticated metadata enrichment errors
              }
            }

            const classified = classifyGitHubApp({
              sourceOrg,
              status,
              details,
            });
            const manifestInput = {
              app_slug: slug,
              app_name: classified.appName,
              description: classified.description,
              external_url: classified.externalUrl,
              html_url: htmlUrl,
              permissions,
              events,
            };

            apps.push({
              id: inst.id ?? 0,
              appId,
              slug,
              name: slug,
              targetType: inst.target_type ?? 'Organization',
              repositorySelection:
                inst.repository_selection === 'all' ? 'all' : 'selected',
              permissions,
              events,
              htmlUrl,
              destinationInstallUrl: `https://github.com/apps/${slug}/installations/new`,
              classification: classified.classification,
              recommendedStrategy: classified.recommendedStrategy,
              recreatedSlug: buildRecreatedAppSlug(slug, targetOrg),
              recreateAppUrl: buildGitHubAppUrlParametersLink(
                manifestInput,
                targetOrg,
              ),
              manifest: buildGitHubAppManifest(manifestInput, targetOrg),
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
          const htmlUrl = `https://github.com/apps/${slug}`;
          const manifestInput = {
            app_slug: slug,
            app_name: e.label,
            html_url: htmlUrl,
            permissions: {},
            events: [],
          };
          apps.push({
            id: idx + 1,
            appId: 1000 + idx,
            slug,
            name: e.label,
            targetType: 'Organization',
            repositorySelection: 'selected',
            permissions: {},
            events: [],
            htmlUrl,
            destinationInstallUrl: `https://github.com/apps/${slug}/installations/new`,
            classification: 'third_party',
            recommendedStrategy: 'install_existing',
            recreatedSlug: buildRecreatedAppSlug(slug, targetOrg),
            recreateAppUrl: buildGitHubAppUrlParametersLink(
              manifestInput,
              targetOrg,
            ),
            manifest: buildGitHubAppManifest(manifestInput, targetOrg),
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
      'Classification',
      'Recommended Strategy',
      'Recreate App URL',
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
        sanitizeCsvCell(app.classification ?? 'third_party'),
        sanitizeCsvCell(app.recommendedStrategy ?? 'install_existing'),
        sanitizeCsvCell(app.recreateAppUrl ?? ''),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
