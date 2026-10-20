# ghec-consultant-cli

`ghec-consultant-cli` is the command-line tool for discovering GitHub organizations, planning migrations, moving items to your target organization, checking results, and publishing audit reports.

---

## Installing and building the command-line tool

By default, `ghec-consultant-cli` runs directly from this workspace using Node.js 22.13+ and npm 10+ without needing a global install. The tool reads your GitHub token from the `GHEC_TOKEN` environment variable.

To install workspace dependencies and build the project from the repository root:

```bash
npm ci
npm run build
```

To view the main help menu during development:

```bash
npm run dev:cli -- --help
```

To check the CLI version using the npm workspace runner:

```bash
npm exec --workspace ghec-consultant-cli -- ghec-consultant-cli --version
```

To run the compiled CLI binary directly and inspect options for a command:

```bash
node apps/cli/dist/index.js discover --help
```

To run the automated test suite:

```bash
npm test
```

> [!WARNING]
> Never pass tokens as command-line arguments. Always set `GHEC_TOKEN` in your environment (and optional `GHEC_BASE_URL` when connecting to GitHub Enterprise Server or a local proxy). The `.env.example` file is for reference only, and `.env` files are ignored.

---

## Checking available commands and help menus

By default, `ghec-consultant-cli` includes 14 commands that cover discovery, scoping, migration, verification, cutover, and sandbox testing:

- `discover`: Collect metadata from your source organization or enterprise and save a `DiscoveryBundle` JSON file.
- `generate-scope`: Generate a schema-validated `MigrationScope` JSON file from live organization discovery or repository lists.
- `validate-scope`: Validate a `MigrationScope` JSON file against the `@ghec/contracts` schema and apply optional overrides.
- `preflight`: Verify token scopes, ruleset bypass actors (`DEC-012`), and repository size limits before migrating.
- `plan`: Compare your source and target organizations and save a `MigrationPlan` JSON file.
- `migrate`: Run an approved migration plan (or scope file) with preview (`--dry-run`) and checkpoint resume (`--resume`) support.
- `verify`: Check the target organization after migration to confirm everything matches the plan.
- `agent-review`: Analyze a `VerificationReport` and synthesize an idempotent `remediation-plan.json` and `remediation.sh`.
- `publish-results`: Build markdown reports, `POST-CARE-CHECKLIST.md`, and push the audit results repository to the target organization.
- `cutover`: Detach unique SSH deploy keys and Pages custom domains from source repositories, freeze source repos, and bind to target.
- `console`: Launch the local loopback API proxy (`127.0.0.1:4174`) for live Dashboard control-plane operations.
- `audit-gap-ledger`: Export the platform capability gap analysis ledger in JSON, table, or Markdown format.
- `seed-demo`: Populate a test organization and repository with 34 realistic sample items for demos or rehearsals.
- `teardown-sandbox`: Safely purge prefixed test resources (`demo-*`, `dummy-*`) from a target sandbox organization.

To view the global help menu or check the version:

```bash
ghec-consultant-cli --help
ghec-consultant-cli --version
```

To view the options for a specific command such as `discover` or `migrate`:

```bash
ghec-consultant-cli discover --help
ghec-consultant-cli migrate --help
```

---

## Discovering organization and enterprise data

By default, `ghec-consultant-cli discover` collects metadata from your source GitHub organization or enterprise and writes a JSON bundle to the `./scans` folder without overwriting existing files.

```text
scans/
└── ghec-discovery-enterprise-fictional-enterprise-20260101T120000000Z-example.json
reports/
fixtures/synthetic/
├── enterprise-v1.json
├── organization-v1.json
├── specialized-v1.json
└── partial-denied-v1.json
```

To collect all discovery categories for a single organization:

```bash
ghec-consultant-cli discover --modules all --organization "$YOUR_GITHUB_ORG"
```

To preview the collection order and API call estimates without contacting GitHub or writing files, add `--dry-run`:

```bash
ghec-consultant-cli discover --modules all --organization "$YOUR_GITHUB_ORG" --dry-run
```

To collect only specific categories (such as repositories, teams, Git LFS, and Actions):

```bash
ghec-consultant-cli discover --modules repos,teams,lfs,actions --organization "$YOUR_GITHUB_ORG"
```

To scan every accessible organization in an enterprise and keep running even if one collector fails:

```bash
ghec-consultant-cli discover --modules all --enterprise "$YOUR_ENTERPRISE_NAME" --continue-on-error --output ./scans/engagement.json
```

