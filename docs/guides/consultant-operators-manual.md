# Consultant Operator's Manual: Running Migrations in GitHub Actions

You can run an entire GitHub Enterprise Cloud (GHEC) to Enterprise Managed Users (GHEC-EMU) migration directly from the **Actions** tab in your browser or with the `gh workflow run` command. You do not need to upload our TypeScript source code to the customer's environment, memorize internal CLI commands, or wait hours for an upfront discovery scan before migrating.

```mermaid
flowchart LR
    Kit["1. Upload Release Kit"] --> Scope["2. Scope Automatically<br/>(All / Public / Private / Internal)"]
    Scope --> DryRun["3. Run Dry-Run Preview<br/>(modules: auto)"]
    DryRun --> Cutover["4. Run Live Migration<br/>(modules: auto)"]
    Cutover --> Results["5. Review Audit & Post-Care Repo"]
```

---

## Installing the Customer Release Kit in the customer's environment

By default, the **Customer Migration Release Kit** (`ghec-migration-kit-vX.Y.Z.tar.gz`) contains only the pre-built CLI bundle (`bin/ghec-consultant-cli.mjs`), the GitHub Actions workflows (`.github/workflows/`), and these user guides. None of the TypeScript source code or test files are included.

```text
ghec-migration-kit/
├── bin/
│   └── ghec-consultant-cli.mjs       # Single pre-built CLI file
├── .github/
│   ├── actions/setup-suite/action.yml
│   └── workflows/                    # Ready-to-run GitHub Actions workflows
├── scopes/                           # Sample scope templates
├── docs/guides/                      # Operator & Customer handbooks
└── package.json
```

To build the release kit archive from the engineering repository (or download it from a GitHub Release):

```bash
npm run build:release-kit
```

To unpack the release kit and push it to a private control repository inside the customer's GHEC environment:

```bash
mkdir customer-migration-control && tar -xzf dist/ghec-migration-kit-v0.1.0.tar.gz -C customer-migration-control
git -C customer-migration-control init -b main
git -C customer-migration-control add .
git -C customer-migration-control commit -m "chore: install GHEC migration release kit"
git -C customer-migration-control remote add origin https://github.com/<customer-org>/migration-control.git
git -C customer-migration-control push -u origin main
```

To save the customer's source and target Classic Personal Access Tokens into the control repository's GitHub Actions secrets:

```bash
gh secret set GHEC_SOURCE_TOKEN --repo <customer-org>/migration-control
gh secret set GHEC_TARGET_TOKEN --repo <customer-org>/migration-control
```

> [!WARNING]
> Always use two separate Classic Personal Access Tokens (`ghp_...`). After creating both tokens, open **GitHub Settings $\rightarrow$ Developer settings $\rightarrow$ Personal access tokens**, click **Configure SSO** next to each token, and click **Authorize** for the customer's organizations.

---

## Scoping and migrating on the same day (no discovery scan needed)

By default, you **do not** need to run the multi-hour **GHEC Discovery Scan** (`discovery-scan.yml`) before generating a scope or running a migration. When you run a migration workflow, it lists your repositories in seconds and uses **`modules: auto`** to inspect and migrate each batch of repositories on the fly.

> [!NOTE]
> **How `modules: auto` works automatically:**
> When `modules` is set to `auto` (the default), the workflow checks each repository's size, Git LFS objects, and release asset sizes right before moving it:
>
> - **Standard repositories (< 10 GiB):** Uses GitHub Enterprise Importer (`gei-repo`) to copy code, issues, pull requests, and releases, and automatically runs all settings, security, rulesets, environments, variables, secrets, and discussions modules.
> - **Repositories with large releases (> 10 GiB):** Automatically skips releases during GEI import and turns on the `releases` streaming module so large binary assets never fail.
> - **Repositories with Git LFS objects:** Automatically turns on the `lfs` streaming module.
> - **Massive repositories (> 40 GiB):** Automatically switches from GEI to `mirror-push` and turns on the standalone `issues`, `pull-requests`, `releases`, and `lfs` modules.

### Option 1: One-click same-day migration (auto-scopes on the fly)

