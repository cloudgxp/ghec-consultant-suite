import type {
  AppInstallationState,
  GitHubAppClassification,
  GitHubAppManifestPayload,
  RawGitHubAppDetailsResponse,
  RecommendedAppStrategy,
} from './types.js';

/**
 * GitHub App names and manifest `name` fields cannot exceed 34 characters.
 * See: references/github-docs/content/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.md
 */
export const MAX_GITHUB_APP_NAME_LENGTH = 34;

export interface GitHubAppManifestInput {
  readonly app_slug: string;
  readonly app_name?: string | undefined;
  readonly description?: string | undefined;
  readonly external_url?: string | undefined;
  readonly html_url?: string | undefined;
  readonly permissions: Readonly<Record<string, string>>;
  readonly events: readonly string[];
}

export interface BuildGitHubAppManifestOptions {
  readonly redirectUrl?: string | undefined;
  readonly hookUrl?: string | undefined;
  readonly isPublic?: boolean | undefined;
}

export interface GitHubAppClassificationResult {
  readonly classification: GitHubAppClassification;
  readonly recommendedStrategy: RecommendedAppStrategy;
  readonly appName?: string | undefined;
  readonly description?: string | undefined;
  readonly externalUrl?: string | undefined;
  readonly ownerLogin?: string | undefined;
}

function sanitizeSlugSegment(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'app';
}

/**
 * Generates a deterministic, collision-safe GitHub App name/slug for recreating
 * a custom app in the target organization (`{sourceSlug}-{targetOrg}`), capped
 * at 34 characters per GitHub App manifest constraints.
 */
export function buildRecreatedAppSlug(
  sourceSlug: string,
  targetOrg: string,
): string {
  const cleanSource = sanitizeSlugSegment(sourceSlug);
  const cleanTarget = sanitizeSlugSegment(targetOrg);
  const combined = `${cleanSource}-${cleanTarget}`;

  if (combined.length <= MAX_GITHUB_APP_NAME_LENGTH) {
    return combined;
  }

  const truncatedTarget = cleanTarget.slice(0, 15).replace(/-+$/g, '');
  const suffix = `-${truncatedTarget || 'emu'}`;
  const maxPrefixLen = Math.max(1, MAX_GITHUB_APP_NAME_LENGTH - suffix.length);
  const truncatedSource = cleanSource
    .slice(0, maxPrefixLen)
    .replace(/-+$/g, '');

  return `${truncatedSource || 'app'}${suffix}`;
}

/**
 * Classifies a discovered GitHub App installation based on the result of probing
 * `GET /apps/{app_slug}`.
 *
 * - Public apps return HTTP 200 with `owner.login`:
 *   - If `owner.login === sourceOrg`, classified as `custom_public` (`either` strategy).
 *   - Otherwise, classified as `third_party` (`install_existing` strategy).
 * - Private/internal apps return HTTP 404 or 403 when queried by a PAT outside
 *   the owning app context, classified as `custom_private` (`recreate_app` strategy).
 */
export function classifyGitHubApp(params: {
  readonly sourceOrg: string;
  readonly status: number | null;
  readonly details?: RawGitHubAppDetailsResponse | null | undefined;
}): GitHubAppClassificationResult {
  const { sourceOrg, status, details } = params;

  if (status === 200 && details && typeof details === 'object') {
    const ownerLogin =
      typeof details.owner?.login === 'string' && details.owner.login.length > 0
        ? details.owner.login
        : undefined;
    const appName =
      typeof details.name === 'string' && details.name.length > 0
        ? details.name
        : undefined;
    const description =
      typeof details.description === 'string' && details.description.length > 0
        ? details.description
        : undefined;
    const externalUrl =
      typeof details.external_url === 'string' &&
      details.external_url.length > 0
        ? details.external_url
        : undefined;

    if (ownerLogin) {
      if (ownerLogin.toLowerCase() === sourceOrg.toLowerCase()) {
        return {
          classification: 'custom_public',
          recommendedStrategy: 'either',
          appName,
          description,
          externalUrl,
          ownerLogin,
        };
      }
      return {
        classification: 'third_party',
        recommendedStrategy: 'install_existing',
        appName,
        description,
        externalUrl,
        ownerLogin,
      };
    }

    // Fallback when status is 200 without owner metadata (e.g., synthetic test fixtures)
    return {
      classification: 'third_party',
      recommendedStrategy: 'install_existing',
      appName,
      description,
      externalUrl,
    };
  }

  return {
    classification: 'custom_private',
    recommendedStrategy: 'recreate_app',
  };
}

/**
 * Builds a GitHub App Manifest JSON payload (`GitHubAppManifestPayload`) from a
 * discovered source app installation state.
 *
 * See: references/github-docs/content/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.md
 */
export function buildGitHubAppManifest(
  app: GitHubAppManifestInput | AppInstallationState,
  targetOrg: string,
  options?: BuildGitHubAppManifestOptions,
): GitHubAppManifestPayload {
  const name = buildRecreatedAppSlug(app.app_slug, targetOrg);
  const defaultHomepage = `https://github.com/organizations/${encodeURIComponent(targetOrg)}/settings/apps`;
  const url = app.external_url ?? app.html_url ?? defaultHomepage;
  const description =
    app.description ??
    `Recreated from source GitHub App "${app.app_slug}" for ${targetOrg}`;

  const sortedPermissions: Record<string, string> = {};
  for (const key of Object.keys(app.permissions).sort()) {
    const val = app.permissions[key];
    if (typeof val === 'string') {
      sortedPermissions[key] = val;
    }
  }

  const events = [...app.events];
  const hookAttributes = options?.hookUrl
    ? {
        url: options.hookUrl,
        active: events.length > 0,
      }
    : events.length > 0
      ? {
          url: 'https://example.com/github/webhook',
          active: false,
        }
      : undefined;

  return {
    name,
    url,
    description,
    ...(hookAttributes ? { hook_attributes: hookAttributes } : {}),
    ...(options?.redirectUrl ? { redirect_url: options.redirectUrl } : {}),
    public: options?.isPublic ?? false,
    default_permissions: sortedPermissions,
    default_events: events,
  };
}

/**
 * Builds a 1-click GitHub App registration URL using query parameters so an
 * organization owner can recreate a custom app directly in the browser without
 * starting a local server.
 *
 * See: references/github-docs/content/apps/sharing-github-apps/registering-a-github-app-using-url-parameters.md
 */
export function buildGitHubAppUrlParametersLink(
  app: GitHubAppManifestInput | AppInstallationState,
  targetOrg: string,
  baseWebUrl = 'https://github.com',
): string {
  const cleanBase = baseWebUrl.replace(/\/+$/g, '');
  const endpoint = `${cleanBase}/organizations/${encodeURIComponent(targetOrg)}/settings/apps/new`;
  const name = buildRecreatedAppSlug(app.app_slug, targetOrg);
  const url =
    app.external_url ??
    app.html_url ??
    `${cleanBase}/organizations/${encodeURIComponent(targetOrg)}/settings/apps`;
  const description =
    app.description ??
    `Recreated from source GitHub App "${app.app_slug}" for ${targetOrg}`;

  const params = new URLSearchParams();
  params.set('name', name);
  params.set('description', description);
  params.set('url', url);
  params.set('public', 'false');
  params.set('webhook_active', 'false');

  for (const key of Object.keys(app.permissions).sort()) {
    const val = app.permissions[key];
    if (typeof val === 'string') {
      params.append(key, val);
    }
  }

  for (const eventName of app.events) {
    params.append('events[]', eventName);
  }

  return `${endpoint}?${params.toString()}`;
}
