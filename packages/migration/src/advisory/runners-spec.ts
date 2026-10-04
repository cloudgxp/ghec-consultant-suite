import type { DiscoveryBundle } from '@ghec/contracts';
import type { GitHubReadAdapter } from '@ghec/github-client';
import type { RunnerTopologySpec, RunnerGroupSpec } from './types.js';

interface RawRunner {
  readonly id?: number | undefined;
  readonly name?: string | undefined;
  readonly os?: string | undefined;
  readonly status?: string | undefined;
  readonly busy?: boolean | undefined;
  readonly labels?:
    readonly { readonly name?: string | undefined }[] | undefined;
  readonly runner_group_id?: number | undefined;
}

interface RawRunnersResponse {
  readonly total_count?: number | undefined;
  readonly runners?: readonly RawRunner[] | undefined;
}

interface RawRunnerGroup {
  readonly id?: number | undefined;
  readonly name?: string | undefined;
  readonly visibility?: string | undefined;
  readonly runners_url?: string | undefined;
}

interface RawRunnerGroupsResponse {
  readonly total_count?: number | undefined;
  readonly runner_groups?: readonly RawRunnerGroup[] | undefined;
}

export class SelfHostedRunnersPlanner {
  /**
   * Discovers runners and runner groups from live API or discovery bundle.
   */
  async discover(
    sourceOrg: string,
    adapter?: GitHubReadAdapter | undefined,
    discoveryBundle?: DiscoveryBundle | undefined,
    signal?: AbortSignal | undefined,
  ): Promise<{
    runners: RunnerTopologySpec[];
    groups: RunnerGroupSpec[];
  }> {
    const runners: RunnerTopologySpec[] = [];
    const groups: RunnerGroupSpec[] = [];

    // 1. Live API Discovery
    if (adapter) {
      try {
        const sig = signal ?? new AbortController().signal;

        // Discover runner groups
        const groupsRes = await adapter.readSingle<RawRunnerGroupsResponse>(
          {
            id: 'rest.actions.listRunnerGroupsForOrg',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/runner-groups',
            pathParams: { org: sourceOrg },
          },
          sig,
        );

        const groupNameById = new Map<number, string>();
        if (groupsRes.status === 200 && groupsRes.data?.runner_groups) {
          for (const g of groupsRes.data.runner_groups) {
            const id = g.id ?? 0;
            const name = g.name ?? `group-${id}`;
            groupNameById.set(id, name);
            groups.push({
              id,
              name,
              visibility:
                g.visibility === 'all' ||
                g.visibility === 'selected' ||
                g.visibility === 'private'
                  ? g.visibility
                  : 'unknown',
              runnerCount: 0,
            });
          }
        }

        // Discover runners
        const runnersRes = await adapter.readSingle<RawRunnersResponse>(
          {
            id: 'rest.actions.listSelfHostedRunnersForOrg',
            transport: 'rest',
            verifiedReadOnly: true,
            path: '/orgs/{org}/actions/runners',
            pathParams: { org: sourceOrg },
          },
          sig,
        );

        if (runnersRes.status === 200 && runnersRes.data?.runners) {
          for (const r of runnersRes.data.runners) {
            const labels = (r.labels ?? [])
              .map((l) => l.name)
              .filter((n): n is string => Boolean(n));
            const groupId = r.runner_group_id ?? null;
            const groupName =
              groupId !== null ? groupNameById.get(groupId) : undefined;

            runners.push({
              id: r.id ?? 0,
              name: r.name ?? 'unnamed-runner',
              runnerType: 'self-hosted',
              os: r.os ?? 'linux',
              status:
                r.status === 'online' || r.status === 'offline'
                  ? r.status
                  : 'unknown',
              busy: r.busy ?? false,
              labels,
              runnerGroupId: groupId,
              runnerGroupName: groupName,
            });
          }
        }
      } catch {
        // Fall back to bundle
      }
    }

    // 2. Discovery Bundle Fallback
    if (runners.length === 0 && discoveryBundle) {
      for (const e of discoveryBundle.entities) {
        if (e.kind === 'action-runner-group') {
          groups.push({
            id: e.id,
            name: e.name,
            visibility: e.visibility,
            runnerCount: e.runnerCount.value ?? 0,
          });
        } else if (e.kind === 'action-runner') {
          runners.push({
            id: e.id,
            name: e.name,
            runnerType: e.runnerType,
            os: e.operatingSystem,
            status: e.status,
            busy: e.busy,
            labels: [...e.labels],
            runnerGroupId: e.runnerGroupId,
          });
        }
      }
    }

    return { runners, groups };
  }

  /**
   * Generates the Runner Infrastructure Specification markdown document.
   */
  generateRunnerInfrastructureSpecMarkdown(
    runners: readonly RunnerTopologySpec[],
    groups: readonly RunnerGroupSpec[],
    targetOrg: string,
  ): string {
    const lines: string[] = [
      `# Actions Self-Hosted Runner Infrastructure Specification`,
      '',
      `**Target Organization:** \`${targetOrg}\`  `,
      '',
      `> [!WARNING]`,
      `> **Non-Transferable Asset:** Self-hosted runners and runner registration tokens cannot be copied or migrated by GEI. Runner infrastructure must be provisioned and registered in \`${targetOrg}\` prior to CI/CD cutover.`,
      '',
      `## 1. Runner Groups Topology`,
      '',
    ];

    if (groups.length === 0) {
      lines.push(
        `No dedicated runner groups discovered. Runners will register to the default organizational group.`,
        '',
      );
    } else {
      lines.push(
        '| Runner Group Name | Visibility | Discovered Runners |',
        '|---|---|---|',
      );
      for (const g of groups) {
        lines.push(
          `| **${g.name}** | \`${g.visibility}\` | ${g.runnerCount} |`,
        );
      }
      lines.push('');
    }

    lines.push('## 2. Self-Hosted Runners Inventory', '');

    if (runners.length === 0) {
      lines.push(
        `No active self-hosted runners discovered in source environment. Standard GitHub-hosted runners will be used.`,
        '',
      );
    } else {
      lines.push(
        '| Runner Name | OS / Arch | Status | Runner Group | Labels |',
        '|---|---|---|---|---|',
      );
      for (const r of runners) {
        const osStr = r.os ?? 'Unknown';
        const groupStr = r.runnerGroupName ?? 'Default';
        const labelsStr =
          r.labels.length > 0
            ? r.labels.map((l) => `\`${l}\``).join(', ')
            : '—';
        lines.push(
          `| \`${r.name}\` | ${osStr} | \`${r.status}\` | **${groupStr}** | ${labelsStr} |`,
        );
      }
      lines.push('');
    }

    lines.push(
      '## 3. Provisioning & Registration Playbook',
      '',
      'To register replacement self-hosted runners in the target organization:',
      '',
      '1. **Generate Registration Token on Destination:**',
      '   ```bash',
      `   gh api --method POST -H "Accept: application/vnd.github+json" /orgs/${targetOrg}/actions/runners/registration-token | jq -r .token`,
      '   ```',
      '2. **Configure Runner Host:**',
      '   ```bash',
      `   ./config.sh --url https://github.com/${targetOrg} --token <REGISTRATION_TOKEN> --labels <LABELS> --runnergroup <GROUP_NAME>`,
      '   ./run.sh',
      '   ```',
    );

    return lines.join('\n');
  }
}
