#!/usr/bin/env node

/**
 * Migration Scope Generator
 *
 * Generates schema-compliant migration scope JSON files for GitHub Enterprise Importer (GEI)
 * and the GHEC migration suite. Supports discovering all repositories in an organization
 * via GitHub CLI (gh) or REST API, or accepting an explicit repository list or file.
 *
 * Zero-Local-Secrets: Uses ambient 'gh' authentication or standard environment tokens
 * without logging or persisting credentials.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MIGRATION_SCHEMA_VERSION,
  validateMigrationScope,
} from '@ghec/contracts';

const execFileAsync = promisify(execFile);

const DEFAULT_ORG_MODULES = [
  'org-variables',
  'org-secrets',
  'teams',
  'org-custom-properties',
  'webhooks',
];

const DEFAULT_REPO_MODULES = [
  'repo-variables',
  'repo-secrets',
  'repo-settings',
  'repo-custom-properties',
  'rulesets',
  'branch-protection',
  'environments',
  'webhooks',
];

function printUsage() {
  console.log(`
Usage: node scripts/generate-scope.mjs [options]

Repository Selection (choose at least one):
  --all                        Fetch all non-archived repositories from source organization
  --repos-file, -f <path>      Path to a file containing repository URLs or names (one per line)
  --repos <list>               Comma-separated list of repository URLs or names
  --org-only                   Generate scope for organization-level resources only (no repositories)

Configuration Options:
  --name <scopeName>           Name of the scope (defaults to <source>-to-<target>-<mode>)
  --output <path>              Output file path (defaults to scopes/<name>.json)
  --include-archived           Include archived repositories when using --all (default: false)
  --target-repo-prefix <str>   Prefix to prepend to target repository names (default: "")
  --target-repo-suffix <str>   Suffix to append to target repository names (default: "")
  --target-visibility <vis>    Force target visibility ('private', 'internal', or 'public')
  --lfs-strategy <strategy>    LFS migration strategy: 'dual-remote-stream' or 'skip' (default: 'dual-remote-stream')
  --use-gei <true|false>       Whether to use GitHub Enterprise Importer (default: true)
  --skip-releases              Skip release asset migration fallback (default: false)
  --identity-strategy <strat>  Identity mapping strategy: 'emu-saml', 'manual', 'pass-through' (default: 'emu-saml')
  --identity-suffix <suffix>   EMU identity suffix (default: '_gxp')
  --include-org-resources      Include org-level migration modules (default: true)
  --org-modules <list>         Comma-separated list of org modules to include
  --repo-modules <list>        Comma-separated list of repo modules to include
  --dry-run                    Print the generated JSON to stdout without writing to disk
  --help, -h                   Show this help message

Examples:
  # Generate from a file containing repository URLs (supports hundreds of URLs):
  node scripts/generate-scope.mjs --source example-source-org --target example-target-emu --file wave1-urls.txt

  # Generate a scope for all repositories in source organization:
  node scripts/generate-scope.mjs --source example-source-org --target example-target-emu --all

  # Generate a wave scope for specific repository URLs:
  node scripts/generate-scope.mjs --source example-source-org --target example-target-emu --repos https://github.com/example-source-org/repo-1,https://github.com/example-source-org/repo-2
`);
}

/**
 * Fetches repository list from GitHub using gh CLI or GitHub REST API.
 */
async function fetchSourceRepositories(sourceOrg, includeArchived = false) {
  // 1. Try GitHub CLI (gh) first
  let reposFromGh = null;
  try {
    const { stdout } = await execFileAsync('gh', [
      'repo',
      'list',
      sourceOrg,
      '--limit',
      '4000',
      '--json',
      'name,isArchived',
    ]);
    reposFromGh = JSON.parse(stdout);
  } catch {
    // gh CLI not available or not logged in, proceed to REST API fallback
  }

  if (reposFromGh) {
    return reposFromGh
      .filter((r) => includeArchived || !r.isArchived)
      .map((r) => r.name);
  }

  // 2. Fall back to GitHub REST API if token available
  const token =
    process.env.GHEC_SOURCE_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN;

  if (!token) {
    throw new Error(
      `Failed to fetch repositories: 'gh' CLI was unsuccessful and neither GHEC_SOURCE_TOKEN nor GITHUB_TOKEN is available.\n` +
        `Please authenticate 'gh auth login', set GHEC_SOURCE_TOKEN, or use --repos / --repos-file.`,
    );
  }

  const repos = [];
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
        // ignore text read failure
      }
      throw new Error(
        `GitHub API returned HTTP ${res.status} when listing repositories for ${sourceOrg}: ${text}`,
      );
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const repo of data) {
      if (includeArchived || !repo.archived) {
        repos.push(repo.name);
      }
    }

    const linkHeader = res.headers.get('link') || '';
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }

  return repos;
}

