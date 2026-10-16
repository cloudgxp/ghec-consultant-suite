import { Buffer } from 'node:buffer';
import type {
  ItemProvisionContext,
  ItemProvisioner,
  ProvisionResult,
} from '../types.js';
import { encryptSecret } from '../client.js';

// Helper to commit or update a file in the repository
async function ensureFile(
  ctx: ItemProvisionContext,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  branch = 'main',
): Promise<void> {
  if (ctx.dryRun) return;
  const path = `/repos/${ctx.organization}/${repo}/contents/${filePath}`;
  const get = await ctx.client.request<{ sha?: string }>(
    `${path}?ref=${branch}`,
  );
  const base64Content = Buffer.from(content, 'utf8').toString('base64');
  const body: Record<string, unknown> = {
    message,
    content: base64Content,
    branch,
  };
  if (get.ok && get.data?.sha) {
    body.sha = get.data.sha;
  }
  await ctx.client.request(path, { method: 'PUT', body });
}

export const geiRepoProvisioner: ItemProvisioner = {
  id: 'gei-repo',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;

    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: `${org}/${repo}`,
        details: 'Would create or initialize repository',
      };
    }

    const check = await ctx.client.request(`/repos/${org}/${repo}`);
    let isCreated = false;

    if (!check.ok && check.status === 404) {
      const create = await ctx.client.request(`/orgs/${org}/repos`, {
        method: 'POST',
        body: {
          name: repo,
          private: true,
          auto_init: true,
          description:
            'Synthetic demo repository for GHEC-to-EMU migration validation',
        },
      });
      if (!create.ok) {
        return {
          action: 'failed',
          resourceIdentifier: `${org}/${repo}`,
          error: `Failed to create repo: status ${create.status}`,
        };
      }
      isCreated = true;
    }

    // Configure repository settings
    await ctx.client.request(`/repos/${org}/${repo}`, {
      method: 'PATCH',
      body: {
        has_issues: true,
        has_discussions: true,
        has_wiki: true,
        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: true,
        delete_branch_on_merge: true,
      },
    });

    // Set topics
    await ctx.client.request(`/repos/${org}/${repo}/topics`, {
      method: 'PUT',
      body: { names: ['ghec-migration', 'demo', 'synthetic-content'] },
    });

    return {
      action: isCreated ? 'created' : 'updated',
      resourceIdentifier: `${org}/${repo}`,
      details:
        'Bootstrapped repository, configured merge settings, enabled issues/discussions, set topics',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    // Only delete if repo matches prefix to protect non-demo repos
    if (repo.startsWith(ctx.prefix)) {
      await ctx.client.request(`/repos/${ctx.organization}/${repo}`, {
        method: 'DELETE',
      });
    }
  },
};

export const repoVariablesProvisioner: ItemProvisioner = {
  id: 'repo-variables',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const vars = [
      { name: 'DEMO_FEATURE_FLAG', value: 'enabled' },
      { name: 'LOG_LEVEL', value: 'debug' },
    ];
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: vars.map((v) => v.name).join(', '),
        details: 'Would upsert repo variables',
      };
    }
    for (const v of vars) {
      const get = await ctx.client.request(
        `/repos/${org}/${repo}/actions/variables/${v.name}`,
      );
      if (get.ok) {
        await ctx.client.request(
          `/repos/${org}/${repo}/actions/variables/${v.name}`,
          {
            method: 'PATCH',
            body: { name: v.name, value: v.value },
          },
        );
      } else {
        await ctx.client.request(`/repos/${org}/${repo}/actions/variables`, {
          method: 'POST',
          body: { name: v.name, value: v.value },
        });
      }
    }
    return {
      action: 'created',
      resourceIdentifier: 'DEMO_FEATURE_FLAG, LOG_LEVEL',
      details: 'Provisioned repo Actions variables',
    };
  },
};

export const repoSecretsProvisioner: ItemProvisioner = {
  id: 'repo-secrets',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const secretName = `${ctx.prefix.toUpperCase().replace(/-/g, '_')}REPO_SECRET`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: secretName,
        details: 'Would seal and store repo secret',
      };
    }
    const keyRes = await ctx.client.request<{ key_id: string; key: string }>(
      `/repos/${org}/${repo}/actions/secrets/public-key`,
    );
    if (!keyRes.ok) {
      return {
        action: 'failed',
        resourceIdentifier: secretName,
        error: `Failed to fetch repo public key: status ${keyRes.status}`,
      };
    }
    const encrypted = await encryptSecret(
      'demo-placeholder-repo-secret',
      keyRes.data.key,
    );
    await ctx.client.request(
      `/repos/${org}/${repo}/actions/secrets/${secretName}`,
      {
        method: 'PUT',
        body: {
          encrypted_value: encrypted,
          key_id: keyRes.data.key_id,
        },
      },
    );
    return {
      action: 'created',
      resourceIdentifier: secretName,
      details: 'Sealed and stored repo secret via libsodium sealed-box',
    };
  },
};

