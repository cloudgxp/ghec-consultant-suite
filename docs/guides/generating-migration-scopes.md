# Generating and Validating Migration Scopes

A migration scope file (`scopes/*.json`) tells the tool which source organizations, repositories, and organization items to copy to your target organization. By default, you can generate a scope in seconds without running a discovery scan first, and the tool sets `modules` to `auto` so it picks the right migration steps for each repository automatically.

```text
scopes/
├── acme-source-to-acme-emu-all.json          # Full organization migration scope
├── acme-source-to-acme-emu-public.json       # Public repositories wave
└── multi-org-to-acme-open-source-public.json # Multi-org consolidation scope
```

---

## Generating a scope in GitHub Actions

By default, the **Generate Migration Scope** workflow (`generate-scope.yml`) lists your source repositories directly from GitHub, creates a validated JSON scope file, and uploads it as a `migration-scopes` workflow artifact that stays available for 30 days. It does not commit files back to your git branch unless you turn on `commit_to_branch`.

To generate a scope artifact for all non-archived repositories in your source organization:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f target_type="emu" \
  -f emu_shortcode="acme" \
  -f scope_type="all_repositories"
```

To generate a scope artifact for only `public` repositories while skipping forks:

```bash
gh workflow run generate-scope.yml \
  -f source_org="acme-source" \
  -f target_org="acme-emu" \
  -f scope_type="public_repositories_only" \
  -f exclude_forks="true"
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
gh workflow run migration-execute-wave.yml \
  -f scope_run_id="latest" \
  -f dry_run="true"
```

> [!NOTE]
> If you are migrating all repositories—or all `public`, `private`, or `internal` repositories—right away, you can skip `generate-scope.yml` completely. Just pass `source_org` and `target_org` directly to `migration-execute-wave.yml` or `migration-e2e-autonomous.yml`, and the workflow will generate the scope on the fly.

---

## Generating a scope from the command line

By default, the `generate-scope` command connects to GitHub using your `GHEC_SOURCE_TOKEN` (or `GH_TOKEN`), validates the resulting JSON against the migration schema, and saves the file to `./scopes/<name>.json`.

To generate a scope for every non-archived repository in a single source organization:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --target-type emu \
  --emu-shortcode acme \
  --all
```

To preview the generated JSON in your terminal without writing a file to disk, add `--dry-run`:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --all \
  --dry-run
```

To generate a scope for a specific comma-separated list of repositories:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --repos payments-api,web-portal,auth-service \
  --output ./scopes/wave-1.json
```

To generate a scope from a text file containing repository names, `org/repo` slugs, or full GitHub URLs:

```text
# waves/pilot-repos.txt
payments-api
acme-source/web-portal
https://github.com/acme-source/auth-service
```

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --file ./waves/pilot-repos.txt \
  --output ./scopes/pilot-wave.json
```

Once you have saved `./scopes/pilot-wave.json`, you can preview the migration plan from the command line:

```bash
node ./bin/ghec-consultant-cli.mjs plan \
  --scope ./scopes/pilot-wave.json
```

> [!NOTE]
> If you are running commands inside the engineering monorepo instead of the unpacked Release Kit, you can replace `node ./bin/ghec-consultant-cli.mjs` with `npm run dev:cli --` or `npm run scope:generate --`.

---

## Filtering repositories by visibility, forks, and archive status

By default, when you scan a source organization with `--all`, the tool includes `public`, `private`, and `internal` repositories (including forks) and skips archived repositories. You can filter the repository list to match your wave plan.

To include only **`public`** repositories in your scope:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-open-source \
  --source-visibility public \
  --output ./scopes/public-wave.json
```

To include only **`private`** repositories and skip forked repositories:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --source-visibility private \
  --exclude-forks \
  --output ./scopes/private-wave.json
```

To include both **`private` and `internal`** repositories in the same wave, pass a comma-separated list to `--source-visibility`:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --source-visibility private,internal \
  --exclude-forks \
  --output ./scopes/internal-and-private.json
```

To include archived repositories and force all migrated repositories to become `private` in the target organization:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --all \
  --include-archived \
  --target-visibility private \
  --output ./scopes/full-private-target.json
