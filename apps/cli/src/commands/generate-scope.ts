import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MIGRATION_SCHEMA_VERSION,
  validateMigrationScope,
  type MigrationScope,
  type OrgItemsMode,
  type SkippedArchivedRepository,
} from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';
import {
  ALL_ORGANIZATION_MODULES,
  ALL_REPOSITORY_MODULES,
} from '@ghec/migration';

const execFileAsync = promisify(execFile);

export const DEFAULT_ORG_MODULES: readonly string[] = ['auto'];

export const DEFAULT_REPO_MODULES: readonly string[] = ['auto'];

export type SourceRepoVisibility = 'public' | 'private' | 'internal';

export interface SourceRepoMetadata {
  readonly name: string;
  readonly archived?: boolean | undefined;
  readonly isArchived?: boolean | undefined;
  readonly fork?: boolean | undefined;
  readonly isFork?: boolean | undefined;
  readonly visibility?: string | undefined;
  readonly isPrivate?: boolean | undefined;
  readonly private?: boolean | undefined;
}

export interface GenerateScopeOptions {
  readonly source?: string | undefined;
  readonly target: string;
  readonly name?: string | undefined;
  readonly output?: string | undefined;
  readonly all?: boolean | undefined;
  readonly sourceVisibility?: string | undefined;
  readonly excludeForks?: boolean | undefined;
  readonly repos?: string | undefined;
  readonly reposFile?: string | undefined;
  readonly file?: string | undefined;
  readonly orgOnly?: boolean | undefined;
  readonly includeArchived?: boolean | undefined;
  readonly targetRepoPrefix?: string | undefined;
  readonly targetRepoSuffix?: string | undefined;
  readonly targetVisibility?: 'private' | 'internal' | 'public' | undefined;
  readonly lfsStrategy?: 'dual-remote-stream' | 'skip' | undefined;
  readonly useGei?: boolean | undefined;
  readonly skipReleases?: boolean | undefined;
  readonly mirrorPushMode?: 'fast-snapshot' | 'full-history' | undefined;
  readonly targetType?: 'ghec' | 'emu' | undefined;
  readonly emuShortcode?: string | undefined;
  readonly identityStrategy?:
    'emu-saml' | 'manual' | 'pass-through' | undefined;
  readonly identitySuffix?: string | undefined;
  readonly includeOrgResources?: boolean | undefined;
  readonly orgItems?: OrgItemsMode | undefined;
  readonly orgModules?: string | undefined;
  readonly repoModules?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly silent?: boolean | undefined;
  readonly repoFetcher?:
    ((sourceOrg: string) => Promise<readonly SourceRepoMetadata[]>) | undefined;
}

export interface ValidateScopeOptions {
  readonly scopePath: string;
  readonly targetType?: 'ghec' | 'emu' | undefined;
  readonly emuShortcode?: string | undefined;
  readonly mirrorPushMode?: 'fast-snapshot' | 'full-history' | undefined;
  readonly orgItems?: OrgItemsMode | undefined;
}

export interface ParsedRepoEntry {
  readonly org: string | null;
  readonly name: string;
}

/**
 * Parses and validates an `--org-items` mode string ("all", "associated-only", "none").
 */