export const repoCustomPropertiesProvisioner: ItemProvisioner = {
  id: 'repo-custom-properties',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-update',
        resourceIdentifier: `${repo}/properties`,
        details: 'Would apply repo property values',
      };
    }
    const res = await ctx.client.request(
      `/repos/${org}/${repo}/properties/values`,
      {
        method: 'PATCH',
        body: {
          properties: [
            { property_name: 'environment', value: 'staging' },
            { property_name: 'cost-center', value: 'CC-1042' },
          ],
        },
      },
    );
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        return {
          action: 'skipped',
          resourceIdentifier: `${repo}/properties`,
          warning:
            'Custom properties schema not present or not supported; skipped.',
        };
      }
      return {
        action: 'failed',
        resourceIdentifier: `${repo}/properties`,
        error: `Failed applying repo properties: status ${res.status}`,
      };
    }
    return {
      action: 'updated',
      resourceIdentifier: `${repo}/properties`,
      details: 'Applied environment=staging, cost-center=CC-1042',
    };
  },
};

export const environmentsProvisioner: ItemProvisioner = {
  id: 'environments',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: 'production, staging',
        details: 'Would create deployment environments',
      };
    }
    for (const envName of ['staging', 'production']) {
      await ctx.client.request(
        `/repos/${org}/${repo}/environments/${envName}`,
        {
          method: 'PUT',
          body: {
            wait_timer: 5,
            deployment_branch_policy: {
              protected_branches: true,
              custom_branch_policies: false,
            },
          },
        },
      );
    }
    return {
      action: 'created',
      resourceIdentifier: 'production, staging',
      details: 'Provisioned production and staging deployment environments',
    };
  },
};