```

> [!NOTE]
> Passing `--source-visibility` (or its shorthand `--visibility`) automatically turns on `--all` organization discovery, so you do not need to type both flags.

---

## Choosing how organization items are migrated (`--org-items`)

By default, a single-organization scope migrates **all** organization-level settings and items (`--org-items all`). When you only migrate a subset of repositories—such as only `public` repositories—you can choose whether to bring over all organization items, **only** the organization items connected to those repositories (`associated-only`), or no organization items at all (`none`).

| `--org-items` Mode | What It Does                                                                                                                                                                                                            | Best Used When                                                                                                                 |
| :----------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `all`              | Copies all organization settings, policies, webhooks, teams, secrets, variables, rulesets, runner groups, custom roles, and packages.                                                                                   | Moving an entire organization ($1 \rightarrow 1$) into a brand-new target organization.                                        |
| `associated-only`  | Skips global organization settings (`org-settings`, `actions-policies`, `ip-allow-lists`, `org-webhooks`) and filters teams, secrets, variables, rulesets, runner groups, custom roles, and packages to in-scope repos. | Moving only `public` (or selected) repositories, or consolidating repositories from several organizations into one target org. |
| `none`             | Skips all organization-level modules and migrates only the repositories themselves.                                                                                                                                     | Running a quick repository-only wave when organization settings and teams are already configured.                              |

To copy **only** the teams, secrets, variables, rulesets, runner groups, and packages that belong to your `public` repositories:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-open-source \
  --source-visibility public \
  --org-items associated-only \
  --output ./scopes/public-with-associated-org-items.json
```

To migrate repositories only and skip all organization-level items:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --repos payments-api,web-portal \
  --org-items none \
  --output ./scopes/repos-only.json
```

To migrate **only** organization-level settings, teams, and secrets without any repositories (`--org-only`):

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --org-only \
  --output ./scopes/org-only.json
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

By default, when you pass a comma-separated list of source organizations to `--source` (or a file containing URLs from multiple organizations), the tool automatically sets `--org-items` to `associated-only` so no single source organization overwrites the target organization's global settings. If two source organizations have a repository with the same name (such as `docs`), the tool automatically prefixes the colliding target repository names with `<source-org>-` (such as `acme-alpha-docs` and `acme-beta-docs`).

To consolidate all `public` repositories and their associated organization items from three source organizations into one public target organization:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-alpha,acme-beta,acme-gamma \
  --target acme-open-source \
  --source-visibility public \
  --exclude-forks \
  --output ./scopes/public-consolidation.json
```

To consolidate specific repositories from multiple source organizations using a text file (without needing `--source`):

```text
# waves/multi-org-public.txt
https://github.com/acme-alpha/public-sdk
https://github.com/acme-beta/public-cli
https://github.com/acme-gamma/docs-site
```

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --target acme-open-source \
  --file ./waves/multi-org-public.txt \
  --org-items associated-only \
  --output ./scopes/multi-org-file-scope.json
```

To prefix **every** migrated repository with its source organization name (`acme-alpha-public-sdk`, `acme-beta-public-cli`), pass `--target-repo-prefix "{source}-"`:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-alpha,acme-beta,acme-gamma \
  --target acme-open-source \
  --source-visibility public \
  --target-repo-prefix "{source}-" \
  --output ./scopes/public-consolidation-prefixed.json
```

> [!NOTE]
> During a multi-organization migration, the tool merges shared organization items—such as organization variables, secrets, and custom property dropdown values—additively across each source organization so the second organization never wipes out the first organization's repository access.

---

## Renaming target repositories and tuning module options

By default, each repository keeps its original name in the target organization and uses `modules: ["auto"]`. You can add prefixes or suffixes to target repository names or override specific module settings.

To add a prefix and suffix to every target repository name:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --repos payments-api,web-portal \
  --target-repo-prefix "legacy-" \
  --target-repo-suffix "-v1" \
  --output ./scopes/renamed-repos.json
```

To generate a scope that runs only specific repository modules (`rulesets`, `environments`, `repo-variables`) instead of `auto`:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --repos payments-api,web-portal \
  --org-items none \
  --repo-modules rulesets,environments,repo-variables \
  --output ./scopes/settings-refresh.json
```

To skip Git LFS streaming or use full-history mirror push for oversized (> 40 GiB) repositories:

```bash
node ./bin/ghec-consultant-cli.mjs generate-scope \
  --source acme-source \
  --target acme-emu \
  --all \
  --lfs-strategy skip \
  --mirror-push-mode full-history \
  --output ./scopes/custom-strategy.json
```

---

## Validating or updating an existing scope file (`validate-scope`)

By default, the `validate-scope` command checks that a JSON scope file matches the `@ghec/contracts` schema (`v1.0.0`) and prints the number of repositories in scope. You can also pass flags to update `targetType`, `emuShortcode`, `mirrorPushMode`, or `orgItemsMode` in-place before validating.

To validate an existing scope file without modifying it:

```bash
node ./bin/ghec-consultant-cli.mjs validate-scope \
  --scope ./scopes/wave-1.json
```

To update an existing scope file to target an Enterprise Managed Users (`emu`) organization and switch its organization items mode to `associated-only`:

```bash
node ./bin/ghec-consultant-cli.mjs validate-scope \
  --scope ./scopes/wave-1.json \
  --target-type emu \
  --emu-shortcode acme \
  --org-items associated-only
```

---

## Complete reference for scope generation options

### CLI flags (`generate-scope`)

| CLI Flag                              | Default               | Description                                                                                                                              |
| :------------------------------------ | :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `--source <org[,org2,...]>`           | Required\*            | Source organization login, or comma-separated logins for multi-org consolidation. (\*Optional if `--file` contains `org/repo` or URLs.)  |
| `--target <org>`                      | Required              | Destination organization login.                                                                                                          |
| `--all`                               | `false`               | Discover all repositories in the source organization(s). Automatically enabled when `--source-visibility` is set.                        |
| `--source-visibility`, `--visibility` | `all`                 | Filter discovered repositories by source visibility: `all`, `public`, `private`, `internal`, or comma-separated like `private,internal`. |
| `--exclude-forks`                     | `false`               | Skip forked repositories when discovering organization repositories.                                                                     |
| `--include-archived`                  | `false`               | Include archived source repositories when discovering organization repositories.                                                         |
| `--repos <repo1,repo2,...>`           | `""`                  | Explicit comma-separated list of repository names, `org/repo` slugs, or URLs.                                                            |
| `--file`, `-f`, `--repos-file <path>` | `""`                  | Path to a text file containing repository names, `org/repo` slugs, or GitHub URLs (one per line; `#` comments allowed).                  |
| `--org-only`                          | `false`               | Generate an organization-only scope with zero repositories (`repositories: []`).                                                         |
| `--org-items <mode>`                  | `all` / `associated`  | Organization items mode: `all` (default for 1 org), `associated-only` (default for multi-org), or `none`.                                |
| `--include-org-resources <bool>`      | `true`                | Set to `false` to omit organization modules (equivalent to `--org-items none`).                                                          |
| `--target-type <ghec\|emu>`           | `ghec`                | Target tenant type. Setting `emu` defaults identity mapping to `emu-saml`; `ghec` defaults to `pass-through`.                            |
| `--emu-shortcode <code\|_code>`       | `""`                  | Enterprise Managed Users shortcode suffix (such as `acme` or `_acme`) used for `emu-saml` mannequin reclamation.                         |
| `--identity-strategy <strategy>`      | Auto from target type | Override identity mapping strategy: `emu-saml`, `pass-through`, or `manual`.                                                             |
| `--identity-suffix <_suffix>`         | `""`                  | Explicit identity suffix when using `--identity-strategy emu-saml`.                                                                      |
| `--target-visibility <vis>`           | Preserves source      | Override target repository visibility: `public`, `private`, or `internal`.                                                               |
| `--target-repo-prefix <prefix>`       | `""`                  | Prefix added to target repository names. Supports `{source}` placeholder (for example, `{source}-`).                                     |
| `--target-repo-suffix <suffix>`       | `""`                  | Suffix added to target repository names. Supports `{source}` placeholder.                                                                |
| `--org-modules <mod1,mod2\|auto>`     | `auto`                | Comma-separated list of organization modules, or `auto` for automatic strategy resolution.                                               |
| `--repo-modules <mod1,mod2\|auto>`    | `auto`                | Comma-separated list of repository modules, or `auto` for automatic scale-adaptive resolution.                                           |
| `--lfs-strategy <strategy>`           | `dual-remote-stream`  | Git LFS strategy for scoped repositories: `dual-remote-stream` or `skip`.                                                                |
| `--use-gei <true\|false>`             | `true`                | Use GitHub Enterprise Importer (`true`) or force standalone git/metadata modules (`false`).                                              |
| `--skip-releases`                     | `false`               | Skip migrating releases during GEI import.                                                                                               |
| `--mirror-push-mode <mode>`           | `fast-snapshot`       | Mirror-push mode for oversized (> 40 GiB) repositories: `fast-snapshot` or `full-history`.                                               |
| `--name <scope-name>`                 | Auto-generated        | Scope name stored in JSON and used for the default filename (`scopes/<name>.json`).                                                      |
| `--output`, `--out <path>`            | `scopes/<name>.json`  | Custom output file path for the generated scope JSON.                                                                                    |
| `--dry-run`                           | `false`               | Print the validated scope JSON to `stdout` without writing a file to disk.                                                               |

### GitHub Actions workflow inputs (`generate-scope.yml`)

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
| `commit_to_branch`      | `boolean` | `false`              | Commit and push the generated scope JSON back to the git branch in addition to uploading the `migration-scopes` workflow artifact.                              |