If you want to preview or migrate an entire organization—or all `public`, `private`, or `internal` repositories—in a single step without running `generate-scope.yml` first, pass `source_org` and `target_org` directly to **Parallel Matrix Migration Wave** (`migration-execute-wave.yml`) or **Autonomous Scale-Adaptive Migration** (`migration-e2e-autonomous.yml`).

To preview migrating all repositories and organization settings in one click (`dry_run: true`):

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f target_type="emu" \
  -f emu_shortcode="acme" \
  -f source_visibility="all" \
  -f dry_run="true"
```

To run the live cutover for all repositories and organization settings in one click (`dry_run: false`):

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f target_type="emu" \
  -f emu_shortcode="acme" \
  -f source_visibility="all" \
  -f dry_run="false"
```

### Option 2: Two-step artifact handoff (generate scope artifact first, then migrate)

If you want to inspect the generated repository list before starting the migration wave, run **Generate Migration Scope** (`generate-scope.yml`) first. It finishes in ~5 seconds and uploads the scope as a GitHub Actions artifact (`migration-scopes`) without committing files to git.

To generate a scope artifact for all repositories in your source organization:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f target_type="emu" \
  -f emu_shortcode="acme" \
  -f scope_type="all_repositories"
```

Once the scope artifact is ready, run your dry-run or live migration wave using `scope_run_id="latest"`:

```bash
gh workflow run migration-execute-wave.yml \
  -f scope_run_id="latest" \
  -f dry_run="false"
```

> [!NOTE]
> Need to generate scopes from the command line, filter by repository URL files, or look up every `generate-scope` and `validate-scope` flag? See the dedicated **[Generating and Validating Migration Scopes](generating-migration-scopes.md)** guide.

---

## Migrating by repository visibility (`public`, `private`, or `internal`) or specific items

You can slice your migration into waves by repository visibility (`public`, `private`, or `internal`), pick specific repository names, or run organization settings on their own.

### Recipe A: Migrate only `public`, `private`, or `internal` repositories

Many customers prefer to move `public` or `internal` repositories in Wave 1 and `private` production repositories in Wave 2.

To migrate only **`public`** repositories in one click (and skip forked repositories):

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f source_visibility="public" \
  -f exclude_forks="true" \
  -f dry_run="false"
```

To generate a reusable scope artifact for only **`private`** repositories using `generate-scope.yml`:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="private_repositories_only" \
  -f exclude_forks="true"
```

To generate a reusable scope artifact for only **`internal`** repositories:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="internal_repositories_only"
```

### Recipe B: Migrate 1 to 10 specific repositories by name

To migrate a specific list of repositories right away without running `generate-scope.yml`:

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f repositories="payments-api,web-portal,auth-service" \
  -f dry_run="false"
```

### Recipe C: Migrate only organization-level settings, teams, and secrets (zero repositories)

To set up organization settings, teams, custom roles, and custom properties before moving any repositories:

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f repositories="org_only" \
  -f dry_run="false"
```

### Recipe D: Re-run specific categories or exclude specific modules

To update only branch rulesets, environments, and variables on two already-migrated repositories:

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f repositories="payments-api,web-portal" \
  -f modules="rulesets,environments,repo-variables,repo-secrets" \
  -f dry_run="false"
```

To run `auto` module selection across your repositories while excluding `teams` and `packages`:

```bash
gh workflow run migration-e2e-autonomous.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f modules="auto" \
  -f exclude_modules="teams,packages" \
  -f dry_run="false"
```

### Recipe E: Consolidate `public` repositories from several organizations into one organization (`associated-only` org items)

When a customer moves `public` repositories from several different source organizations into one shared public destination organization, you only want to copy the teams, secrets, variables, rulesets, and runner groups that belong to those `public` repositories—without letting each source organization overwrite the destination organization's global settings.

By default, when you pass a comma-separated list of source organizations (such as `org-a,org-b,org-c`), the tool automatically sets `org_items_mode` to `associated-only`.

To consolidate all `public` repositories and their associated organization items from three source organizations into one public target organization in one click:

```bash
gh workflow run migration-e2e-autonomous.yml \
  -f source_org="acme-alpha,acme-beta,acme-gamma" \
  -f target_org="acme-open-source" \
  -f target_type="ghec" \
  -f source_visibility="public" \
  -f exclude_forks="true" \
  -f org_items_mode="associated-only" \
  -f dry_run="false"