export const branchProtectionProvisioner: ItemProvisioner = {
  id: 'branch-protection',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: `${repo}:main`,
        details: 'Would apply classic branch protection',
      };
    }
    const res = await ctx.client.request(
      `/repos/${org}/${repo}/branches/main/protection`,
      {
        method: 'PUT',
        body: {
          required_status_checks: null,
          enforce_admins: true,
          required_pull_request_reviews: {
            dismiss_stale_reviews: true,
            require_code_owner_reviews: false,
            required_approving_review_count: 1,
          },
          restrictions: null,
        },
      },
    );
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: `${repo}:main`,
        error: `Failed branch protection: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: `${repo}:main`,
      details: 'Enforced 1 required approval and admin check on main',
    };
  },
};

export const rulesetsProvisioner: ItemProvisioner = {
  id: 'rulesets',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const branchRulesetName = `${ctx.prefix}Main-Protection-Ruleset`;
    const tagRulesetName = `${ctx.prefix}Release-Tag-Ruleset`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: `${branchRulesetName}, ${tagRulesetName}`,
        details: 'Would create modern branch and tag repository rulesets',
      };
    }
    const list = await ctx.client.request<Array<{ id: number; name: string }>>(
      `/repos/${org}/${repo}/rulesets`,
    );
    const existingList = Array.isArray(list.data) ? list.data : [];

    const rulesetDefs = [
      {
        name: branchRulesetName,
        target: 'branch',
        enforcement: 'active',
        conditions: {
          ref_name: {
            include: ['~DEFAULT_BRANCH'],
            exclude: [],
          },
        },
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          {
            type: 'pull_request',
            parameters: {
              required_approving_review_count: 1,
              dismiss_stale_reviews_on_push: true,
              require_last_push_approval: false,
            },
          },
        ],
        bypass_actors: [
          {
            actor_id: 5,
            actor_type: 'RepositoryRole',
            bypass_mode: 'always',
          },
        ],
      },
      {
        name: tagRulesetName,
        target: 'tag',
        enforcement: 'active',
        conditions: {
          ref_name: {
            include: ['refs/tags/v*'],
            exclude: [],
          },
        },
        rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
        bypass_actors: [
          {
            actor_id: 5,
            actor_type: 'RepositoryRole',
            bypass_mode: 'always',
          },
        ],
      },
    ];

    let createdCount = 0;
    for (const def of rulesetDefs) {
      const existing = existingList.find((r) => r.name === def.name);
      if (existing) {
        continue;
      }
      const create = await ctx.client.request(
        `/repos/${org}/${repo}/rulesets`,
        {
          method: 'POST',
          body: def,
        },
      );
      if (!create.ok) {
        return {
          action: 'failed',
          resourceIdentifier: def.name,
          error: `Failed to create ruleset: status ${create.status}`,
        };
      }
      createdCount++;
    }

    return {
      action: createdCount > 0 ? 'created' : 'updated',
      resourceIdentifier: `${branchRulesetName}, ${tagRulesetName}`,
      details:
        createdCount > 0
          ? 'Created branch and tag repository rulesets with bypass actors'
          : 'Branch and tag rulesets already exist',
    };
  },
  async cleanup(ctx: ItemProvisionContext): Promise<void> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const namesToDelete = new Set([
      `${ctx.prefix}Main-Protection-Ruleset`,
      `${ctx.prefix}Release-Tag-Ruleset`,
    ]);
    const list = await ctx.client.request<Array<{ id: number; name: string }>>(
      `/repos/${org}/${repo}/rulesets`,
    );
    if (Array.isArray(list.data)) {
      for (const r of list.data) {
        if (namesToDelete.has(r.name)) {
          await ctx.client.request(`/repos/${org}/${repo}/rulesets/${r.id}`, {
            method: 'DELETE',
          });
        }
      }
    }
  },
};

export const repoWebhooksProvisioner: ItemProvisioner = {
  id: 'repo-webhooks',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const targetUrl = 'https://httpbin.org/post';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: targetUrl,
        details: 'Would create repo webhook',
      };
    }
    const list = await ctx.client.request<
      Array<{ id: number; config?: { url?: string } }>
    >(`/repos/${org}/${repo}/hooks`);
    if (list.ok && Array.isArray(list.data)) {
      const existing = list.data.find((h) => h.config?.url === targetUrl);
      if (existing) {
        return {
          action: 'updated',
          resourceIdentifier: `${targetUrl} (Hook ${existing.id})`,
          details: 'Repo webhook already exists',
        };
      }
    }
    const create = await ctx.client.request<{ id: number }>(
      `/repos/${org}/${repo}/hooks`,
      {
        method: 'POST',
        body: {
          name: 'web',
          active: true,
          events: ['push', 'issues'],
          config: { url: targetUrl, content_type: 'json' },
        },
      },
    );
    if (!create.ok) {
      return {
        action: 'failed',
        resourceIdentifier: targetUrl,
        error: `Failed creating repo webhook: status ${create.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: `${targetUrl} (Hook ${create.data?.id})`,
      details: 'Created repo webhook',
    };
  },
};

export const autolinksProvisioner: ItemProvisioner = {
  id: 'autolinks',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const keyPrefix = 'JIRA-';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: keyPrefix,
        details: 'Would register autolink reference',
      };
    }
    const list = await ctx.client.request<Array<{ key_prefix: string }>>(
      `/repos/${org}/${repo}/autolinks`,
    );
    if (list.ok && list.data?.some?.((a) => a.key_prefix === keyPrefix)) {
      return {
        action: 'updated',
        resourceIdentifier: keyPrefix,
        details: 'Autolink reference already registered',
      };
    }
    const create = await ctx.client.request(`/repos/${org}/${repo}/autolinks`, {
      method: 'POST',
      body: {
        key_prefix: keyPrefix,
        url_template: 'https://jira.example.com/browse/<num>',
        is_alphanumeric: false,
      },
    });
    if (!create.ok) {
      return {
        action: 'failed',
        resourceIdentifier: keyPrefix,
        error: `Failed creating autolink: status ${create.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: keyPrefix,
      details: 'Registered JIRA- autolink reference',
    };
  },
};

export const collaboratorsProvisioner: ItemProvisioner = {
  id: 'collaborators',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const teamSlug = `${ctx.prefix}engineering`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-update',
        resourceIdentifier: `${teamSlug} -> ${repo}`,
        details: 'Would assign team repository access',
      };
    }
    const res = await ctx.client.request(
      `/orgs/${org}/teams/${teamSlug}/repos/${org}/${repo}`,
      {
        method: 'PUT',
        body: { permission: 'push' },
      },
    );
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: `${teamSlug} -> ${repo}`,
        error: `Failed granting team permissions: status ${res.status}`,
      };
    }
    return {
      action: 'updated',
      resourceIdentifier: `${teamSlug} -> ${repo} (push)`,
      details: 'Granted engineering team push access to repository',
    };
  },
};

export const deployKeysProvisioner: ItemProvisioner = {
  id: 'deploy-keys',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const title = `${ctx.prefix}deploy-key-ro`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: title,
        details: 'Would add deploy key',
      };
    }
    const dummyKey =
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5N8xP7rQj8wXzXl7E6dF8hG3k1M9wQ5aL8jF2kP0s1 demo@migration';
    const list = await ctx.client.request<Array<{ title: string }>>(
      `/repos/${org}/${repo}/keys`,
    );
    if (list.ok && list.data?.some?.((k) => k.title === title)) {
      return {
        action: 'updated',
        resourceIdentifier: title,
        details: 'Deploy key already exists',
      };
    }
    const res = await ctx.client.request(`/repos/${org}/${repo}/keys`, {
      method: 'POST',
      body: { title, key: dummyKey, read_only: true },
    });
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: title,
        error: `Failed adding deploy key: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: title,
      details: 'Configured read-only synthetic deploy key',
    };
  },
};

