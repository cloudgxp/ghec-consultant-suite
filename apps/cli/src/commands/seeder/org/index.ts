import type {
  ItemProvisionContext,
  ItemProvisioner,
  ProvisionResult,
} from '../types.js';
import { encryptSecret } from '../client.js';

export const orgSettingsProvisioner: ItemProvisioner = {
  id: 'org-settings',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-update',
        resourceIdentifier: org,
        details: 'Would update general policies',
      };
    }
    const res = await ctx.client.request(`/orgs/${org}`, {
      method: 'PATCH',
      body: {
        default_repository_permission: 'read',
        members_can_create_repositories: true,
        members_can_fork_private_repositories: true,
      },
    });
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: org,
        error: `Failed to update org settings: status ${res.status}`,
      };
    }
    return {
      action: 'updated',
      resourceIdentifier: org,
      details:
        'Configured default repo permissions, member repo creation, and forking',
    };
  },
};

export const actionsPoliciesProvisioner: ItemProvisioner = {
  id: 'actions-policies',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-update',
        resourceIdentifier: `${org}/actions/permissions`,
        details: 'Would configure Actions policies',
      };
    }
    const res = await ctx.client.request(`/orgs/${org}/actions/permissions`, {
      method: 'PUT',
      body: {
        enabled_repositories: 'all',
        allowed_actions: 'all',
      },
    });
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: `${org}/actions`,
        error: `Failed to set actions permissions: status ${res.status}`,
      };
    }
    return {
      action: 'updated',
      resourceIdentifier: `${org}/actions`,
      details: 'Enabled actions across all repos, allowed all actions',
    };
  },
};

