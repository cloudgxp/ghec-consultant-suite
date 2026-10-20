# Generating and Validating Migration Scopes

A migration scope file (`scopes/*.json`) tells the platform which source organizations, repositories, and organization items to copy to your target organization. By default, you can generate a scope in seconds from the **GitHub Actions Web UI** or with the **GitHub CLI (`gh`)** without running a discovery scan first, and the workflow sets `modules` to `auto` so it picks the right migration steps for each repository automatically.

```text
scopes/
├── acme-source-to-acme-emu-all.json          # Full organization migration scope
├── acme-source-to-acme-emu-public.json       # Public repositories wave
└── multi-org-to-acme-open-source-public.json # Multi-org consolidation scope
```

---

## Generating a scope in the GitHub Web UI or with the `gh` CLI

By default, the **Generate Migration Scope** workflow (`generate-scope.yml`) lists your source repositories directly from GitHub, creates a validated JSON scope file, and uploads it as a `migration-scopes` workflow artifact that stays available for 30 days. It does not commit files back to your git branch unless you turn on `commit_to_branch`.

### Option 1: Using the GitHub Actions Web UI

1. Open your migration control repository in your browser and click the **Actions** tab.
2. Click **Generate Migration Scope** in the left sidebar, then click the **Run workflow** dropdown button.
3. Fill in **Source organization** (for example, `acme-source`), **Target organization** (`acme-emu`), **Target tenant type** (`emu`), and **EMU shortcode** (`acme`).
4. Choose your **Scope selection mode** (such as `all_repositories`, `public_repositories_only`, `private_repositories_only`, `custom_list`, or `urls_file`) and click the green **Run workflow** button.

### Option 2: Using the GitHub CLI (`gh`)

To generate a scope artifact for all non-archived repositories in your source organization:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f target_type="emu" \
  -f emu_shortcode="acme" \
  -f scope_type="all_repositories"
```

To generate a scope artifact for a specific comma-separated list of repositories (`custom_list`):

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="custom_list" \
  -f repositories_list="payments-api,web-portal,auth-service" \
  -f scope_name="wave-1"
```

To generate a scope artifact from a text file of repository URLs or names (`waves/wave-1.txt`) in your repository:

```text
# waves/wave-1.txt
https://github.com/acme-source/payments-api
https://github.com/acme-source/web-portal
acme-source/shared-ui
```

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="urls_file" \
  -f repos_file_path="waves/wave-1.txt" \
  -f scope_name="wave-1"
```

Once your scope artifact is ready, you can run a dry-run preview or live migration wave using `scope_run_id="latest"`:

```bash
gh workflow run migration-e2e-autonomous.yml \
  -f scope_run_id="latest" \
  -f dry_run="true"
```

> [!NOTE]
> If you are migrating all repositories—or all `public`, `private`, or `internal` repositories—right away, you can skip `generate-scope.yml` completely. Just pass `source_org` and `target_org` directly to **Autonomous Scale-Adaptive Migration** (`migration-e2e-autonomous.yml`) in the **Actions** tab or via `gh workflow run`, and the workflow will generate the scope on the fly.

---

## Filtering repositories by visibility, forks, and archive status

By default, when you scan a source organization with `all_repositories`, the workflow includes `public`, `private`, and `internal` repositories (including forks) and skips archived repositories. You can filter the repository list in the **Run workflow** menu or via `-f` flags to match your wave plan.

To generate a scope for only **`public`** repositories while skipping forked repositories:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-open-source" \
  -f scope_type="public_repositories_only" \
  -f exclude_forks="true" \
  -f scope_name="public-wave"
```

To generate a scope for only **`private`** repositories and skip forked repositories:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="private_repositories_only" \
  -f exclude_forks="true" \
  -f scope_name="private-wave"
```

To generate a scope for only **`internal`** repositories:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="internal_repositories_only" \
  -f scope_name="internal-wave"
```

To include archived source repositories and force all migrated repositories to become `private` in the target organization:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="all_repositories" \
  -f include_archived="true" \
  -f target_visibility="private" \
  -f scope_name="full-private-target"
