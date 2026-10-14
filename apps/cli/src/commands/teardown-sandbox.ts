import { parseArgs } from 'node:util';
import {
  ORCHESTRATOR_SCHEMA_VERSION,
  type TeardownManifest,
  type TeardownTarget,
} from '@ghec/contracts';
import { sanitizeDiagnostics } from '@ghec/github-client';

export interface TeardownOptions {
  readonly org: string;
  readonly prefix: string;
  readonly dryRun: boolean;
  readonly confirm: boolean;
  readonly token?: string | undefined;
  readonly verbose?: boolean | undefined;
}

export function parseTeardownOptions(args: string[]): TeardownOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      org: { type: 'string' },
      prefix: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      confirm: { type: 'boolean', default: false },
      token: { type: 'string' },
      verbose: { type: 'boolean', default: false },
    },
  });

  if (!values.org || !values.org.trim()) {
    throw new Error('The --org <organization> flag is required.');
  }

  const prefix = values.prefix?.trim() ?? '';
  validatePrefixFilter(prefix);

  return {
    org: values.org.trim(),
    prefix,
    dryRun: values['dry-run'] ?? false,
    confirm: values.confirm ?? false,
    token: values.token || process.env.GHEC_TARGET_TOKEN,
    verbose: values.verbose,
  };
}

export function validatePrefixFilter(prefix: string): void {
  if (prefix.includes('*') || prefix.includes('%')) {
    throw new Error(
      `Safety Violation: prefixFilter "${prefix}" contains wildcards. Explicit prefix required.`,
    );
  }
  if (!prefix || prefix.length < 3) {
    throw new Error(
      `Safety Violation: prefixFilter "${prefix}" is too short. Minimum 3 characters required (e.g. "dummy-", "demo-").`,
    );
  }
  const disallowed = ['all', 'org', 'repo', 'test'];
  if (disallowed.includes(prefix.toLowerCase())) {
    throw new Error(
      `Safety Violation: prefixFilter "${prefix}" is too generic. Explicit prefix required.`,
    );
  }
}

interface GitHubRepoItem {
  readonly name: string;
}

interface GitHubTeamItem {
  readonly name: string;
  readonly slug: string;
}

export async function executeTeardownSandbox(
  options: TeardownOptions,
): Promise<TeardownManifest> {
  validatePrefixFilter(options.prefix);

  if (!options.dryRun && !options.confirm) {
    throw new Error(
      'Safety Violation: Live target sandbox teardown requires explicit --confirm flag.',
    );
  }

  const token = options.token || process.env.GHEC_TARGET_TOKEN;
  if (!token && !options.dryRun) {
    throw new Error(
      'Authentication Error: Target administrative token (GHEC_TARGET_TOKEN or --token) is required for teardown.',
    );
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ghec-consultant-suite/teardown',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const discoveredTargets: TeardownTarget[] = [];
  let totalRetained = 0;

  if (token) {
    // 1. Discover matching repositories
    try {
      const res = await fetch(
        `https://api.github.com/orgs/${encodeURIComponent(options.org)}/repos?per_page=100`,
        { headers },
      );
      if (res.ok) {
        const repos = (await res.json()) as GitHubRepoItem[];
        for (const repo of repos) {
          if (repo.name.startsWith(options.prefix)) {
            discoveredTargets.push({
              type: 'repository',
              identifier: repo.name,
              status: 'pending',
            });
          } else {
            totalRetained++;
          }
        }
      }
    } catch (err) {
      if (options.verbose) {
        console.warn(
          `Failed to list repositories in ${options.org}: ${sanitizeDiagnostics(String(err))}`,
        );
      }
    }

    // 2. Discover matching teams
    try {
      const res = await fetch(
        `https://api.github.com/orgs/${encodeURIComponent(options.org)}/teams?per_page=100`,
        { headers },
      );
      if (res.ok) {
        const teams = (await res.json()) as GitHubTeamItem[];
        for (const team of teams) {
          if (
            team.name.startsWith(options.prefix) ||
            team.slug.startsWith(options.prefix)
          ) {
            discoveredTargets.push({
              type: 'team',
              identifier: team.slug,
              status: 'pending',
            });
          } else {
            totalRetained++;
          }
        }
      }
    } catch (err) {
      if (options.verbose) {
        console.warn(
          `Failed to list teams in ${options.org}: ${sanitizeDiagnostics(String(err))}`,
        );
      }
    }
  }

  // Execute deletion or simulate in dry-run
  const finalTargets: TeardownTarget[] = [];
  let totalPurged = 0;

  for (const target of discoveredTargets) {
    if (options.dryRun) {
      finalTargets.push({
        ...target,
        status: 'skipped',
      });
      continue;
    }

    if (!token) continue;

    try {
      if (target.type === 'repository') {
        const delRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(options.org)}/${encodeURIComponent(target.identifier)}`,
          { method: 'DELETE', headers },
        );
        if (delRes.status === 204 || delRes.status === 200) {
          finalTargets.push({
            ...target,
            status: 'deleted',
          });
          totalPurged++;
        } else {
          finalTargets.push({
            ...target,
            status: 'failed',
            error: `HTTP ${delRes.status}`,
          });
        }
      } else if (target.type === 'team') {
        const delRes = await fetch(
          `https://api.github.com/orgs/${encodeURIComponent(options.org)}/teams/${encodeURIComponent(target.identifier)}`,
          { method: 'DELETE', headers },
        );
        if (delRes.status === 204 || delRes.status === 200) {
          finalTargets.push({
            ...target,
            status: 'deleted',
          });
          totalPurged++;
        } else {
          finalTargets.push({
            ...target,
            status: 'failed',
            error: `HTTP ${delRes.status}`,
          });
        }
      }
    } catch (err) {
      finalTargets.push({
        ...target,
        status: 'failed',
        error: sanitizeDiagnostics(
          err instanceof Error ? err.message : String(err),
        ),
      });
    }
  }

  return {
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    targetOrg: options.org,
    prefixFilter: options.prefix,
    dryRun: options.dryRun,
    discoveredAt: new Date().toISOString(),
    totalDiscovered: finalTargets.length,
    totalPurged: options.dryRun ? 0 : totalPurged,
    totalRetained,
    targets: finalTargets,
  };
}
