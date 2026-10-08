import type { DestinationAssessment } from '@ghec/contracts';
import type {
  DestinationInspectorOptions,
  RulesetBypassActor,
} from './types.js';
import type { GitHubRuleset } from '../modules/rulesets/types.js';

interface GitHubOrgDetails {
  login?: string | undefined;
  advanced_security_enabled_for_new_repositories?: boolean | undefined;
}

export interface DetailedDestinationAssessment extends DestinationAssessment {
  readonly rulesetBypassIssues: readonly string[];
}

/**
 * Checks whether a bypass actor matches the "Repository migrations" actor in "exempt" mode.
 */
export function isRepositoryMigrationsExemptBypass(
  actor: RulesetBypassActor,
): boolean {
  const actorName = (actor.actor_name ?? actor.name ?? '').toLowerCase();
  const actorType = (actor.actor_type ?? '').toLowerCase();

  const isRepoMigrationsActor =
    actorName === 'repository migrations' ||
    actorType === 'repository migrations' ||
    actorType === 'repositorymigrations' ||
    (actorType === 'integration' &&
      (actorName === 'repository migrations' || actor.actor_id === 1));

  if (!isRepoMigrationsActor) {
    return false;
  }

  // Must strictly be 'exempt' (not 'always' or 'always_allow')
  const bypassMode = (actor.bypass_mode ?? '').toLowerCase();
  return bypassMode === 'exempt';
}

export class DestinationBlockerInspector {
  private readonly adapter: DestinationInspectorOptions['adapter'];
  private readonly targetOrg: string;
  private readonly scopedRepos: readonly string[];
  private readonly signal: AbortSignal | undefined;

  constructor(options: DestinationInspectorOptions) {
    this.adapter = options.adapter;
    this.targetOrg = options.targetOrg;
    this.scopedRepos = options.scopedRepos;
    this.signal = options.signal;
  }

  /**
   * Evaluates destination rulesets, repository naming collisions, IP allowlist, and GHAS status.
   */
  async inspect(): Promise<DetailedDestinationAssessment> {
    const signal = this.signal ?? new AbortController().signal;

    // 1. IP Allowlist and Org reachability probe
    let ipAllowListReachable = true;
    let ghasEnabled = false;

    try {
      const orgRes = await this.adapter.readSingle<GitHubOrgDetails>(
        {
          id: 'rest.orgs.get',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}',
          pathParams: { org: this.targetOrg },
        },
        signal,
      );

      if (orgRes.status === 403) {
        // Typically indicates IP allowlist blockage or permission denial
        ipAllowListReachable = false;
      } else if (orgRes.status === 200 && orgRes.data) {
        ghasEnabled =
          orgRes.data.advanced_security_enabled_for_new_repositories ?? true;
      }
    } catch {
      ipAllowListReachable = false;
    }

    // 2. Rulesets and "Repository migrations" Exempt bypass check
    let rulesetBypassConfigured = true;
    const rulesetBypassIssues: string[] = [];

    try {
      const rulesetsRes = await this.adapter.fetchAll<GitHubRuleset>(
        {
          id: 'rest.orgs.getRulesets',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/rulesets',
          pathParams: { org: this.targetOrg },
          queryParams: { per_page: 100 },
        },
        signal,
      );

      if (rulesetsRes.items && rulesetsRes.items.length > 0) {
        for (const ruleset of rulesetsRes.items) {
          if (ruleset.enforcement === 'active') {
            let bypassActors = ruleset.bypass_actors;

            // If bypass_actors not returned in summary list, fetch detailed ruleset
            if (!bypassActors) {
              try {
                const detailRes = await this.adapter.readSingle<GitHubRuleset>(
                  {
                    id: 'rest.orgs.getRuleset',
                    transport: 'rest',
                    verifiedReadOnly: true,
                    path: '/orgs/{org}/rulesets/{ruleset_id}',
                    pathParams: {
                      org: this.targetOrg,
                      ruleset_id: String(ruleset.id),
                    },
                  },
                  signal,
                );
                bypassActors = detailRes.data?.bypass_actors;
              } catch {
                bypassActors = [];
              }
            }

            const hasExemptBypass = (bypassActors ?? []).some(
              isRepositoryMigrationsExemptBypass,
            );

            if (!hasExemptBypass) {
              rulesetBypassConfigured = false;
              rulesetBypassIssues.push(
                `Active ruleset "${ruleset.name}" (ID ${ruleset.id}) lacks "Repository migrations" bypass in Exempt mode.`,
              );
            }
          }
        }
      }
    } catch {
      // If fetching rulesets fails (e.g. no permission or network), flag as unverified
      rulesetBypassConfigured = false;
      rulesetBypassIssues.push(
        `Unable to query rulesets on destination organization "${this.targetOrg}".`,
      );
    }

    // 3. Name collision check against scoped repositories
    const nameConflicts: string[] = [];

    let checkedViaOrgListing = false;
    try {
      const reposRes = await this.adapter.fetchAll<{ name?: string }>(
        {
          id: 'rest.repos.listForOrg',
          transport: 'rest',
          verifiedReadOnly: true,
          path: '/orgs/{org}/repos',
          pathParams: { org: this.targetOrg },
          queryParams: { per_page: 100 },
        },
        signal,
      );

      if (reposRes.complete && reposRes.items.length > 0) {
        checkedViaOrgListing = true;
        const existingNames = new Set(
          reposRes.items
            .map((r) => (r.name ?? '').toLowerCase())
            .filter(Boolean),
        );
        for (const repo of this.scopedRepos) {
          if (existingNames.has(repo.toLowerCase())) {
            nameConflicts.push(repo);
          }
        }
      }
    } catch {
      // Org repo listing might not be supported or allowed; fall back to individual checks
    }

    if (!checkedViaOrgListing) {
      for (const repo of this.scopedRepos) {
        try {
          const repoRes = await this.adapter.readSingle<{
            id?: number | undefined;
          }>(
            {
              id: 'rest.repos.get',
              transport: 'rest',
              verifiedReadOnly: true,
              path: '/repos/{owner}/{repo}',
              pathParams: { owner: this.targetOrg, repo },
            },
            signal,
          );

          if (repoRes.status === 200) {
            nameConflicts.push(repo);
          }
        } catch {
          // Not found is expected for target repos
        }
      }
    }

    return {
      rulesetBypassConfigured,
      ipAllowListReachable,
      ghasEnabled,
      nameConflicts,
      rulesetBypassIssues,
    };
  }
}