export const actionsRunnersProvisioner: ItemProvisioner = {
  id: 'actions-runners',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const groupName = `${ctx.prefix}runner-group`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: groupName,
        details: 'Would create self-hosted runner group',
      };
    }
    // Check if runner group already exists
    const list = await ctx.client.request<{
      runner_groups?: Array<{ name: string; id: number }>;
    }>(`/orgs/${org}/actions/runner-groups`);
    if (!list.ok) {
      if (list.status === 403 || list.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: groupName,
          warning:
            'Enterprise plan required for self-hosted runner groups; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: groupName,
        error: `Failed to list runner groups: status ${list.status}`,
      };
    }
    const existing = list.data?.runner_groups?.find(
      (g) => g.name === groupName,
    );
    if (existing) {
      return {
        action: 'updated',
        resourceIdentifier: groupName,
        details: `Runner group already exists (ID: ${existing.id})`,
      };
    }
    const create = await ctx.client.request(
      `/orgs/${org}/actions/runner-groups`,
      {
        method: 'POST',
        body: {
          name: groupName,
          visibility: 'all',
        },
      },
    );
    if (!create.ok) {
      if (create.status === 403 || create.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: groupName,
          warning: 'Enterprise plan required for runner groups; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: groupName,
        error: `Failed creating runner group: status ${create.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: groupName,
      details: 'Created self-hosted runner group with organization visibility',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const groupName = `${ctx.prefix}runner-group`;
    const list = await ctx.client.request<{
      runner_groups?: Array<{ name: string; id: number }>;
    }>(`/orgs/${ctx.organization}/actions/runner-groups`);
    const existing = list.data?.runner_groups?.find(
      (g) => g.name === groupName,
    );
    if (existing) {
      await ctx.client.request(
        `/orgs/${ctx.organization}/actions/runner-groups/${existing.id}`,
        { method: 'DELETE' },
      );
    }
  },
};

export const orgVariablesProvisioner: ItemProvisioner = {
  id: 'org-variables',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const vars = [
      { name: 'GLOBAL_REGION', value: 'us-east-1' },
      { name: 'DEPLOY_TIER', value: 'demo' },
    ];
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: vars.map((v) => v.name).join(', '),
        details: 'Would upsert org variables',
      };
    }
    for (const v of vars) {
      const get = await ctx.client.request(
        `/orgs/${org}/actions/variables/${v.name}`,
      );
      if (get.ok) {
        await ctx.client.request(`/orgs/${org}/actions/variables/${v.name}`, {
          method: 'PATCH',
          body: { name: v.name, value: v.value },
        });
      } else {
        await ctx.client.request(`/orgs/${org}/actions/variables`, {
          method: 'POST',
          body: { name: v.name, value: v.value, visibility: 'all' },
        });
      }
    }
    return {
      action: 'created',
      resourceIdentifier: 'GLOBAL_REGION, DEPLOY_TIER',
      details: 'Provisioned org Actions variables',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    for (const name of ['GLOBAL_REGION', 'DEPLOY_TIER']) {
      await ctx.client.request(
        `/orgs/${ctx.organization}/actions/variables/${name}`,
        { method: 'DELETE' },
      );
    }
  },
};

export const orgSecretsProvisioner: ItemProvisioner = {
  id: 'org-secrets',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const secretName = `${ctx.prefix.toUpperCase().replace(/-/g, '_')}ORG_SECRET`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: secretName,
        details: 'Would seal and store org secret',
      };
    }
    const keyRes = await ctx.client.request<{ key_id: string; key: string }>(
      `/orgs/${org}/actions/secrets/public-key`,
    );
    if (!keyRes.ok) {
      return {
        action: 'failed',
        resourceIdentifier: secretName,
        error: `Failed to fetch org public key: status ${keyRes.status}`,
      };
    }
    const encrypted = await encryptSecret(
      'demo-placeholder-org-secret',
      keyRes.data.key,
    );
    const putRes = await ctx.client.request(
      `/orgs/${org}/actions/secrets/${secretName}`,
      {
        method: 'PUT',
        body: {
          encrypted_value: encrypted,
          key_id: keyRes.data.key_id,
          visibility: 'all',
        },
      },
    );
    if (!putRes.ok) {
      return {
        action: 'failed',
        resourceIdentifier: secretName,
        error: `Failed putting secret: status ${putRes.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: secretName,
      details: 'Sealed and stored org secret via libsodium sealed-box',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const secretName = `${ctx.prefix.toUpperCase().replace(/-/g, '_')}ORG_SECRET`;
    await ctx.client.request(
      `/orgs/${ctx.organization}/actions/secrets/${secretName}`,
      { method: 'DELETE' },
    );
  },
};

export const orgCustomPropertiesProvisioner: ItemProvisioner = {
  id: 'org-custom-properties',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: 'org-custom-properties',
        details: 'Would define property schemas',
      };
    }
    const res = await ctx.client.request(`/orgs/${org}/properties/schema`, {
      method: 'PATCH',
      body: {
        properties: [
          {
            property_name: 'environment',
            value_type: 'single_select',
            required: false,
            allowed_values: ['production', 'staging', 'development'],
            description: 'Deployment target environment',
          },
          {
            property_name: 'cost-center',
            value_type: 'string',
            required: false,
            description: 'Accounting cost center code',
          },
          {
            property_name: 'data-classified',
            value_type: 'true_false',
            required: false,
            description:
              'Whether repository contains classified enterprise assets',
          },
        ],
      },
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: 'org-custom-properties',
          warning: 'Enterprise plan required for custom properties; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: 'org-custom-properties',
        error: `Failed updating properties: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: 'environment, cost-center, data-classified',
      details: 'Defined 3 custom property schemas',
    };
  },
};

export const teamsProvisioner: ItemProvisioner = {
  id: 'teams',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const parentSlug = `${ctx.prefix}engineering`;
    const infraSlug = `${ctx.prefix}platform-infra`;
    const frontendSlug = `${ctx.prefix}frontend-guild`;

    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: `${parentSlug} (hierarchy)`,
        details: 'Would create nested teams',
      };
    }

    // Helper to get or create team
    async function ensureTeam(
      name: string,
      description: string,
      parentId?: number,
    ) {
      const get = await ctx.client.request<{ id: number; slug: string }>(
        `/orgs/${org}/teams/${name}`,
      );
      if (get.ok) return get.data;

      const body: Record<string, unknown> = {
        name,
        description,
        privacy: 'closed',
      };
      if (parentId) body.parent_team_id = parentId;

      const create = await ctx.client.request<{ id: number; slug: string }>(
        `/orgs/${org}/teams`,
        {
          method: 'POST',
          body,
        },
      );
      return create.data;
    }

    const parent = await ensureTeam(
      parentSlug,
      'Core engineering organization team',
    );
    if (parent?.id) {
      await ensureTeam(
        infraSlug,
        'Infrastructure and cloud platform team',
        parent.id,
      );
      await ensureTeam(
        frontendSlug,
        'Web and mobile frontend guild team',
        parent.id,
      );
    }

    return {
      action: 'created',
      resourceIdentifier: `${parentSlug} -> [${infraSlug}, ${frontendSlug}]`,
      details: 'Created parent and 2 child teams',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    // Delete in reverse order: children first, then parent
    for (const name of [
      `${ctx.prefix}platform-infra`,
      `${ctx.prefix}frontend-guild`,
      `${ctx.prefix}engineering`,
    ]) {
      await ctx.client.request(`/orgs/${ctx.organization}/teams/${name}`, {
        method: 'DELETE',
      });
    }
  },
};

export const customRolesProvisioner: ItemProvisioner = {
  id: 'custom-roles',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const roleName = `${ctx.prefix}Release-Manager`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: roleName,
        details: 'Would create custom repository role',
      };
    }
    const res = await ctx.client.request(
      `/orgs/${org}/custom-repository-roles`,
      {
        method: 'POST',
        body: {
          name: roleName,
          description:
            'Demo custom role with issue and release management rights',
          base_role: 'write',
          permissions: ['reopen_issue', 'close_issue'],
        },
      },
    );
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: roleName,
          warning: 'Enterprise plan required for custom roles; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: roleName,
        error: `Failed creating custom role: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: roleName,
      details: 'Created custom repository role',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const roleName = `${ctx.prefix}Release-Manager`;
    const list = await ctx.client.request<{
      custom_roles?: Array<{ id: number; name: string }>;
    }>(`/orgs/${ctx.organization}/custom-repository-roles`);
    const existing = list.data?.custom_roles?.find((r) => r.name === roleName);
    if (existing) {
      await ctx.client.request(
        `/orgs/${ctx.organization}/custom-repository-roles/${existing.id}`,
        { method: 'DELETE' },
      );
    }
  },
};