export function parseOrgItemsMode(
  rawMode?: string | undefined,
): OrgItemsMode | undefined {
  if (!rawMode || !rawMode.trim()) {
    return undefined;
  }
  const normalized = rawMode.trim().toLowerCase();
  if (
    normalized === 'all' ||
    normalized === 'associated-only' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid --org-items value "${rawMode}". Allowed values: all, associated-only, none.`,
  );
}

/**
 * Parses and validates a `--source-visibility` filter string (e.g. "all", "public", "private", "internal", or "private,internal").
 * Returns `null` when all visibilities are allowed, or a Set of allowed lowercase visibility strings.
 */
export function parseSourceVisibilityFilter(
  rawFilter?: string | undefined,
): ReadonlySet<SourceRepoVisibility> | null {
  if (!rawFilter || !rawFilter.trim()) {
    return null;
  }
  const tokens = rawFilter
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.includes('all')) {
    return null;
  }
  const allowed = new Set<SourceRepoVisibility>();
  for (const token of tokens) {
    if (token === 'public' || token === 'private' || token === 'internal') {
      allowed.add(token);
    } else {
      throw new Error(
        `Invalid --source-visibility value "${token}". Allowed values: all, public, private, internal (or comma-separated like "private,internal").`,
      );
    }
  }
  return allowed;
}

export interface PartitionedRepositoriesResult {
  readonly matched: string[];
  readonly archivedNames: ReadonlySet<string>;
  readonly skippedArchived: SkippedArchivedRepository[];
}

/**
 * Partitions raw repository metadata into matched repository names, archived repository names,
 * and skipped archived repository records when `includeArchived` is false.
 */
export function partitionDiscoveredRepositories(
  repos: readonly SourceRepoMetadata[],
  options: {
    readonly sourceOrg?: string | undefined;
    readonly includeArchived?: boolean | undefined;
    readonly excludeForks?: boolean | undefined;
    readonly sourceVisibility?: string | undefined;
  } = {},
): PartitionedRepositoriesResult {
  const includeArchived = options.includeArchived ?? false;
  const excludeForks = options.excludeForks ?? false;
  const visibilitySet = parseSourceVisibilityFilter(options.sourceVisibility);
  const sourceOrg = options.sourceOrg ?? 'unknown';

  const matched: string[] = [];
  const archivedNames = new Set<string>();
  const skippedArchived: SkippedArchivedRepository[] = [];

  for (const repo of repos) {
    const isArchived = Boolean(repo.isArchived ?? repo.archived);
    const isFork = Boolean(repo.isFork ?? repo.fork);
    if (excludeForks && isFork) {
      continue;
    }
    const rawVis = (
      repo.visibility ?? (repo.isPrivate || repo.private ? 'private' : 'public')
    )
      .trim()
      .toLowerCase();
    const normalizedVis: 'public' | 'private' | 'internal' | 'unknown' =
      rawVis === 'public' || rawVis === 'private' || rawVis === 'internal'
        ? rawVis
        : 'unknown';

    if (visibilitySet) {
      if (normalizedVis === 'unknown' || !visibilitySet.has(normalizedVis)) {
        continue;
      }
    }

    if (!includeArchived && isArchived) {
      skippedArchived.push({
        sourceOrg,
        sourceRepo: repo.name,
        visibility: normalizedVis,
        isFork,
        reason:
          'Repository is archived on source organization and was excluded from scope (include_archived=false).',
      });
      continue;
    }
    if (isArchived) {
      archivedNames.add(repo.name);
    }
    matched.push(repo.name);
  }

  return { matched, archivedNames, skippedArchived };
}

/**
 * Filters raw repository metadata from GitHub CLI or REST API by archived status, fork status, and source visibility.
 */
export function filterDiscoveredRepositories(
  repos: readonly SourceRepoMetadata[],
  options: {
    readonly includeArchived?: boolean | undefined;
    readonly excludeForks?: boolean | undefined;
    readonly sourceVisibility?: string | undefined;
  } = {},
): string[] {
  return partitionDiscoveredRepositories(repos, options).matched;
}

/**
 * Parses a repository input which can be a full URL (HTTPS/SSH), an org/repo slug,
 * or a plain repository name.
 */
export function parseRepoEntry(
  rawInput: string,
  expectedSourceOrg: string | null,
): ParsedRepoEntry | null {
  let cleaned = rawInput.trim();
  if (!cleaned || cleaned.startsWith('#')) return null;

  cleaned = cleaned.replace(/[?#].*$/, '');
  if (cleaned.endsWith('.git')) {
    cleaned = cleaned.slice(0, -4);
  }
  cleaned = cleaned.replace(/\/+$/, '');

  const sshMatch = cleaned.match(
    /^(?:ssh:\/\/)?git@[^:/]+[:/]([^/]+)\/([^/]+)$/,
  );
  if (sshMatch) {
    const org = sshMatch[1] ?? '';
    const name = sshMatch[2] ?? '';
    if (
      expectedSourceOrg &&
      org.toLowerCase() !== expectedSourceOrg.toLowerCase()
    ) {
      throw new Error(
        `Repository URL "${rawInput}" belongs to organization "${org}", but source organization is "${expectedSourceOrg}".`,
      );
    }
    return { org, name };
  }

  if (cleaned.includes('://')) {
    try {
      const url = new URL(cleaned);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const org = parts[parts.length - 2] ?? '';
        const name = parts[parts.length - 1] ?? '';
        if (
          expectedSourceOrg &&
          org.toLowerCase() !== expectedSourceOrg.toLowerCase()
        ) {
          throw new Error(
            `Repository URL "${rawInput}" belongs to organization "${org}", but source organization is "${expectedSourceOrg}".`,
          );
        }
        return { org, name };
      } else if (parts.length === 1) {
        return { org: null, name: parts[0] ?? '' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to parse repository URL "${rawInput}": ${sanitizeDiagnostics(msg)}`,
        { cause: err },
      );
    }
  }

  const slashParts = cleaned.split('/').filter(Boolean);
  if (slashParts.length === 2) {
    const org = slashParts[0] ?? '';
    const name = slashParts[1] ?? '';
    if (
      expectedSourceOrg &&
      org.toLowerCase() !== expectedSourceOrg.toLowerCase()
    ) {
      throw new Error(
        `Repository identifier "${rawInput}" belongs to organization "${org}", but source organization is "${expectedSourceOrg}".`,
      );
    }
    return { org, name };
  } else if (slashParts.length === 1) {
    return { org: null, name: slashParts[0] ?? '' };
  }

  throw new Error(`Cannot parse repository identifier or URL: "${rawInput}"`);
}

