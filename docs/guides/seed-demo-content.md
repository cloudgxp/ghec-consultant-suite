# Creating sample data for a demo

You can use the `seed-demo` command to fill a test GitHub organization with 34 realistic sample items—including teams, repositories, branch rules, pull requests, and Actions secrets. This gives you a ready-to-use environment for live demos or practice migrations without setting everything up by hand.

---

## Creating demo content from the command line

By default, `seed-demo` reads your GitHub token from the `GHEC_TOKEN` environment variable and creates all 34 sample items. If the target repository does not exist yet, the tool creates and initializes it for you.

Before you start, make sure you have Node.js `22.13.0` or newer, you have built the project (`npm run build:packages`), and your GitHub token has `admin:org`, `repo`, `delete_repo`, and `workflow` permissions.

To create all 34 sample items in your organization and repository:

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo"
```

To preview what the command will create without making any changes on GitHub, add the `--dry-run` option:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --dry-run
```

To create only one category of sample items (such as organization teams and settings), use `--scope` and `--preset`:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --scope "organization" \
  --preset "core-governance"
```

You can pick from any of these `--preset` categories:

- `all`: Creates all 34 sample items. This is the default.
- `core-governance`: Organization settings, teams (`engineering`, `platform-infra`, `frontend-guild`), custom roles, IP allow lists, custom properties, and outside collaborators.
- `actions-and-security`: Actions rules, runner groups, variables, secrets, environments (`production`, `staging`), branch rules, and security settings.
- `collaboration`: Project boards, issues, milestones, labels, pull requests with comments, Discussions, Jira links, and a `CODEOWNERS` file.
- `artifacts-and-code`: Releases with attached files, Git LFS files, Packages, deploy keys, webhooks, and a list of installed GitHub Apps.

To create just a few specific items instead of a whole category, pass a comma-separated list:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --preset "teams,rulesets,environments"
```

You can also run the standalone script directly without the CLI wrapper:

```bash
node --import tsx scripts/seed-demo-content.ts \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --preset "actions-and-security"
```

> [!NOTE]
> This command is safe to run more than once. If the sample items already exist, the tool updates them instead of failing or creating duplicates.

---

## Creating demo content with GitHub Actions

If you prefer not to run commands on your computer, you can run the **Seed Demo Content** workflow directly in GitHub Actions (`.github/workflows/seed-demo-content.yml`). By default, the workflow uses the `GHEC_SOURCE_TOKEN` secret stored in your repository and posts a summary table when it finishes.

To run the workflow from the GitHub website:

1. Open the **Actions** tab in your repository and click **Seed Demo Content** on the left.
2. Click **Run workflow**.
3. Type your target **organization** name and optional **repository** name, then click **Run workflow**.

To start the same workflow from your terminal using the GitHub CLI (`gh`):

```bash
gh workflow run seed-demo-content.yml \
  -f organization="octodemo-migration" \
  -f repository="demo-ecommerce-monorepo"
```

To preview an organization-only run using a different secret name:

```bash
gh workflow run seed-demo-content.yml \
  -f organization="octodemo-migration" \
  -f scope_level="organization" \
  -f content_type="core-governance" \
  -f pat_secret_name="CUSTOM_DEMO_PAT" \
  -f dry_run="true"
```

> [!NOTE]
> If your test organization does not have a GitHub Enterprise plan, the tool automatically skips Enterprise-only settings (like IP allow lists and runner groups) and prints a short note in the summary.

---

## Deleting demo content

When you finish your demo or want a fresh start, you can remove the sample items. Every item created by the tool starts with `demo-`, and the cleanup command only deletes items with that `demo-` prefix.

To delete existing demo items from the command line, add the `--cleanup` option:

```bash
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --cleanup
```

To delete existing demo items and recreate them in GitHub Actions, set `cleanup_existing` to `true`:

```bash
gh workflow run seed-demo-content.yml \
  -f organization="octodemo-migration" \
  -f repository="demo-ecommerce-monorepo" \
  -f cleanup_existing="true"
```

---

## How the demo tool keeps your organization safe

You can run the demo tool in a test organization without worrying about breaking existing work or leaking passwords:

- **Safe to run more than once:** If the sample items already exist, the tool updates them instead of failing or making duplicates.
- **Only touches demo items:** Every item the tool creates starts with `demo-`. When you run `--cleanup`, it only deletes items that start with `demo-` and leaves your real repositories and teams alone.
- **Keeps tokens and secrets private:** Sample secrets are encrypted before they are sent to GitHub, and your personal access token is automatically hidden in all logs and reports.
- **Skips missing Enterprise features automatically:** If your test organization does not have a GitHub Enterprise plan, the tool skips Enterprise-only settings and prints a friendly note instead of crashing.