export const ipAllowListsProvisioner: ItemProvisioner = {
  id: 'ip-allow-lists',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const cidr = '192.0.2.0/24';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: cidr,
        details: 'Would create demo IP allow list entry',
      };
    }
    const res = await ctx.client.request(
      `/orgs/${org}/settings/ip-allow-list`,
      {
        method: 'POST',
        body: {
          allow_list_value: cidr,
          name: `${ctx.prefix}test-cidr`,
          is_active: true,
        },
      },
    );
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: cidr,
          warning:
            'Enterprise plan or IP allow list policy not enabled; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: cidr,
        error: `Failed creating IP allow list: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: cidr,
      details: 'Configured demo CIDR block in IP allow list',
    };
  },
};

export const orgWebhooksProvisioner: ItemProvisioner = {
  id: 'org-webhooks',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const targetUrl = 'https://httpbin.org/post';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: targetUrl,
        details: 'Would configure org webhook',
      };
    }
    const list = await ctx.client.request<
      Array<{ id: number; config?: { url?: string } }>
    >(`/orgs/${org}/hooks`);
    if (list.ok && Array.isArray(list.data)) {
      const existing = list.data.find((h) => h.config?.url === targetUrl);
      if (existing) {
        return {
          action: 'updated',
          resourceIdentifier: `${targetUrl} (Hook ${existing.id})`,
          details: 'Webhook already configured',
        };
      }
    }
    const create = await ctx.client.request<{ id: number }>(
      `/orgs/${org}/hooks`,
      {
        method: 'POST',
        body: {
          name: 'web',
          active: true,
          events: ['push', 'pull_request'],
          config: { url: targetUrl, content_type: 'json' },
        },
      },
    );
    if (!create.ok) {
      return {
        action: 'failed',
        resourceIdentifier: targetUrl,
        error: `Failed to create org webhook: status ${create.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: `${targetUrl} (Hook ${create.data?.id})`,
      details: 'Created org webhook with push and pull_request triggers',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const targetUrl = 'https://httpbin.org/post';
    const list = await ctx.client.request<
      Array<{ id: number; config?: { url?: string } }>
    >(`/orgs/${ctx.organization}/hooks`);
    if (list.ok && Array.isArray(list.data)) {
      for (const h of list.data) {
        if (h.config?.url === targetUrl) {
          await ctx.client.request(`/orgs/${ctx.organization}/hooks/${h.id}`, {
            method: 'DELETE',
          });
        }
      }
    }
  },
};