To save discovery output to a custom folder with standard identity redaction:

```bash
ghec-consultant-cli discover --modules users,integrations --organization fictional-north --redaction-profile standard --output ./scans --format json
```

| Option                                    | Default / behavior                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--organization <name>`                   | Scans one organization; cannot be combined with `--enterprise`                                                         |
| `--enterprise <slug>`                     | Scans every accessible organization in the enterprise                                                                  |
| `--modules <list\|all>`                   | **Required**; comma-separated list of modules or `all` (automatically includes required prerequisite modules)          |
| `--output <path>`                         | `./scans`; output folder or explicit `.json` file path                                                                 |
| `--format json`                           | `json`; only JSON output is supported                                                                                  |
| `--dry-run`                               | `false`; prints the collection order, request estimates, and token status without making network calls, then exits `0` |
| `--include-sensitive-metadata`            | `false`; includes approved metadata names only, never secret values                                                    |
| `--redaction-profile <standard\|minimal>` | `standard`; replaces user logins with run-scoped pseudonyms                                                            |
| `--continue-on-error`                     | `false`; keeps running remaining collectors when one fails and exits with code `4`                                     |
| `--verbose`                               | `false`; prints extra troubleshooting messages with tokens removed                                                     |
| `--help`, `--version`                     | Shows command help or version information                                                                              |

> [!NOTE]
> Start with one organization and a small module list before running broad enterprise scans. Avoid running multiple scans at the same time with the same token so you do not hit GitHub rate limits.

---

## Building a migration plan

By default, `ghec-consultant-cli plan` compares your source data against the target organization and saves the migration plan to `./scans/migration-plan.json`.

To build a migration plan using a scope file and live GitHub connections:

```bash
ghec-consultant-cli plan --scope ./scopes/org-scope.json --output ./scans/migration-plan.json
```

To build a plan without calling the source GitHub API by reusing a saved discovery bundle, add `--input`:

```bash
ghec-consultant-cli plan --scope ./scopes/org-scope.json --input ./scans/discovery-bundle.json --output ./scans/migration-plan.json
```

To plan only specific modules (such as repository variables):

```bash
ghec-consultant-cli plan --scope ./scopes/org-scope.json --modules repo-variables --output ./scans/migration-plan.json
```

| Option                             | Default / behavior                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `--scope <file>`                   | **Required**; path to your `MigrationScope` JSON file                                  |
| `--input <file>`                   | Optional path to a saved `DiscoveryBundle` JSON file (skips source API calls)          |
| `--modules <list>`                 | Comma-separated module IDs to include (defaults to all modules in the scope)           |
| `--output <file>`                  | Output path for the `MigrationPlan` JSON file (default: `./scans/migration-plan.json`) |
| `--source-token`, `--target-token` | Optional token overrides (defaults to `GHEC_TOKEN` and `GHEC_TARGET_TOKEN`)            |

---

## Running a migration

By default, `ghec-consultant-cli migrate` runs your approved plan against the target organization and writes an execution report to `./scans/migration-execution.json`.

To preview the migration without making any changes in the target organization, add `--dry-run`:

```bash
ghec-consultant-cli migrate --plan ./scans/migration-plan.json --dry-run
```

To run a live migration from an approved plan file:

```bash
ghec-consultant-cli migrate --plan ./scans/migration-plan.json --output ./scans/execution-report.json
```

To keep running remaining modules even if one module encounters an error, add `--continue-on-error`:

```bash
ghec-consultant-cli migrate --plan ./scans/migration-plan.json --continue-on-error
```

To build a plan and preview a migration directly from a scope file in one step:

```bash
ghec-consultant-cli migrate --scope ./scopes/org-scope.json --dry-run
```

| Option                  | Default / behavior                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `--plan <file>`         | Path to an approved `MigrationPlan` JSON file                                               |
| `--scope <file>`        | Path to a `MigrationScope` JSON file (used when `--plan` is not provided)                   |
| `--dry-run`             | Previews all changes without modifying the target organization and exits with code `0`      |
| `--continue-on-error`   | Continues running remaining modules if one fails and exits with code `4` on partial success |
| `--output <file>`       | Output path for `MigrationExecutionReport` (default: `./scans/migration-execution.json`)    |
| `--resume [id\|latest]` | Resumes an interrupted migration from a saved checkpoint                                    |
| `--publish-results`     | Builds and pushes the results repository to the target organization when the migration ends |

---

## Verifying a completed migration

By default, `ghec-consultant-cli verify` checks the target organization against your migration plan and saves a report to `./scans/verification-report.json`.

To check that the target organization matches your migration plan:

```bash
ghec-consultant-cli verify --plan ./scans/migration-plan.json --output ./scans/verification-report.json
```

To include your scope file for extra organization context during verification:

```bash
ghec-consultant-cli verify --plan ./scans/migration-plan.json --scope ./scopes/org-scope.json
```

| Option            | Default / behavior                                                                 |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--plan <file>`   | **Required**; path to the `MigrationPlan` JSON file to check against               |
| `--scope <file>`  | Optional path to the `MigrationScope` JSON file for organization details           |
| `--output <file>` | Output path for `VerificationReport` (default: `./scans/verification-report.json`) |
| `--target-token`  | Optional token override for the target organization                                |