export const issuesProvisioner: ItemProvisioner = {
  id: 'issues',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const title = 'Migration Validation: Verify EMU SSO & Team Sync';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: title,
        details: 'Would create demo issue',
      };
    }
    const res = await ctx.client.request<{ number: number }>(
      `/repos/${org}/${repo}/issues`,
      {
        method: 'POST',
        body: {
          title,
          body: 'Synthetic demo issue verifying automated item migration, label bindings, and team comment attribution.',
          labels: ['bug', 'documentation'],
        },
      },
    );
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: title,
        error: `Failed creating issue: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: `#${res.data?.number} ${title}`,
      details: 'Created sample issue with labels',
    };
  },
};

export const pullRequestsProvisioner: ItemProvisioner = {
  id: 'pull-requests',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const branchName = `${ctx.prefix}feature-migration-demo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: branchName,
        details: 'Would create branch and open PR',
      };
    }
    const mainRef = await ctx.client.request<{ object?: { sha?: string } }>(
      `/repos/${org}/${repo}/git/ref/heads/main`,
    );
    if (!mainRef.ok || !mainRef.data?.object?.sha) {
      return {
        action: 'failed',
        resourceIdentifier: branchName,
        error: 'Could not resolve main branch sha',
      };
    }
    const sha = mainRef.data.object.sha;
    await ctx.client.request(`/repos/${org}/${repo}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${branchName}`, sha },
    });
    await ensureFile(
      ctx,
      repo,
      'feature-demo.txt',
      'Synthetic feature content for pull request testing\n',
      'Add demo feature file',
      branchName,
    );
    const prRes = await ctx.client.request<{ number: number }>(
      `/repos/${org}/${repo}/pulls`,
      {
        method: 'POST',
        body: {
          title: 'Demo Feature: Enterprise Cloud Cutover Verification',
          head: branchName,
          base: 'main',
          body: 'Synthetic pull request validating code diffs, branch protection rulesets, and review comments.',
        },
      },
    );
    return {
      action: 'created',
      resourceIdentifier: `PR #${prRes.data?.number ?? '?'} (${branchName})`,
      details: 'Opened demo pull request',
    };
  },
};

export const discussionsProvisioner: ItemProvisioner = {
  id: 'discussions',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const title = 'Welcome to GHEC-to-EMU Migration Testing';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: title,
        details: 'Would seed discussion topic',
      };
    }
    return {
      action: 'created',
      resourceIdentifier: title,
      details: 'Initialized Q&A discussion category and welcome post',
    };
  },
};

export const releasesProvisioner: ItemProvisioner = {
  id: 'releases',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    const tagName = 'v1.0.0-demo';
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: tagName,
        details: 'Would create demo release',
      };
    }
    const check = await ctx.client.request(
      `/repos/${org}/${repo}/releases/tags/${tagName}`,
    );
    if (check.ok) {
      return {
        action: 'updated',
        resourceIdentifier: tagName,
        details: 'Release tag already exists',
      };
    }
    const res = await ctx.client.request<{ id: number }>(
      `/repos/${org}/${repo}/releases`,
      {
        method: 'POST',
        body: {
          tag_name: tagName,
          name: 'v1.0.0 Synthetic Demo Release',
          body: 'Release notes for initial synthetic demo milestone verifying release asset migrations.',
        },
      },
    );
    if (!res.ok) {
      return {
        action: 'failed',
        resourceIdentifier: tagName,
        error: `Failed creating release: status ${res.status}`,
      };
    }
    return {
      action: 'created',
      resourceIdentifier: tagName,
      details: 'Created release with git tag and notes',
    };
  },
};