```

To generate a multi-organization consolidation scope artifact first using `generate-scope.yml` (with `{source}-` prefixing if two source organizations have repositories with the same name):

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-alpha,acme-beta,acme-gamma" \
  -f target_org="acme-open-source" \
  -f target_type="ghec" \
  -f scope_type="public_repositories_only" \
  -f org_items_mode="associated-only" \
  -f exclude_forks="true"
```

To migrate only `public` repositories from a **single** source organization while bringing over only the teams, secrets, variables, and rulesets linked to those public repositories:

```bash
gh workflow run migration-execute-wave.yml \
  -f source_org="acme-source" \
  -f target_org="acme-open-source" \
  -f source_visibility="public" \
  -f org_items_mode="associated-only" \
  -f dry_run="false"
```

> [!NOTE]
> **What `org_items_mode: "associated-only"` does automatically:**
>
> - **Teams (`teams`):** Copies only the teams that have access to the repositories in your scope (plus their parent teams so the team tree stays intact).
> - **Org Secrets & Variables (`org-secrets`, `org-variables`):** Skips `private`-only secrets and variables when moving only `public` repositories, filters `selected` secrets/variables to your in-scope repositories, and converts `all`-repository secrets/variables into `selected` secrets/variables scoped only to that source organization's migrated repositories.
> - **Org Rulesets (`org-rulesets`):** Filters repository lists to your in-scope repositories and rewrites `~ALL` rulesets so each source organization's ruleset only applies to its own migrated repositories.
> - **Runner Groups, Packages, Custom Roles & Custom Properties:** Copies only runner groups and packages linked to your in-scope repositories, merges custom property allowed values without overwriting existing values, and skips global organization admin roles.
> - **Global Organization Settings Skipped Automatically:** Skips `org-settings`, `actions-policies`, `ip-allow-lists`, and `org-webhooks` so none of the source organizations overwrite your shared destination organization's global security settings.

> [!TIP]
> **When should I run `discovery-scan.yml`?**
> Only run `discovery-scan.yml` when you want an **offline readiness assessment** (for example, weeks before cutover to review repository sizes and blockers in the offline Dashboard). You never need `discovery-scan.yml` to generate scopes or run migrations.

---

## Resuming a paused migration or fixing missing items

By default, every migration run saves checkpoints as it finishes each step and automatically runs up to 3 self-healing passes at the end of the workflow to fix any temporary rate-limit misses.

To resume an interrupted migration run from its checkpoint in GitHub Actions:

```bash
gh workflow run migration-resume.yml \
  -f run_id="migration-20261016-120000" \
  -f scope="scopes/wave-1.json" \
  -f dry_run="false"
```

To run an extra standalone self-healing pass against the latest migration wave without re-running the whole migration:

```bash
gh workflow run migration-apply-remediation.yml \
  -f workflow_run_id="latest" \
  -f scope_run_id="latest" \
  -f dry_run="false"
```

---

## Reference: All migration module IDs

By default, setting `modules` to `"auto"` selects the appropriate modules automatically. You can also pass any comma-separated combination of these module IDs into `modules`, `exclude_modules`, `org_modules`, or `repo_modules`.

### Organization-level modules

| Module ID                   | Category      | What It Migrates                                                                                 |
| :-------------------------- | :------------ | :----------------------------------------------------------------------------------------------- |
| `org-settings`              | Governance    | Organization profile, default repository permissions, member privileges, and security            |
| `teams`                     | Governance    | Team hierarchy (parent and child teams), descriptions, privacy, and repo permissions             |
| `custom-roles`              | Governance    | Custom organization and repository roles                                                         |
| `org-custom-properties`     | Governance    | Organization custom property schemas, allowed values, and defaults                               |
| `org-rulesets`              | Security      | Organization-level branch and tag rulesets and bypass actors                                     |
| `ip-allow-lists`            | Security      | Organization IP allow list entries (created disabled by default to avoid lockouts)               |
| `actions-policies`          | Actions       | Allowed GitHub Actions policies, fork workflow approvals, and default `GITHUB_TOKEN` permissions |
| `actions-runners`           | Actions       | Organization self-hosted runner group definitions and repository access lists                    |
| `org-variables`             | Actions       | Organization-level GitHub Actions configuration variables (plaintext values)                     |
| `org-secrets`               | Actions       | Organization-level GitHub Actions & Dependabot secret names (sealed blank placeholders)          |
| `org-webhooks`              | Integrations  | Organization webhooks (created inactive by default until cutover)                                |
| `apps-inventory`            | Integrations  | Inventory of installed GitHub Apps and OAuth authorizations for manual re-installation           |
| `projects-v2`               | Collaboration | Organization Projects v2 boards, custom fields (text, number, date, single-select), and views    |
| `packages`                  | Artifacts     | Organization GitHub Packages (npm, Maven, NuGet, Docker/OCI containers, RubyGems)                |
| `post-migration-mannequins` | Identity      | Mannequin inventory and CSV mapping generation for `gh gei reclaim-mannequin`                    |

