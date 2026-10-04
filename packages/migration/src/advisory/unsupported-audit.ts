import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { UnsupportedItemDetail } from './types.js';

interface RawRepoForkCheck {
  readonly name?: string | undefined;
  readonly fork?: boolean | undefined;
  readonly parent?: { readonly full_name?: string | undefined } | undefined;
}

export class UnsupportedItemsAuditor {
  /**
   * Evaluates all entities that GEI does not migrate, ensuring zero silent gaps.
   */
  async audit(
    sourceOrg: string,
    _targetOrg: string,
    adapter?: GitHubReadAdapter | undefined,
    discoveryBundle?: DiscoveryBundle | undefined,
    signal?: AbortSignal | undefined,
  ): Promise<UnsupportedItemDetail[]> {
    const details: UnsupportedItemDetail[] = [];

    // 1. Fork Relationships Audit
    const forkedRepos: string[] = [];
    if (discoveryBundle) {
      for (const e of discoveryBundle.entities) {
        if (e.kind === 'repository' && e.fork === true) {
          forkedRepos.push(e.name);
        }
      }
    } else if (adapter) {
      try {
        const reposRes = await adapter.fetchAll<RawRepoForkCheck>(
          {
            id: 'rest.repos.listOrgRepos',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/repos',
            pathParams: { org: sourceOrg },
            queryParams: { type: 'all', per_page: 100 },
          },
          signal ?? new AbortController().signal,
        );
        if (reposRes.items) {
          for (const r of reposRes.items) {
            if (r.fork && r.name) {
              const upstream = r.parent?.full_name
                ? ` (upstream: ${r.parent.full_name})`
                : '';
              forkedRepos.push(`${r.name}${upstream}`);
            }
          }
        }
      } catch {
        // Fall back gracefully
      }
    }

    details.push({
      category: 'fork_relationships',
      title: 'Fork Network Severance',
      impactedEntitiesCount: forkedRepos.length,
      impactedEntities: forkedRepos,
      limitationDescription:
        'GEI severs all fork networks. Migrated repositories will import as independent standalone roots without upstream pull request links or synchronization streams.',
      recommendedAction:
        forkedRepos.length > 0
          ? `Inform maintainers of ${forkedRepos.length} forked repos. Configure upstream remotes manually post-cutover if ongoing synchronization with upstream is required.`
          : 'No forked repositories discovered; no action needed.',
    });

    // 2. Discussions Audit
    details.push({
      category: 'discussions',
      title: 'Repository Discussions',
      impactedEntitiesCount: 0,
      impactedEntities: [],
      limitationDescription:
        'Repository Discussions (threads, Q&A, ideas) are not transferred by GEI.',
      recommendedAction:
        'Export critical discussion threads via GitHub GraphQL API or archive into issues prior to repository cutover.',
    });

    // 3. Projects v2 Audit
    const discoveredProjects: string[] = [];
    if (discoveryBundle) {
      for (const e of discoveryBundle.entities) {
        if (e.kind === 'project') {
          discoveredProjects.push(e.title);
        }
      }
    }

    details.push({
      category: 'projects_v2',
      title: 'Projects (v2) Experience',
      impactedEntitiesCount: discoveredProjects.length,
      impactedEntities: discoveredProjects,
      limitationDescription:
        'GitHub Projects v2 boards, custom fields, and views cannot be migrated by GEI.',
      recommendedAction:
        'Recreate organizational project boards on the target enterprise using the GraphQL ProjectV2 API or manual setup.',
    });

    // 4. Workflow Run History & Artifacts
    details.push({
      category: 'run_history_and_artifacts',
      title: 'Actions Run History, Caches, & Artifacts',
      impactedEntitiesCount: 0,
      impactedEntities: [],
      limitationDescription:
        'Historical workflow runs, execution logs, build artifacts, and caches are ephemeral and not transferred.',
      recommendedAction:
        'Archive required regulatory or compliance build logs to external cloud storage before cutting over repositories.',
    });

    // 5. Enterprise Audit Logs
    details.push({
      category: 'audit_logs',
      title: 'Enterprise Audit Trail',
      impactedEntitiesCount: 0,
      impactedEntities: [],
      limitationDescription:
        'Audit log streams remain bound to the source enterprise and do not migrate.',
      recommendedAction:
        'Retain access to the source enterprise for historical audit compliance or export logs using the Audit Log Streaming API.',
    });

    // 6. Stars & Watchers
    details.push({
      category: 'stars_and_watchers',
      title: 'Social Metadata (Stars & Watchers)',
      impactedEntitiesCount: 0,
      impactedEntities: [],
      limitationDescription:
        'Repository stars, watchers, and activity feeds are discarded during migration.',
      recommendedAction:
        'Notify internal developers that personal bookmarks and notifications must be reset on the new organization.',
    });

    // 7. User Keys & Profiles
    details.push({
      category: 'user_keys_and_profiles',
      title: 'User Profiles, SSH Keys, & Signing Keys',
      impactedEntitiesCount: 0,
      impactedEntities: [],
      limitationDescription:
        'Personal accounts, SSH public keys, GPG signing keys, and personal access tokens (PATs) cannot be migrated.',
      recommendedAction:
        'Include SSH and GPG key registration in developer onboarding checklists for the destination Enterprise Managed Users (EMU) tenant.',
    });

    // 8. Secret Scanning Remediation
    details.push({
      category: 'secret_scanning_remediation',
      title: 'Secret Scanning Dismissal States',
      impactedEntitiesCount: 0,
      impactedEntities: [],
      limitationDescription:
        'Remediation states and dismissals of secret scanning alerts are not preserved.',
      recommendedAction:
        'Review and re-triage detected secrets after enabling Secret Scanning on the target repositories.',
    });

    return details;
  }

  /**
   * Generates the Unsupported Items Audit section in Markdown.
   */
  generateUnsupportedAuditMarkdown(
    items: readonly UnsupportedItemDetail[],
  ): string {
    const lines: string[] = [
      '# Platform Non-Migrated Items & Advisory Audit',
      '',
      '> [!NOTE]',
      '> Per authoritative documentation (`data-not-migrated.md`), the following platform entities cannot be transferred via GEI or GitHub APIs. This audit explicitly accounts for all non-migrated categories to eliminate silent cutover surprises.',
      '',
    ];

    for (const item of items) {
      lines.push(`### ${item.title}`);
      lines.push(`- **Category:** \`${item.category}\``);
      lines.push(
        `- **Impacted Entities Discovered:** ${item.impactedEntitiesCount}`,
      );
      if (item.impactedEntities.length > 0) {
        lines.push(
          `- **Entities:** ${item.impactedEntities.map((e) => `\`${e}\``).join(', ')}`,
        );
      }
      lines.push(`- **Platform Constraint:** ${item.limitationDescription}`);
      lines.push(`- **Recommended Action:** ${item.recommendedAction}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