async function fetchSourceRepositories(
  sourceOrg: string,
  options: {
    readonly includeArchived?: boolean | undefined;
    readonly excludeForks?: boolean | undefined;
    readonly sourceVisibility?: string | undefined;
    readonly repoFetcher?:
      ((org: string) => Promise<readonly SourceRepoMetadata[]>) | undefined;
  } = {},
): Promise<PartitionedRepositoriesResult> {
  const partitionOpts = { ...options, sourceOrg };
  if (options.repoFetcher) {
    const raw = await options.repoFetcher(sourceOrg);
    return partitionDiscoveredRepositories(raw, partitionOpts);
  }

  let reposFromGh: SourceRepoMetadata[] | null = null;
  try {
    const { stdout } = await execFileAsync('gh', [
      'repo',
      'list',
      sourceOrg,
      '--limit',
      '4000',
      '--json',
      'name,isArchived,isFork,visibility',
    ]);
    reposFromGh = JSON.parse(stdout) as SourceRepoMetadata[];
  } catch {
    // Proceed to REST API fallback
  }

  if (reposFromGh) {
    return partitionDiscoveredRepositories(reposFromGh, partitionOpts);
  }

  const token =
    process.env.GHEC_SOURCE_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN;

  if (!token) {
    throw new Error(
      `Failed to fetch repositories: 'gh' CLI was unsuccessful and neither GHEC_SOURCE_TOKEN nor GITHUB_TOKEN is available. ` +
        `Please authenticate 'gh auth login', set GHEC_SOURCE_TOKEN, or use --repos / --repos-file.`,
    );
  }

  const rawRepos: SourceRepoMetadata[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/orgs/${encodeURIComponent(sourceOrg)}/repos?per_page=100&page=${page}&type=all`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'ghec-consultant-suite/scope-generator',
      },
    });

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {
        // ignore
      }
      throw new Error(
        `GitHub API returned HTTP ${res.status} when listing repositories for ${sourceOrg}: ${sanitizeDiagnostics(text)}`,
      );
    }

    const data = (await res.json()) as SourceRepoMetadata[];
    if (!Array.isArray(data) || data.length === 0) break;

    rawRepos.push(...data);

    const linkHeader = res.headers.get('link') || '';
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }

  return partitionDiscoveredRepositories(rawRepos, partitionOpts);
}

export function parseGenerateScopeOptions(
  args: string[],
): GenerateScopeOptions {
  const { values } = parseArgs({
    args,
    options: {
      source: { type: 'string' },
      target: { type: 'string' },
      name: { type: 'string' },
      output: { type: 'string' },
      out: { type: 'string' },
      all: { type: 'boolean', default: false },
      'source-visibility': { type: 'string' },
      visibility: { type: 'string' },
      'exclude-forks': { type: 'boolean', default: false },
      repos: { type: 'string' },
      'repos-file': { type: 'string' },
      file: { type: 'string', short: 'f' },
      'org-only': { type: 'boolean', default: false },
      'include-archived': { type: 'boolean', default: false },
      'target-repo-prefix': { type: 'string', default: '' },
      'target-repo-suffix': { type: 'string', default: '' },
      'target-visibility': { type: 'string' },
      'lfs-strategy': { type: 'string', default: 'dual-remote-stream' },
      'use-gei': { type: 'string', default: 'true' },
      'skip-releases': { type: 'boolean', default: false },
      'mirror-push-mode': { type: 'string' },
      'target-type': { type: 'string' },
      'emu-shortcode': { type: 'string' },
      'identity-strategy': { type: 'string' },
      'identity-suffix': { type: 'string' },
      'include-org-resources': { type: 'string', default: 'true' },
      'org-items': { type: 'string' },
      'org-modules': { type: 'string' },
      'repo-modules': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const targetReposFile = values.file || values['repos-file'];
  const effectiveSourceVisibility =
    values['source-visibility'] || values.visibility;
  const effectiveOutput = values.output || values.out;

  if (!values.target || !values.target.trim()) {
    throw new Error('--target <org> is required.');
  }

  if (!values.source && !targetReposFile && !values.repos) {
    throw new Error(
      '--source <org> is required unless inferred from a repository URLs file (--file).',
    );
  }

  if (effectiveSourceVisibility) {
    parseSourceVisibilityFilter(effectiveSourceVisibility);
  }

  const orgItems = parseOrgItemsMode(values['org-items']);

  const rawVis = values['target-visibility'];
  const targetVisibility =
    rawVis === 'private' || rawVis === 'internal' || rawVis === 'public'
      ? rawVis
      : undefined;

  const rawLfs = values['lfs-strategy'];
  const lfsStrategy =
    rawLfs === 'skip' ? 'skip' : ('dual-remote-stream' as const);

  const rawMirrorMode = values['mirror-push-mode'];
  const mirrorPushMode =
    rawMirrorMode === 'fast-snapshot' || rawMirrorMode === 'full-history'
      ? rawMirrorMode
      : undefined;

  const rawTargetType = values['target-type'];
  const targetType =
    rawTargetType === 'ghec' || rawTargetType === 'emu'
      ? rawTargetType
      : undefined;

  const rawIdStrat = values['identity-strategy'];
  const identityStrategy =
    rawIdStrat === 'emu-saml' ||
    rawIdStrat === 'manual' ||
    rawIdStrat === 'pass-through'
      ? rawIdStrat
      : undefined;

  return {
    source: values.source,
    target: values.target.trim(),
    name: values.name,
    output: effectiveOutput,
    all: values.all || Boolean(effectiveSourceVisibility),
    sourceVisibility: effectiveSourceVisibility,
    excludeForks: values['exclude-forks'],
    repos: values.repos,
    file: targetReposFile,
    orgOnly: values['org-only'],
    includeArchived: values['include-archived'],
    targetRepoPrefix: values['target-repo-prefix'],
    targetRepoSuffix: values['target-repo-suffix'],
    targetVisibility,
    lfsStrategy,
    useGei: values['use-gei'] !== 'false',
    skipReleases: values['skip-releases'],
    mirrorPushMode,
    targetType,
    emuShortcode: values['emu-shortcode'],
    identityStrategy,
    identitySuffix: values['identity-suffix'],
    includeOrgResources:
      orgItems === 'none' ? false : values['include-org-resources'] !== 'false',
    orgItems,
    orgModules: values['org-modules'],
    repoModules: values['repo-modules'],
    dryRun: values['dry-run'],
  };
}

export async function executeGenerateScopeCommand(
  options: GenerateScopeOptions,
): Promise<{
  readonly scope: MigrationScope;
  readonly filePath: string | null;
}> {
  const {
    source,
    target,
    name,
    output,
    all = false,
    sourceVisibility,
    excludeForks = false,
    repos = '',
    reposFile = '',
    file = '',
    orgOnly = false,
    includeArchived = false,
    targetRepoPrefix = '',
    targetRepoSuffix = '',
    targetVisibility,
    lfsStrategy = 'dual-remote-stream',
    useGei = true,
    skipReleases = false,
    mirrorPushMode,
    targetType,
    emuShortcode,
    identityStrategy,
    identitySuffix,
    includeOrgResources = true,
    orgItems,
    orgModules,
    repoModules,
    dryRun = false,
    silent = false,
    repoFetcher,
  } = options;

  const resolvedTargetType =
    targetType === 'ghec' || targetType === 'emu' ? targetType : undefined;
  const resolvedStrategy =
    identityStrategy ??
    (resolvedTargetType === 'ghec' ? 'pass-through' : 'emu-saml');
  const rawSuffix = emuShortcode ?? identitySuffix;
  const resolvedSuffix =
    resolvedStrategy === 'emu-saml'
      ? rawSuffix !== undefined
        ? rawSuffix
          ? rawSuffix.startsWith('_')
            ? rawSuffix
            : `_${rawSuffix}`
          : undefined
        : '_gxp'
      : undefined;

  const targetReposFilePath = reposFile || file;
  let rawEntries: string[] = [];

  if (repos) {
    rawEntries = repos
      .split(/[\n,]+/)
      .map((r) => r.trim())
      .filter(Boolean);
  } else if (targetReposFilePath) {
    const content = readFileSync(resolve(targetReposFilePath), 'utf8');
    rawEntries = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  }

  let sourceOrgs = (source ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (sourceOrgs.length === 0 && rawEntries.length > 0) {
    const detectedOrgs = rawEntries
      .map((entry) => {
        try {
          return parseRepoEntry(entry, null)?.org ?? null;
        } catch {
          return null;
        }
      })
      .filter((o): o is string => Boolean(o));
    sourceOrgs = [...new Set(detectedOrgs)];
  }

  if (sourceOrgs.length === 0 || !target) {
    throw new Error(
      'Both --source and --target organization slugs are required (or inferrable from repository URLs).',
    );
  }

  const isMultiOrg = sourceOrgs.length > 1;
  const resolvedOrgItemsMode: OrgItemsMode | undefined =
    orgItems ??
    (!includeOrgResources
      ? 'none'
      : isMultiOrg
        ? 'associated-only'
        : undefined);
  const effectiveIncludeOrgResources =
    includeOrgResources && resolvedOrgItemsMode !== 'none';

  const shouldFetchAll = all || Boolean(sourceVisibility);
  const reposByOrg = new Map<string, string[]>();
  const archivedNamesByOrg = new Map<string, ReadonlySet<string>>();
  const skippedArchivedRepositories: SkippedArchivedRepository[] = [];
  for (const srcOrg of sourceOrgs) {
    reposByOrg.set(srcOrg, []);
  }

  if (rawEntries.length > 0) {
    if (sourceOrgs.length === 1) {
      const singleOrg = sourceOrgs[0]!;
      const names = rawEntries
        .map((entry) => parseRepoEntry(entry, singleOrg))
        .filter((p): p is ParsedRepoEntry => p !== null)
        .map((p) => p.name);
      reposByOrg.set(singleOrg, [...new Set(names)]);
    } else {
      const canonicalOrgByLower = new Map(
        sourceOrgs.map((o) => [o.toLowerCase(), o] as const),
      );
      for (const entry of rawEntries) {
        const parsed = parseRepoEntry(entry, null);
        if (!parsed) continue;
        if (!parsed.org) {
          throw new Error(
            `Repository entry "${entry}" must include its source organization (e.g. "org/repo" or full URL) when consolidating multiple source organizations (${sourceOrgs.join(', ')}).`,
          );
        }
        const matchedOrg = canonicalOrgByLower.get(parsed.org.toLowerCase());
        if (!matchedOrg) {
          throw new Error(
            `Repository "${entry}" belongs to organization "${parsed.org}", which is not in --source (${sourceOrgs.join(', ')}).`,
          );
        }
        const list = reposByOrg.get(matchedOrg) ?? [];
        if (!list.includes(parsed.name)) {
          list.push(parsed.name);
        }
        reposByOrg.set(matchedOrg, list);
      }
    }
  } else if (shouldFetchAll) {
    const visLabel =
      sourceVisibility && sourceVisibility.toLowerCase() !== 'all'
        ? ` (visibility: ${sourceVisibility})`
        : '';
    for (const srcOrg of sourceOrgs) {
      if (!silent) {
        console.log(
          `Discovering repositories for source organization '${srcOrg}'${visLabel}...`,
        );
      }
      const partitioned = await fetchSourceRepositories(srcOrg, {
        includeArchived,
        excludeForks,
        sourceVisibility,
        repoFetcher,
      });
      if (!silent) {
        console.log(
          `Discovered ${partitioned.matched.length} repository/repositories in '${srcOrg}'.`,
        );
      }
      reposByOrg.set(srcOrg, [...new Set(partitioned.matched)]);
      archivedNamesByOrg.set(srcOrg, partitioned.archivedNames);
      skippedArchivedRepositories.push(...partitioned.skippedArchived);
    }
  } else if (!orgOnly) {
    throw new Error(
      'No repositories specified. Please specify --file <urls-file>, --all, --source-visibility <public|private|internal>, --repos <list>, or --org-only.',
    );
  }

  const visSuffix =
    sourceVisibility && sourceVisibility.toLowerCase() !== 'all'
      ? `-${sourceVisibility.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      : '';
  const primarySourceLabel = isMultiOrg ? 'multi-org' : sourceOrgs[0]!;
  const resolvedName =
    name ||
    (orgOnly
      ? `${primarySourceLabel}-to-${target}-org`
      : shouldFetchAll
        ? `${primarySourceLabel}-to-${target}-${visSuffix ? visSuffix.slice(1) : 'all'}`
        : `${primarySourceLabel}-to-${target}-wave`);

  const parsedOrgModules = orgModules
    ? orgModules
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : [];
  const resolvedOrgModules = effectiveIncludeOrgResources
    ? parsedOrgModules.length > 0
      ? parsedOrgModules.some((m) => m.toLowerCase() === 'all')
        ? [...ALL_ORGANIZATION_MODULES]
        : parsedOrgModules
      : [...DEFAULT_ORG_MODULES]
    : [];

  const organizations = sourceOrgs.map((srcOrg) => ({
    source: srcOrg,
    target,
    ...(resolvedTargetType ? { targetType: resolvedTargetType } : {}),
    ...(resolvedOrgItemsMode ? { orgItemsMode: resolvedOrgItemsMode } : {}),
    modules: resolvedOrgModules,
  }));

  const parsedRepoModules = repoModules
    ? repoModules
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : [];
  const resolvedRepoModules =
    parsedRepoModules.length > 0
      ? parsedRepoModules.some((m) => m.toLowerCase() === 'all')
        ? [...ALL_REPOSITORY_MODULES]
        : parsedRepoModules
      : [...DEFAULT_REPO_MODULES];

  // Detect any colliding target repository names across multiple source organizations
  const candidateTargetNameCounts = new Map<string, number>();
  for (const srcOrg of sourceOrgs) {
    const prefix = targetRepoPrefix.replace(/\{source\}/g, srcOrg);
    const suffix = targetRepoSuffix.replace(/\{source\}/g, srcOrg);
    for (const repoName of reposByOrg.get(srcOrg) ?? []) {
      const candidate = `${prefix}${repoName}${suffix}`.toLowerCase();
      candidateTargetNameCounts.set(
        candidate,
        (candidateTargetNameCounts.get(candidate) ?? 0) + 1,
      );
    }
  }

  const repositoryMappings: Array<{
    sourceOrg: string;
    sourceRepo: string;
    targetOrg: string;
    targetRepo: string;
    useGei: boolean;
    archived?: boolean;
    skipReleases: boolean;
    lfsStrategy: 'dual-remote-stream' | 'skip';
    modules: string[];
    targetRepoVisibility?: 'private' | 'internal' | 'public';
    mirrorPushMode?: 'fast-snapshot' | 'full-history';
  }> = [];

  for (const srcOrg of sourceOrgs) {
    const prefix = targetRepoPrefix.replace(/\{source\}/g, srcOrg);
    const suffix = targetRepoSuffix.replace(/\{source\}/g, srcOrg);
    const archivedSet = archivedNamesByOrg.get(srcOrg);
    for (const repoName of reposByOrg.get(srcOrg) ?? []) {
      let targetRepoName = `${prefix}${repoName}${suffix}`;
      if (
        isMultiOrg &&
        (candidateTargetNameCounts.get(targetRepoName.toLowerCase()) ?? 0) > 1
      ) {
        targetRepoName = `${srcOrg}-${targetRepoName}`;
      }
      const isRepoArchived = archivedSet?.has(repoName) ?? false;
      repositoryMappings.push({
        sourceOrg: srcOrg,
        sourceRepo: repoName,
        targetOrg: target,
        targetRepo: targetRepoName,
        useGei: Boolean(useGei),
        ...(isRepoArchived ? { archived: true } : {}),
        skipReleases: Boolean(skipReleases),
        lfsStrategy,
        modules: resolvedRepoModules,
        ...(targetVisibility ? { targetRepoVisibility: targetVisibility } : {}),
        ...(mirrorPushMode === 'fast-snapshot' ||
        mirrorPushMode === 'full-history'
          ? { mirrorPushMode }
          : {}),
      });
    }
  }

  const scopeCandidate = {
    version: MIGRATION_SCHEMA_VERSION,
    name: resolvedName,
    ...(resolvedTargetType ? { targetType: resolvedTargetType } : {}),
    ...(resolvedOrgItemsMode ? { orgItemsMode: resolvedOrgItemsMode } : {}),
    ...(mirrorPushMode === 'fast-snapshot' || mirrorPushMode === 'full-history'
      ? { mirrorPushMode }
      : {}),
    organizations,
    repositories: repositoryMappings,
    ...(skippedArchivedRepositories.length > 0
      ? { skippedArchivedRepositories }
      : {}),
    identityMapping: {
      strategy: resolvedStrategy,
      ...(resolvedStrategy === 'emu-saml' && resolvedSuffix
        ? { suffix: resolvedSuffix }
        : {}),
    },
  };

  const validation = validateMigrationScope(scopeCandidate);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n - ');
    throw new Error(`Generated scope failed schema validation:\n - ${issues}`);
  }

  const jsonString = JSON.stringify(validation.data, null, 2) + '\n';

  if (dryRun) {
    if (!silent) {
      console.log(jsonString);
    }
    return { scope: validation.data, filePath: null };
  }

  const outputPath = resolve(output || `scopes/${resolvedName}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, jsonString, 'utf8');

  if (!silent) {
    console.log(
      `Successfully generated migration scope (${validation.data.repositories.length} repos): ${outputPath}`,
    );
  }
  return { scope: validation.data, filePath: outputPath };
}

export function parseValidateScopeOptions(
  args: string[],
): ValidateScopeOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      scope: { type: 'string' },
      'target-type': { type: 'string' },
      'emu-shortcode': { type: 'string' },
      'mirror-push-mode': { type: 'string' },
      'org-items': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });

  const scopePath = (values.scope || positionals[0] || '').trim();
  if (!scopePath) {
    throw new Error('Scope file path is required (--scope <file> or <file>).');
  }

  const rawTargetType = values['target-type'];
  const targetType =
    rawTargetType === 'ghec' || rawTargetType === 'emu'
      ? rawTargetType
      : undefined;

  const rawMirrorMode = values['mirror-push-mode'];
  const mirrorPushMode =
    rawMirrorMode === 'fast-snapshot' || rawMirrorMode === 'full-history'
      ? rawMirrorMode
      : undefined;

  const orgItems = parseOrgItemsMode(values['org-items']);

  return {
    scopePath,
    targetType,
    emuShortcode: values['emu-shortcode'],
    mirrorPushMode,
    orgItems,
  };
}

export function executeValidateScopeCommand(options: ValidateScopeOptions): {
  readonly scope: MigrationScope;
  readonly filePath: string;
} {
  const resolvedPath = resolve(options.scopePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Scope file '${options.scopePath}' does not exist.`);
  }

  const rawContent = readFileSync(resolvedPath, 'utf8');
  const parsed = JSON.parse(rawContent) as Record<string, unknown>;

  let modified = false;
  if (options.targetType === 'ghec' || options.targetType === 'emu') {
    parsed.targetType = options.targetType;
    if (Array.isArray(parsed.organizations)) {
      for (const org of parsed.organizations as Array<
        Record<string, unknown>
      >) {
        org.targetType = options.targetType;
      }
    }
    if (options.targetType === 'ghec') {
      parsed.identityMapping = { strategy: 'pass-through' };
    } else if (options.targetType === 'emu' && options.emuShortcode?.trim()) {
      const code = options.emuShortcode.trim();
      const normalizedSuffix = code.startsWith('_') ? code : `_${code}`;
      parsed.identityMapping = {
        strategy: 'emu-saml',
        suffix: normalizedSuffix,
      };
    }
    modified = true;
  }

  if (
    options.mirrorPushMode === 'fast-snapshot' ||
    options.mirrorPushMode === 'full-history'
  ) {
    parsed.mirrorPushMode = options.mirrorPushMode;
    if (Array.isArray(parsed.repositories)) {
      for (const repo of parsed.repositories as Array<
        Record<string, unknown>
      >) {
        repo.mirrorPushMode = options.mirrorPushMode;
        if (repo.options && typeof repo.options === 'object') {
          (repo.options as Record<string, unknown>).mirrorPushMode =
            options.mirrorPushMode;
        }
      }
    }
    modified = true;
  }

  if (options.orgItems) {
    parsed.orgItemsMode = options.orgItems;
    if (Array.isArray(parsed.organizations)) {
      for (const org of parsed.organizations as Array<
        Record<string, unknown>
      >) {
        org.orgItemsMode = options.orgItems;
        if (options.orgItems === 'none') {
          org.modules = [];
        }
      }
    }
    modified = true;
  }

  if (modified) {
    writeFileSync(resolvedPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  }

  const validation = validateMigrationScope(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Scope schema validation failed: ${issues}`);
  }

  console.log(
    `Scope schema validation passed successfully: ${options.scopePath} (${validation.data.repositories.length} repo(s), targetType=${validation.data.targetType ?? 'default'}).`,
  );

  return { scope: validation.data, filePath: resolvedPath };
}