```

---

## Choosing how organization items are migrated (`org_items_mode`)

By default, a single-organization scope migrates **all** organization-level settings and items (`org_items_mode: "auto"` resolves to `"all"`). When you only migrate a subset of repositories—such as only `public` repositories—you can choose whether to bring over all organization items, **only** the organization items connected to those repositories (`associated-only`), or no organization items at all (`none`).

| `org_items_mode`  | What It Does                                                                                                                                                                                                            | Best Used When                                                                                                                 |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `all`             | Copies all organization settings, policies, webhooks, teams, secrets, variables, rulesets, runner groups, custom roles, and packages.                                                                                   | Moving an entire organization ($1 \rightarrow 1$) into a brand-new target organization.                                        |
| `associated-only` | Skips global organization settings (`org-settings`, `actions-policies`, `ip-allow-lists`, `org-webhooks`) and filters teams, secrets, variables, rulesets, runner groups, custom roles, and packages to in-scope repos. | Moving only `public` (or selected) repositories, or consolidating repositories from several organizations into one target org. |
| `none`            | Skips all organization-level modules and migrates only the repositories themselves.                                                                                                                                     | Running a quick repository-only wave when organization settings and teams are already configured.                              |

To copy **only** the teams, secrets, variables, rulesets, runner groups, and packages that belong to your `public` repositories:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-open-source" \
  -f scope_type="public_repositories_only" \
  -f org_items_mode="associated-only" \
  -f scope_name="public-with-associated-org-items"
```

To migrate repositories only and skip all organization-level items:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="custom_list" \
  -f repositories_list="payments-api,web-portal" \
  -f org_items_mode="none" \
  -f scope_name="repos-only"
```

To migrate **only** organization-level settings, teams, and secrets without any repositories (`org_resources_only`):

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="org_resources_only" \
  -f scope_name="org-only"
```

> [!NOTE]
> **What happens behind the scenes in `associated-only` mode:**
>
> - **Teams (`teams`):** Copies only teams that have permissions on at least one repository in your scope (plus their parent teams so your team tree stays intact).
> - **Organization Variables & Secrets (`org-variables`, `org-secrets`):** Skips `private`-only secrets and variables when your scope only has public repositories, and converts `all`-repository secrets and variables to `selected` so they only apply to your migrated repositories.
> - **Organization Rulesets (`org-rulesets`):** Copies only rulesets whose repository conditions match your in-scope repositories, and rewrites `~ALL` rulesets to target your migrated repository names instead of the whole target organization.
> - **Runner Groups (`actions-runners`):** Skips the built-in `Default` group and private-only runner groups (for public scopes), and rewrites workflow restrictions to your target repository names.

---

## Consolidating multiple source organizations into one target organization

By default, when you pass a comma-separated list of source organizations to `source_org` (or a file containing URLs from multiple organizations), the workflow automatically sets `org_items_mode` to `associated-only` so no single source organization overwrites the target organization's global settings. If two source organizations have a repository with the same name (such as `docs`), the tool automatically prefixes the colliding target repository names with `<source-org>-` (such as `acme-alpha-docs` and `acme-beta-docs`).

To consolidate all `public` repositories and their associated organization items from three source organizations into one public target organization:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-alpha,acme-beta,acme-gamma" \
  -f target_org="acme-open-source" \
  -f target_type="ghec" \
  -f scope_type="public_repositories_only" \
  -f org_items_mode="associated-only" \
  -f exclude_forks="true" \
  -f scope_name="public-consolidation"
```

To prefix **every** migrated repository with its source organization name (`acme-alpha-public-sdk`, `acme-beta-public-cli`), pass `target_repo_prefix="{source}-"`:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-alpha,acme-beta,acme-gamma" \
  -f target_org="acme-open-source" \
  -f scope_type="public_repositories_only" \
  -f target_repo_prefix="{source}-" \
  -f scope_name="public-consolidation-prefixed"
```

> [!NOTE]
> During a multi-organization migration, the tool merges shared organization items—such as organization variables, secrets, and custom property dropdown values—additively across each source organization so the second organization never wipes out the first organization's repository access.

---

## Reviewing and validating a scope with a Pull Request

By default, `generate-scope.yml` validates the scope automatically during the workflow run. If your team wants a formal Pull Request approval gate where the **Migration Plan PR** workflow (`migration-plan-pr.yml`) posts a dry-run plan table directly onto a Pull Request comment, you can commit your scope file to a branch.

To commit the generated scope directly to your branch from `generate-scope.yml`, set `commit_to_branch="true"`:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="all_repositories" \
  -f scope_name="wave-1" \
  -f commit_to_branch="true"