---

## Publishing migration results to GitHub

By default, `ghec-consultant-cli publish-results` combines your execution report, verification report, and fix plan into a `gei-migration-results` repository in the target organization.

To generate the markdown report files locally in `./scans/results-repo` without pushing to GitHub, add `--skip-push`:

```bash
ghec-consultant-cli publish-results \
  --scope ./scopes/org-scope.json \
  --skip-push \
  --output-dir ./scans/results-repo
```

To preview the commit and file structure without changing the remote repository, add `--dry-run`:

```bash
ghec-consultant-cli publish-results \
  --scope ./scopes/org-scope.json \
  --output-dir ./scans/results-repo \
  --dry-run
```

To publish the full results repository directly to your target organization:

```bash
ghec-consultant-cli publish-results \
  --execution-report ./scans/migration-execution.json \
  --verification-report ./scans/verification-report.json \
  --remediation-plan ./scans/remediation-plan.json \
  --target-org "$TARGET_ORG"
```

| Option                         | Default / behavior                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `--execution-report <file>`    | Path to the `MigrationExecutionReport` JSON file                                           |
| `--verification-report <file>` | Path to the `VerificationReport` JSON file                                                 |
| `--remediation-plan <file>`    | Path to the `RemediationPlan` JSON file                                                    |
| `--scope <file>`               | Path to the `MigrationScope` JSON file (used to look up organization and repository names) |
| `--target-org <name>`          | Target GitHub organization name                                                            |
| `--source-org <name>`          | Source GitHub organization name                                                            |
| `--repo-name <name>`           | Target audit repository name (default: `gei-migration-results`)                            |
| `--output-dir <path>`          | Local folder for markdown files and manifest (default: `./scans/results-repo`)             |
| `--dry-run`                    | Previews repository creation and commits without changing the remote repository            |
| `--skip-push`                  | Writes local files only and skips remote repository creation and push                      |
| `--append-step-summary`        | Appends the summary markdown to `$GITHUB_STEP_SUMMARY` in GitHub Actions                   |
| `--branch <name>`              | Branch name to commit results to (default: `main`)                                         |

---

## Opening discovery bundles in the offline dashboard

By default, each discovery run writes a single schema-validated JSON bundle (`1.0.0`) containing `schemaVersion`, `synthetic`, `scan`, `configuration`, `scope`, `organizations`, `collectors`, `entities`, `findings`, `limitations`, `errors`, and `summary`. See the [data contract](../../docs/specs/data-contract.md) for field details.

To open the local web dashboard and inspect a saved discovery bundle offline:

```bash
npm run dev
```

Once the dashboard opens in your browser, click **Import bundle**, select your JSON file from `./scans/`, and review the readiness views and PDF/CSV exports.

> [!NOTE]
> The dashboard runs completely offline and never needs a GitHub token or internet connection. Review [security and privacy](../../docs/specs/security-and-privacy.md) for data-handling rules: secret values, private keys, and tokens are never collected or written to bundles.

---

## Running scans and migrations with GitHub Actions

By default, you can run organization discovery scans and parallel migration waves directly in GitHub Actions:

- **Discovery Scan Workflow** ([`../../.github/workflows/discovery-scan.yml`](../../.github/workflows/discovery-scan.yml)): Triggered manually with `workflow_dispatch`, runs `ghec-consultant-cli discover` against your source organization, and uploads `scans/*.json` as workflow artifacts.
- **Autonomous Scale-Adaptive Migration** ([`../../.github/workflows/migration-e2e-autonomous.yml`](../../.github/workflows/migration-e2e-autonomous.yml)) & **Target Verification** ([`../../.github/workflows/migration-verify.yml`](../../.github/workflows/migration-verify.yml)): Slice repository cohorts across parallel runners, execute migration waves, run closed-loop self-healing remediation, verify target parity, and publish audit results.
- **Composite Setup Action** ([`../../.github/actions/setup-suite/action.yml`](../../.github/actions/setup-suite/action.yml)): Prepares Node.js 22, GitHub CLI (`gh`), and the `gh-gei` extension on every runner.