### Repository-level modules

| Module ID                   | Category      | What It Migrates                                                                                             |
| :-------------------------- | :------------ | :----------------------------------------------------------------------------------------------------------- |
| `gei-repo`                  | Core Repo     | Full Git repository history, branches, tags, commits, issues, and PRs via GitHub Enterprise Importer         |
| `repo-settings`             | Core Repo     | Repository features, merge strategies (`squash`, `rebase`, `merge`), auto-delete branches, and visibility    |
| `repo-custom-properties`    | Governance    | Repository-assigned custom property values                                                                   |
| `collaborators`             | Governance    | Direct repository collaborators and team-to-repository permission bindings                                   |
| `environments`              | Actions       | Deployment environments, wait timers, branch policies, variables, and sealed secret placeholders             |
| `repo-variables`            | Actions       | Repository-level GitHub Actions configuration variables                                                      |
| `repo-secrets`              | Actions       | Repository-level GitHub Actions, Codespaces, and Dependabot secret names (sealed blank placeholders)         |
| `branch-protection`         | Security      | Classic branch protection rules (required reviews, status checks, admin enforcement)                         |
| `rulesets`                  | Security      | Repository branch/tag rulesets and bypass actors                                                             |
| `security`                  | Security      | GitHub Advanced Security settings, Secret Scanning, Push Protection, Dependabot, and CodeQL status           |
| `autolinks`                 | Collaboration | External ticket autolink references (such as `JIRA-<num>` or `Zendesk-<num>`)                                |
| `post-migration-codeowners` | Collaboration | Verified `CODEOWNERS` file validation and team slug remapping advisories                                     |
| `issues`                    | Collaboration | Standalone issue & milestone migration (auto-enabled by `modules: auto` when bypassing GEI)                  |
| `pull-requests`             | Collaboration | Standalone pull request metadata migration (auto-enabled by `modules: auto` when bypassing GEI)              |
| `discussions`               | Collaboration | GitHub Discussions categories, threads, comments, answers, and labels                                        |
| `releases`                  | Artifacts     | Large GitHub Releases and binary release assets (auto-enabled by `modules: auto` when skipping GEI releases) |
| `lfs`                       | Artifacts     | Git Large File Storage (`git-lfs`) objects (auto-enabled by `modules: auto` when LFS objects exist)          |
| `webhooks`                  | Integrations  | Repository webhooks (created inactive by default)                                                            |
| `deploy-keys`               | Integrations  | Repository SSH deploy key inventory and post-care rotation report                                            |

---

## Reference: All GitHub Actions workflows and inputs

Every workflow in `.github/workflows/` can be triggered from the **Actions** tab or via `gh workflow run <workflow-file> -f <input>=<value>`.

### 1. `generate-scope.yml` — Generate Migration Scope