```

To download a generated scope artifact to your computer to inspect it or open a Pull Request:

```bash
RUN_ID=$(gh run list --workflow=generate-scope.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download "$RUN_ID" --name migration-scopes --dir ./scopes
```

To open a Pull Request with a scope file in `scopes/wave-1.json` so the automatic plan check comments on the PR:

```bash
git checkout -b plan-wave-1
git add scopes/wave-1.json
git commit -m "docs(scope): add wave 1 scope"
git push -u origin plan-wave-1
gh pr create --fill
```

---

## Complete reference for `generate-scope.yml` inputs

Every input below is available in the **Actions $\rightarrow$ Generate Migration Scope $\rightarrow$ Run workflow** dropdown menu in your browser or via `gh workflow run generate-scope.yml -f <input>=<value>`:

| Workflow Input          | Type      | Default              | Description                                                                                                                                                     |
| :---------------------- | :-------- | :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_org`            | `string`  | **Required**         | Source organization login, or comma-separated logins (`org-a,org-b,org-c`) when consolidating multiple organizations into one target org.                       |
| `target_org`            | `string`  | **Required**         | Target organization login.                                                                                                                                      |
| `scope_type`            | `choice`  | `all_repositories`   | `all_repositories`, `public_repositories_only`, `private_repositories_only`, `internal_repositories_only`, `urls_file`, `custom_list`, or `org_resources_only`. |
| `source_visibility`     | `choice`  | `all`                | Filter discovered source repositories by visibility: `all`, `public`, `private`, or `internal`.                                                                 |
| `exclude_forks`         | `boolean` | `false`              | Exclude forked repositories when scanning the source organization(s).                                                                                           |
| `org_items_mode`        | `choice`  | `auto`               | `auto` (`all` for single-org, `associated-only` for multi-org), `associated-only` (only items linked to in-scope repos), `all`, or `none`.                      |
| `repos_file_path`       | `string`  | `""`                 | Path to a text file of repository URLs or names in the repo (when `scope_type` is `urls_file`).                                                                 |
| `repositories_list`     | `string`  | `""`                 | Comma- or newline-separated repository names or URLs (when `scope_type` is `custom_list`).                                                                      |
| `scope_name`            | `string`  | Auto-generated       | Custom scope filename (without `.json`).                                                                                                                        |
| `target_type`           | `choice`  | `ghec`               | `ghec` (standard GHEC) or `emu` (Enterprise Managed Users).                                                                                                     |
| `emu_shortcode`         | `string`  | `""`                 | EMU shortcode suffix (such as `acme` or `_acme`) when `target_type` is `emu`.                                                                                   |
| `lfs_strategy`          | `choice`  | `dual-remote-stream` | `dual-remote-stream` or `skip`.                                                                                                                                 |
| `target_visibility`     | `choice`  | `preserve`           | `preserve`, `public`, `private`, or `internal`.                                                                                                                 |
| `include_archived`      | `boolean` | `false`              | Include archived source repositories in the scope.                                                                                                              |
| `target_repo_prefix`    | `string`  | `""`                 | Optional prefix for target repository names (supports `{source}-` placeholder).                                                                                 |
| `target_repo_suffix`    | `string`  | `""`                 | Optional suffix for target repository names (supports `{source}` placeholder).                                                                                  |
| `skip_releases`         | `boolean` | `false`              | Skip migrating releases and release assets.                                                                                                                     |
| `mirror_push_mode`      | `choice`  | `fast-snapshot`      | `fast-snapshot` or `full-history` for oversized (> 40 GiB) repositories.                                                                                        |
| `include_org_resources` | `boolean` | `true`               | Include organization-level migration modules in the scope.                                                                                                      |
| `org_modules`           | `string`  | `""` (`auto`)        | Optional comma-separated list of organization modules (leave blank for `auto`).                                                                                 |
| `repo_modules`          | `string`  | `""` (`auto`)        | Optional comma-separated list of repository modules (leave blank for `auto`).                                                                                   |
| `sandbox_rehearsal`     | `boolean` | `false`              | Sandbox rehearsal mode: keep all target Webhooks and GitHub Actions disabled (`true` or `false`).                                                               |
| `commit_to_branch`      | `boolean` | `false`              | Commit and push the generated scope JSON back to the git branch in addition to uploading the `migration-scopes` workflow artifact.                              |