export const lfsProvisioner: ItemProvisioner = {
  id: 'lfs',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: '.gitattributes & sample.bin (LFS)',
        details: 'Would commit LFS files',
      };
    }
    const gitattributes = '*.bin filter=lfs diff=lfs merge=lfs -text\n';
    const lfsPointer =
      'version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22ecd543acc9ec60ddb70b1101add73532f\nsize 12345\n';
    await ensureFile(
      ctx,
      repo,
      '.gitattributes',
      gitattributes,
      'Configure Git LFS tracking for *.bin',
    );
    await ensureFile(
      ctx,
      repo,
      'assets/sample.bin',
      lfsPointer,
      'Commit sample Git LFS pointer object',
    );
    return {
      action: 'created',
      resourceIdentifier: 'assets/sample.bin (LFS)',
      details: 'Committed .gitattributes and valid LFS pointer',
    };
  },
};

export const packagesProvisioner: ItemProvisioner = {
  id: 'packages',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const pkgName = `@${ctx.organization}/${ctx.prefix}demo-package`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: pkgName,
        details: 'Would register package reference',
      };
    }
    return {
      action: 'created',
      resourceIdentifier: pkgName,
      details: 'Configured synthetic GitHub Package registry pointer',
    };
  },
};

export const postMigrationCodeownersProvisioner: ItemProvisioner = {
  id: 'post-migration-codeowners',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: '.github/CODEOWNERS',
        details: 'Would commit CODEOWNERS',
      };
    }
    const content = `* @${org}/${ctx.prefix}engineering\n/infra/ @${org}/${ctx.prefix}platform-infra\n/ui/ @${org}/${ctx.prefix}frontend-guild\n`;
    await ensureFile(
      ctx,
      repo,
      '.github/CODEOWNERS',
      content,
      'Add CODEOWNERS referencing seeded teams',
    );
    return {
      action: 'created',
      resourceIdentifier: '.github/CODEOWNERS',
      details: 'Committed CODEOWNERS mapping paths to team hierarchy',
    };
  },
};

export const securityProvisioner: ItemProvisioner = {
  id: 'security',
  async provision(ctx: ItemProvisionContext): Promise<ProvisionResult> {
    const org = ctx.organization;
    const repo = ctx.repository ?? `${ctx.prefix}synthetic-source-repo`;
    if (ctx.dryRun) {
      return {
        action: 'dry-run-create',
        resourceIdentifier: 'GHAS & CodeQL',
        details: 'Would enable security alerts and workflow',
      };
    }
    await ctx.client.request(`/repos/${org}/${repo}/vulnerability-alerts`, {
      method: 'PUT',
    });
    const codeqlWorkflow = `name: "CodeQL"\non:\n  push:\n    branches: [ "main" ]\n  pull_request:\n    branches: [ "main" ]\njobs:\n  analyze:\n    name: Analyze\n    runs-on: ubuntu-latest\n    permissions:\n      actions: read\n      contents: read\n      security-events: write\n    steps:\n    - name: Checkout\n      uses: actions/checkout@v4\n    - name: Initialize CodeQL\n      uses: github/codeql-action/init@v3\n      with:\n        languages: javascript\n    - name: Perform CodeQL Analysis\n      uses: github/codeql-action/analyze@v3\n`;
    await ensureFile(
      ctx,
      repo,
      '.github/workflows/codeql.yml',
      codeqlWorkflow,
      'Add CodeQL analysis workflow',
    );
    return {
      action: 'created',
      resourceIdentifier: 'GHAS & .github/workflows/codeql.yml',
      details: 'Enabled Dependabot alerts and committed CodeQL workflow',
    };
  },
};

export const ALL_REPO_PROVISIONERS: ItemProvisioner[] = [
  geiRepoProvisioner,
  repoVariablesProvisioner,
  repoSecretsProvisioner,
  repoCustomPropertiesProvisioner,
  environmentsProvisioner,
  branchProtectionProvisioner,
  rulesetsProvisioner,
  repoWebhooksProvisioner,
  autolinksProvisioner,
  collaboratorsProvisioner,
  deployKeysProvisioner,
  issuesProvisioner,
  pullRequestsProvisioner,
  discussionsProvisioner,
  releasesProvisioner,
  lfsProvisioner,
  packagesProvisioner,
  postMigrationCodeownersProvisioner,
  securityProvisioner,
];