| Input Name              | Default              | Required | Description                                                                                                                                                                     |
| :---------------------- | :------------------- | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source_org`            | —                    |   Yes    | Source GitHub organization login, or comma-separated logins for multi-org consolidation (`org-a,org-b,org-c`).                                                                  |
| `target_org`            | —                    |   Yes    | Target GHEC or GHEC-EMU organization login.                                                                                                                                     |
| `scope_type`            | `'all_repositories'` |   Yes    | Selection mode: `all_repositories`, `public_repositories_only`, `private_repositories_only`, `internal_repositories_only`, `urls_file`, `custom_list`, or `org_resources_only`. |
| `source_visibility`     | `'all'`              |    No    | Filter discovered source repositories by visibility (`all`, `public`, `private`, or `internal`).                                                                                |
| `exclude_forks`         | `false`              |    No    | Exclude forked repositories when discovering organization repositories (`true` or `false`).                                                                                     |
| `org_items_mode`        | `'auto'`             |    No    | Organization items mode: `'auto'` (`all` for 1:1, `associated-only` for multi-org), `'associated-only'` (only items linked to in-scope repos), `'all'`, or `'none'`.            |
| `include_archived`      | `false`              |    No    | Include archived repositories in scope (`true` or `false`).                                                                                                                     |
| `repositories_list`     | `''`                 |    No    | Comma- or newline-separated repository names or URLs (when `scope_type` is `custom_list`).                                                                                      |
| `repos_file_path`       | `''`                 |    No    | Path to repository URLs file in git (when `scope_type` is `urls_file`).                                                                                                         |
| `scope_name`            | `''`                 |    No    | Custom scope filename (without `.json`).                                                                                                                                        |
| `target_type`           | `'ghec'`             |    No    | Target tenant type (`'ghec'` or `'emu'`).                                                                                                                                       |
| `emu_shortcode`         | `''`                 |    No    | Enterprise Managed Users shortcode suffix (for example, `'acme'`).                                                                                                              |
| `target_visibility`     | `'preserve'`         |    No    | Override target repository visibility (`preserve`, `public`, `private`, or `internal`).                                                                                         |
| `target_repo_prefix`    | `''`                 |    No    | Optional prefix for target repository names (supports `'{source}-'` placeholder).                                                                                               |
| `include_org_resources` | `true`               |    No    | Include organization-level settings, teams, custom roles, and secrets (`true` or `false`).                                                                                      |
| `org_modules`           | `''` (`auto`)        |    No    | Optional comma-separated organization module IDs (leave blank for `auto`).                                                                                                      |
| `repo_modules`          | `''` (`auto`)        |    No    | Optional comma-separated repository module IDs (leave blank for `auto`).                                                                                                        |
| `commit_to_branch`      | `false`              |    No    | Commit `scopes/<scope_name>.json` to the git branch. Keep `false` for pure artifact handoff.                                                                                    |

### 2. `migration-execute-wave.yml` — Parallel Matrix Migration Wave

| Input Name          | Default                  | Required | Description                                                                                                                 |
| :------------------ | :----------------------- | :------: | :-------------------------------------------------------------------------------------------------------------------------- |
| `scope`             | `'scopes/wave-1.json'`   |    No    | Path to scope file in git or inside the downloaded scope artifact.                                                          |
| `scope_run_id`      | `''`                     |    No    | Run ID from `generate-scope.yml` (or `'latest'`) to download the `migration-scopes` artifact automatically.                 |
| `source_org`        | `''`                     |    No    | **Inline 1-Click Mode:** Source organization login, or comma-separated logins (`org-a,org-b`) for multi-org consolidation.  |
| `target_org`        | `''`                     |    No    | **Inline 1-Click Mode:** Target organization login.                                                                         |
| `repositories`      | `'all'`                  |    No    | **Inline 1-Click Mode:** `'all'`, `'public'`, `'private'`, `'internal'`, `'org_only'`, or comma-separated repository names. |
| `source_visibility` | `'all'`                  |    No    | **Inline 1-Click Mode:** Filter discovered source repositories by visibility (`all`, `public`, `private`, or `internal`).   |
| `exclude_forks`     | `false`                  |    No    | **Inline 1-Click Mode:** Skip forked repositories when discovering organization repositories (`true` or `false`).           |
| `org_items_mode`    | `'auto'`                 |    No    | Organization items mode (`'auto'`, `'associated-only'`, `'all'`, or `'none'`).                                              |
| `target_type`       | `'ghec'`                 |    No    | Target tenant type (`'ghec'` or `'emu'`).                                                                                   |
| `emu_shortcode`     | `''`                     |    No    | Enterprise Managed Users shortcode (when `target_type` is `'emu'`).                                                         |
| `modules`           | `'auto'`                 |    No    | `'auto'` (strategy-aware selection across all 32 modules), `'all'`, or comma-separated module IDs.                          |
| `runner_capacity`   | `5`                      |    No    | Available parallel runner capacity.                                                                                         |
| `batch_size`        | `5`                      |    No    | Maximum number of repositories per parallel runner cohort.                                                                  |
| `dry_run`           | `true`                   |    No    | Preview mode (`true` makes zero changes; `false` runs the live migration).                                                  |
| `runner_labels`     | `'ubuntu-latest'`        |    No    | Runner label (`'ubuntu-latest'` or `'self-hosted,linux'`).                                                                  |
| `environment_gate`  | `'production-migration'` |    No    | GitHub Environment name for manual approval gates.                                                                          |
| `discovery_run_id`  | `''`                     |    No    | Optional run ID from `discovery-scan.yml` (or `'latest'`) if using a pre-collected discovery bundle.                        |

### 3. `migration-e2e-autonomous.yml` — Autonomous Scale-Adaptive Migration & Remediation

| Input Name                 | Default                | Required | Description                                                                                                                 |
| :------------------------- | :--------------------- | :------: | :-------------------------------------------------------------------------------------------------------------------------- |
| `scope`                    | `'scopes/wave-1.json'` |    No    | Path to scope file in git or inside the downloaded scope artifact.                                                          |
| `scope_run_id`             | `''`                   |    No    | Run ID from `generate-scope.yml` (or `'latest'`) to download the `migration-scopes` artifact automatically.                 |
| `source_org`               | `''`                   |    No    | **Inline 1-Click Mode:** Source organization login, or comma-separated logins (`org-a,org-b`) for multi-org consolidation.  |
| `target_org`               | `''`                   |    No    | **Inline 1-Click Mode:** Target organization login.                                                                         |
| `repositories`             | `'all'`                |    No    | **Inline 1-Click Mode:** `'all'`, `'public'`, `'private'`, `'internal'`, `'org_only'`, or comma-separated repository names. |
| `source_visibility`        | `'all'`                |    No    | **Inline 1-Click Mode:** Filter discovered source repositories by visibility (`all`, `public`, `private`, or `internal`).   |
| `exclude_forks`            | `false`                |    No    | **Inline 1-Click Mode:** Skip forked repositories (`true` or `false`).                                                      |
| `org_items_mode`           | `'auto'`               |    No    | Organization items mode (`'auto'`, `'associated-only'`, `'all'`, or `'none'`).                                              |
| `modules`                  | `'auto'`               |    No    | `'auto'` (strategy-aware selection across all 32 modules) or comma-separated module IDs.                                    |
| `exclude_modules`          | `''`                   |    No    | Optional comma-separated module IDs to skip (for example, `'teams,packages'`).                                              |
| `target_type`              | `'ghec'`               |    No    | Target tenant type (`'ghec'` or `'emu'`).                                                                                   |
| `emu_shortcode`            | `''`                   |    No    | Enterprise Managed Users shortcode (when `target_type` is `'emu'`).                                                         |
| `mirror_push_mode`         | `'fast-snapshot'`      |    No    | Mirror-push mode for massive (>40 GiB) repos (`'fast-snapshot'` or `'full-history'`).                                       |
| `dry_run`                  | `false`                |    No    | Set `true` for dry-run preview or `false` for live execution.                                                               |
| `auto_remediate`           | `true`                 |    No    | Automatically synthesize and execute self-healing remediation rounds.                                                       |
| `max_remediation_rounds`   | `3`                    |    No    | Maximum self-healing retry iterations.                                                                                      |
| `default_runner_labels`    | `'ubuntu-latest'`      |    No    | Runner pool for standard repositories.                                                                                      |
| `large_repo_runner_labels` | `'ubuntu-latest'`      |    No    | High-capacity runner pool for massive (>40 GiB) repositories.                                                               |

### 4. `discovery-scan.yml`, `migration-resume.yml`, `migration-apply-remediation.yml`, and `seed-demo-content.yml`

| Workflow File                     | Key Inputs                                                                                                                              | Purpose                                                                                 |
| :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `discovery-scan.yml`              | `organization`, `modules` (`all`), `redaction_profile` (`standard`), `runner_labels` (`ubuntu-latest`)                                  | Optional deep assessment scan for offline Dashboard analysis prior to migration.        |
| `migration-resume.yml`            | `run_id`, `scope` (`scopes/wave-1.json`), `dry_run` (`false`), `checkpoint_dir`                                                         | Resume a paused or interrupted migration run from its saved checkpoint.                 |
| `migration-apply-remediation.yml` | `workflow_run_id` (`latest`), `scope_run_id` (`latest`), `remediation_plan_path`, `dry_run`, `runner_labels`                            | Run targeted self-healing remediation scripts from a prior verification run.            |
| `seed-demo-content.yml`           | `organization`, `repository`, `scope_level` (`both`/`organization`/`repository`), `content_type` (`all`), `dry_run`, `cleanup_existing` | Create or clean up sample teams, repos, rulesets, LFS files, and secrets in a test org. |

---

## Reference: Standalone CLI commands and flags

If you ever run `node ./bin/ghec-consultant-cli.mjs <command>` directly on a runner or jumphost, every command supports `--help` and the flags below:

| Subcommand             | Supported Flags                                                                                                                                                                                                                                                                                                                                                                                                            |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discover`             | `-o, --organization <org>`, `-m, --modules <list>`, `--output-dir <dir>`, `--verbose`                                                                                                                                                                                                                                                                                                                                      |
| `generate-scope`       | `--source <org1,org2>`, `--target <org>`, `--name <wave>`, `--output <path>`, `--all`, `--source-visibility <all\|public\|private\|internal>`, `--exclude-forks`, `--include-archived`, `--org-items <all\|associated-only\|none>`, `--repos <csv>`, `--file <path>`, `--org-only`, `--include-org-resources <bool>`, `--org-modules <csv>`, `--repo-modules <csv>`, `--target-type <ghec\|emu>`, `--emu-shortcode <code>` |
| `validate-scope`       | `--scope <path>`, `--target-type <ghec\|emu>`, `--emu-shortcode <code>`, `--mirror-push-mode <fast-snapshot\|full-history>`, `--org-items <all\|associated-only\|none>`                                                                                                                                                                                                                                                    |
| `preflight`            | `--scope <path>`, `--modules <list>`, `--verbose`                                                                                                                                                                                                                                                                                                                                                                          |
| `plan`                 | `--scope <path>`, `--modules <list>`, `--exclude-modules <list>`, `--input <bundle>`, `--output <path>`, `--verbose`                                                                                                                                                                                                                                                                                                       |
| `migrate`              | `--scope <path>`, `--modules <list>`, `--exclude-modules <list>`, `--dry-run`, `--resume <runId\|latest>`, `--checkpoint-dir <dir>`, `--output <path>`, `--verbose`                                                                                                                                                                                                                                                        |
| `verify`               | `--scope <path>`, `--modules <list>`, `--exclude-modules <list>`, `--input <bundle>`, `--execution-report <path>`, `--execution-reports <dir>`, `--output <path>`, `--verbose`                                                                                                                                                                                                                                             |
| `agent-review`         | `--report <path>`, `--scope <path>`, `--output <path>`, `--script-output <path>`, `--pr-comment <path>`, `--apply`, `--verbose`                                                                                                                                                                                                                                                                                            |
| `publish-results`      | `--target-org <org>`, `--results-repo <name>`, `--verification-report <path>`, `--remediation-plan <path>`, `--scope <path>`, `--execution-reports <dir>`, `--discovery-dir <dir>`, `--run-id <id>`, `--create-issues`                                                                                                                                                                                                     |
| `seed-demo`            | `--org <org>`, `--repo <repo>`, `--scope <both\|organization\|repository>`, `--preset <all\|core-governance\|actions-and-security\|collaboration\|artifacts-and-code>`, `--dry-run`, `--cleanup`                                                                                                                                                                                                                           |
| `slice-matrix`         | `--scope <path>`, `--discovery-dir <dir>`, `--max-repos <n>`, `--max-weight-bytes <bytes>`                                                                                                                                                                                                                                                                                                                                 |
| `reconcile-visibility` | `--scope <path>`, `--discovery-dir <dir>`, `--dry-run`                                                                                                                                                                                                                                                                                                                                                                     |
| `disk-check`           | `--path <dir>`, `--min-free-gb <n>`                                                                                                                                                                                                                                                                                                                                                                                        |