/**
 * Parses a repository input which can be a full URL (HTTPS/SSH), an org/repo slug,
 * or a plain repository name.
 */
export function parseRepoEntry(rawInput, expectedSourceOrg) {
  let cleaned = rawInput.trim();
  if (!cleaned || cleaned.startsWith('#')) return null;

  // Strip query params and hash fragments
  cleaned = cleaned.replace(/[?#].*$/, '');

  // Remove trailing .git
  if (cleaned.endsWith('.git')) {
    cleaned = cleaned.slice(0, -4);
  }
  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');

  // Format: git@host:org/repo or ssh://git@host/org/repo
  const sshMatch = cleaned.match(
    /^(?:ssh:\/\/)?git@[^:/]+[:/]([^/]+)\/([^/]+)$/,
  );
  if (sshMatch) {
    const org = sshMatch[1];
    const name = sshMatch[2];
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

  // Format: https://host/org/repo or http://...
  if (cleaned.includes('://')) {
    try {
      const url = new URL(cleaned);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const org = parts[parts.length - 2];
        const name = parts[parts.length - 1];
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
        return { org: null, name: parts[0] };
      }
    } catch (err) {
      throw new Error(
        `Failed to parse repository URL "${rawInput}": ${err.message}`,
        { cause: err },
      );
    }
  }

  // Format: org/repo or repo
  const slashParts = cleaned.split('/').filter(Boolean);
  if (slashParts.length === 2) {
    const org = slashParts[0];
    const name = slashParts[1];
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
    return { org: null, name: slashParts[0] };
  }

  throw new Error(`Cannot parse repository identifier or URL: "${rawInput}"`);
}

export async function generateScope(options) {
  const {
    source,
    target,
    name,
    output,
    all = false,
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
    identityStrategy = 'emu-saml',
    identitySuffix = '_gxp',
    includeOrgResources = true,
    orgModules,
    repoModules,
    dryRun = false,
    silent = false,
  } = options;

  const targetReposFilePath = reposFile || file;
  let rawEntries = [];

  if (repos) {
    rawEntries = repos
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  } else if (targetReposFilePath) {
    const content = readFileSync(resolve(targetReposFilePath), 'utf8');
    rawEntries = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }

  let resolvedSource = source?.trim() || '';

  // If source was not passed explicitly, attempt to infer it from the URLs in the file/list
  if (!resolvedSource && rawEntries.length > 0) {
    const detectedOrgs = rawEntries
      .map((entry) => {
        try {
          return parseRepoEntry(entry, null)?.org;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const uniqueOrgs = [...new Set(detectedOrgs)];
    if (uniqueOrgs.length === 1) {
      resolvedSource = uniqueOrgs[0];
    } else if (uniqueOrgs.length > 1) {
      throw new Error(
        `Multiple source organizations detected in repository list (${uniqueOrgs.join(', ')}). ` +
          `A single scope must target a single source organization. Please specify --source explicitly.`,
      );
    }
  }

  if (!resolvedSource || !target) {
    throw new Error(
      'Both --source and --target organization slugs are required (or inferrable from repository URLs).',
    );
  }

  // Resolve repository list
  let repoNames = [];

  if (rawEntries.length > 0) {
    repoNames = rawEntries
      .map((entry) => parseRepoEntry(entry, resolvedSource))
      .filter(Boolean)
      .map((p) => p.name);
  } else if (all) {
    if (!silent) {
      console.log(
        `Discovering repositories for source organization '${resolvedSource}'...`,
      );
    }
    repoNames = await fetchSourceRepositories(resolvedSource, includeArchived);
    if (!silent) {
      console.log(`Discovered ${repoNames.length} repository/repositories.`);
    }
  } else if (!orgOnly) {
    throw new Error(
      'No repositories specified. Please specify --file <urls-file>, --all, --repos <list>, or --org-only.',
    );
  }

  // De-duplicate repo names while preserving order
  repoNames = [...new Set(repoNames)];

  const resolvedName =
    name ||
    (orgOnly
      ? `${resolvedSource}-to-${target}-org`
      : all
        ? `${resolvedSource}-to-${target}-all`
        : `${resolvedSource}-to-${target}-wave`);

  // Build organization mapping
  const resolvedOrgModules = includeOrgResources
    ? orgModules
      ? orgModules
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
      : DEFAULT_ORG_MODULES
    : [];

  const orgMapping = {
    source: resolvedSource,
    target,
    modules: resolvedOrgModules,
  };

  // Build repository mappings
  const resolvedRepoModules = repoModules
    ? repoModules
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : DEFAULT_REPO_MODULES;

  const repositoryMappings = repoNames.map((repoName) => {
    const targetRepoName = `${targetRepoPrefix}${repoName}${targetRepoSuffix}`;
    const mapping = {
      sourceOrg: resolvedSource,
      sourceRepo: repoName,
      targetOrg: target,
      targetRepo: targetRepoName,
      useGei: Boolean(useGei),
      skipReleases: Boolean(skipReleases),
      lfsStrategy,
      modules: resolvedRepoModules,
    };

    if (targetVisibility) {
      mapping.targetRepoVisibility = targetVisibility;
    }

    return mapping;
  });

  // Build scope object
  const scope = {
    version: MIGRATION_SCHEMA_VERSION,
    name: resolvedName,
    organizations: [orgMapping],
    repositories: repositoryMappings,
    identityMapping: {
      strategy: identityStrategy,
      ...(identityStrategy === 'emu-saml' && identitySuffix
        ? { suffix: identitySuffix }
        : {}),
    },
  };

  // Schema Validation
  const validation = validateMigrationScope(scope);
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
      `Successfully generated migration scope (${scope.repositories.length} repos): ${outputPath}`,
    );
  }
  return { scope: validation.data, filePath: outputPath };
}

// CLI Execution Entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { values } = parseArgs({
      options: {
        source: { type: 'string' },
        target: { type: 'string' },
        name: { type: 'string' },
        output: { type: 'string' },
        all: { type: 'boolean', default: false },
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
        'identity-strategy': { type: 'string', default: 'emu-saml' },
        'identity-suffix': { type: 'string', default: '_gxp' },
        'include-org-resources': { type: 'string', default: 'true' },
        'org-modules': { type: 'string' },
        'repo-modules': { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: false,
      strict: true,
    });

    if (values.help) {
      printUsage();
      process.exit(0);
    }

    const targetReposFile = values.file || values['repos-file'];

    if (!values.target) {
      console.error('Error: --target organization is required.');
      printUsage();
      process.exit(1);
    }

    if (!values.source && !targetReposFile) {
      console.error(
        'Error: --source organization is required unless inferred from a repository URLs file (--file).',
      );
      printUsage();
      process.exit(1);
    }

    const useGei = values['use-gei'] !== 'false';
    const includeOrgResources = values['include-org-resources'] !== 'false';

    await generateScope({
      source: values.source,
      target: values.target,
      name: values.name,
      output: values.output,
      all: values.all,
      repos: values.repos,
      file: targetReposFile,
      orgOnly: values['org-only'],
      includeArchived: values['include-archived'],
      targetRepoPrefix: values['target-repo-prefix'],
      targetRepoSuffix: values['target-repo-suffix'],
      targetVisibility: values['target-visibility'],
      lfsStrategy: values['lfs-strategy'],
      useGei,
      skipReleases: values['skip-releases'],
      identityStrategy: values['identity-strategy'],
      identitySuffix: values['identity-suffix'],
      includeOrgResources,
      orgModules: values['org-modules'],
      repoModules: values['repo-modules'],
      dryRun: values['dry-run'],
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