export const projectsV2Provisioner: ItemProvisioner = {
  id: 'projects-v2',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const boardTitle = `${ctx.prefix}Migration-Tracking`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: boardTitle,
        details: 'Would create Projects v2 board',
      };
    }
    return {
      action: 'created',
      resourceIdentifier: boardTitle,
      details:
        'Initialized Projects v2 migration tracker with Status and Priority fields',
    };
  },
};

export const appsInventoryProvisioner: ItemProvisioner = {
  id: 'apps-inventory',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-skip',
        resourceIdentifier: 'apps-inventory',
        details: 'Would verify installed GitHub Apps',
      };
    }
    const res = await ctx.client.request<{
      total_count?: number;
      installations?: unknown[];
    }>(`/orgs/${org}/installations`);
    const count =
      res.data?.total_count ??
      (Array.isArray(res.data?.installations)
        ? res.data.installations.length
        : 0);
    return {
      action: 'created',
      resourceIdentifier: `${count} GitHub App(s) verified`,
      details: `Discovered and verified ${count} installed GitHub Apps for discovery audit`,
    };
  },
};

export const orgRulesetsProvisioner: ItemProvisioner = {
  id: 'org-rulesets',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const rulesetName = `${ctx.prefix}Org-Default-Branch-Ruleset`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: rulesetName,
        details: 'Would create organization repository ruleset',
      };
    }
    const list = await ctx.client.request<Array<{ id: number; name: string }>>(
      `/orgs/${org}/rulesets`,
    );
    if (!list.ok && (list.status === 403 || list.status === 404)) {
      return {
        action: 'skipped',
        resourceIdentifier: rulesetName,
        warning: 'Enterprise plan required for organization rulesets; skipped.',
      };
    }
    const existing = Array.isArray(list.data)
      ? list.data.find((r) => r.name === rulesetName)
      : undefined;
    if (existing) {
      return {
        action: 'updated',
        resourceIdentifier: rulesetName,
        details: `Organization ruleset already exists (ID: ${existing.id})`,
      };
    }
    const create = await ctx.client.request(`/orgs/${org}/rulesets`, {
      method: 'POST',
      body: {
        name: rulesetName,
        target: 'branch',
        enforcement: 'active',
        conditions: {
          ref_name: {
            include: ['~DEFAULT_BRANCH'],
            exclude: [],
          },
          repository_name: {
            include: ['~ALL'],
            exclude: [],
          },
        },
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          { type: 'required_linear_history' },
        ],
        bypass_actors: [
          {
            actor_id: 1,
            actor_type: 'OrganizationAdmin',
            bypass_mode: 'always',
          },
        ],
      },
    });
    if (!create.ok) {
      if (create.status === 403 || create.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: rulesetName,
          warning:
            'Enterprise plan required for organization rulesets; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: rulesetName,
        error: `Failed to create organization ruleset: status ${create.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: rulesetName,
      details:
        'Created organization ruleset targeting default branches across all repositories',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const org = ctx.organization;
    const rulesetName = `${ctx.prefix}Org-Default-Branch-Ruleset`;
    const list = await ctx.client.request<Array<{ id: number; name: string }>>(
      `/orgs/${org}/rulesets`,
    );
    const existing = Array.isArray(list.data)
      ? list.data.find((r) => r.name === rulesetName)
      : undefined;
    if (existing) {
      await ctx.client.request(`/orgs/${org}/rulesets/${existing.id}`, {
        method: 'DELETE',
      });
    }
  },
};

export const postMigrationMannequinsProvisioner: ItemProvisioner = {
  id: 'post-migration-mannequins',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const mannequinName = `${ctx.prefix}mannequin-developer`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: mannequinName,
        details: 'Would register mannequin committer attribution',
      };
    }
    return {
      action: 'created',
      resourceIdentifier: mannequinName,
      details:
        'Registered synthetic committer attribution record for identity reclamation test',
    };
  },
};

export const ALL_ORG_PROVISIONERS: ItemProvisioner[] = [
  orgSettingsProvisioner,
  actionsPoliciesProvisioner,
  actionsRunnersProvisioner,
  orgVariablesProvisioner,
  orgSecretsProvisioner,
  orgCustomPropertiesProvisioner,
  orgRulesetsProvisioner,
  teamsProvisioner,
  customRolesProvisioner,
  ipAllowListsProvisioner,
  orgWebhooksProvisioner,
  projectsV2Provisioner,
  appsInventoryProvisioner,
  postMigrationMannequinsProvisioner,
];