See the [Consultant Operator's Manual](../../docs/guides/operators/consultant-operators-manual.md) and [Enterprise GitHub App Deployment Guide](../../docs/architecture/github-app-enterprise-deployment.md) for step-by-step setup instructions.

---

## Checking token permissions, exit codes, and troubleshooting

By default, offline commands (`--help`, `--version`, and `--dry-run`) do not need a GitHub token. Live commands require verified permissions from the [authoritative permissions matrix](../../docs/specs/permissions-matrix.md) and [collector catalog](../../docs/specs/collector-catalog.md).

| Module            | Evidence                                             | Fine-grained PAT minimum | Classic PAT minimum | Required roles                                   |
| ----------------- | ---------------------------------------------------- | ------------------------ | ------------------- | ------------------------------------------------ |
| `orgs`            | Organizations and scope                              | Verify: PERM-001         | Verify: PERM-001    | Verify org/enterprise owner needs                |
| `repos`           | Visibility, archive, default branch, characteristics | Verify: PERM-002         | Verify: PERM-002    | Verify selected repository access/admin needs    |
| `lfs`             | LFS usage/storage indicators                         | Verify: PERM-003         | Verify: PERM-003    | Verify storage/billing/owner needs               |
| `teams`           | Nesting, member counts, repo access                  | Verify: PERM-004         | Verify: PERM-004    | Verify org owner/team maintainer needs           |
| `actions`         | Usage, workflows, runners, configuration             | Verify: PERM-005         | Verify: PERM-005    | Verify repo/org/enterprise runner administration |
| `actions-secrets` | Secret and variable metadata only                    | Verify: PERM-006         | Verify: PERM-006    | Verify repository/environment/org administration |
| `policies`        | Branch protection and rulesets                       | Verify: PERM-007         | Verify: PERM-007    | Verify repo admin/org owner needs                |
| `security`        | Security settings, scanning/Dependabot metadata      | Verify: PERM-008         | Verify: PERM-008    | Verify security manager/owner/admin needs        |
| `integrations`    | Webhooks/apps/deploy keys/signing metadata           | Verify: PERM-009         | Verify: PERM-009    | Verify admin/app owner/individual scope needs    |
| `users`           | Membership, outside collaborators, SSO posture       | Verify: PERM-010         | Verify: PERM-010    | Verify org/enterprise owner/identity admin needs |
| `packages`        | Package/release/asset metadata                       | Verify: PERM-011         | Verify: PERM-011    | Verify package/registry/repository access        |

Every command returns one of these standard exit codes:

- `0`: Completed with no errors (or finished a `--dry-run` preview).
- `1`: Stopped because of a fatal error (missing token, network error, or verification differences).
- `2`: Invalid command syntax, missing required flags, or unknown options.
- `4`: Partial success (one or more modules failed when `--continue-on-error` was used).
- `130`: Canceled by the user (`SIGINT` / Ctrl+C).

| Symptom                                  | What it means and how to fix it                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GHEC_TOKEN` missing, exit `1`           | Live runs require `GHEC_TOKEN` in your environment; add `--dry-run` to test offline                  |
| Partial collection, exit `4`             | One or more collectors failed with `--continue-on-error`; check the bundle errors and coverage       |
| Invalid options, exit `2`                | Check `--help` and pass one scope flag plus valid `--modules`                                        |
| Missing built package                    | Run `npm ci` and `npm run build` from the repository root                                            |
| HTTP `401 Unauthorized`                  | Check that your token is set, valid, and not expired without printing it to the terminal             |
| HTTP `403 Forbidden`                     | Check required role, SSO authorization, fine-grained repository access, and rate limits              |
| HTTP `404` or missing organization       | Confirm the organization name and verify your account has access with the organization administrator |
| Incomplete Actions/security/SSO evidence | Check your GitHub plan, role, and API support; missing fields remain marked as unknown               |
| Rate limiting                            | Wait for the rate-limit reset window, scan fewer modules at once, and avoid overlapping runs         |
| Incompatible bundle                      | Use a matching `1.0.0` reader version and keep the original bundle file unchanged                    |
| Output collision or denied path          | Pick a new writable folder or filename; the CLI never overwrites existing bundle files               |
