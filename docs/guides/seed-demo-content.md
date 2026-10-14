# Guide: Synthetic Demo Content Seeder

The Synthetic Demo Content Seeder provisions realistic source assets across all 32 items and modules migrated by the GHEC Consultant Suite. It provides an automated, push-button mechanism for pre-sales demonstrations, client migration rehearsals, and end-to-end integration testing without manual administrative setup.

---

## 1. Overview & Capabilities

The seeder can populate both organization-level and repository-level assets across 4 major functional domains:

- **Core Governance (8 items)**: Base organization policies, nested team hierarchy (`engineering` $\rightarrow$ `platform-infra`, `frontend-guild`), custom repository roles, IP allow list entries, custom property schemas, repository settings, repository property values, and collaborator mappings.
- **Actions & Security (10 items)**: Organization Actions policies, self-hosted runner groups, organization variables, sealed organization secrets, repository variables, sealed repository secrets, deployment environments (`production`, `staging`), classic branch protections, modern repository rulesets, and GHAS security configurations.
- **Collaboration (7 items)**: Projects v2 migration tracking boards, sample issues with milestones and labels, active and merged pull requests with review comments, Discussions with Q&A categories, autolinks (`JIRA-`), `.github/CODEOWNERS`, and mock mannequin attributions.
- **Artifacts & Code (7 items)**: Releases with git tags and binary assets, Git LFS tracking configuration and pointer files, GitHub Package references, deploy keys, organization webhooks, repository webhooks, and GitHub Apps inventory.

---

## 2. GitHub Actions Workflow Dispatch

The on-demand workflow is located at `.github/workflows/seed-demo-content.yml`.

### Dispatch Inputs

| Input              |   Type    |       Default       | Description                                                                                                                                                                  |
| :----------------- | :-------: | :-----------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization`     | `string`  |    _(Required)_     | Target GitHub organization name to provision.                                                                                                                                |
| `repository`       | `string`  |    `(optional)`     | Target repository name. If missing, it will be automatically created and initialized with an initial commit.                                                                 |
| `scope_level`      | `choice`  |       `both`        | Selection of `both`, `organization`, or `repository`.                                                                                                                        |
| `content_type`     | `string`  |        `all`        | Preset (`all`, `core-governance`, `actions-and-security`, `collaboration`, `artifacts-and-code`) or comma-separated list of module IDs (e.g. `teams,rulesets,environments`). |
| `pat_secret_name`  | `string`  | `GHEC_SOURCE_TOKEN` | Name of secret in repository secrets containing Personal Access Token.                                                                                                       |
| `dry_run`          | `boolean` |       `false`       | When true, validates permissions and previews planned operations without making remote changes.                                                                              |
| `cleanup_existing` | `boolean` |       `false`       | When true, purges existing demo assets matching the prefix (`demo-`) in reverse topological dependency order before seeding.                                                 |

### How to Trigger in GitHub Actions

1. Go to the **Actions** tab in the repository.
2. Select **Seed Demo Content** from the workflow sidebar.
3. Click **Run workflow**.
4. Enter the target organization and optional repository name.
5. Choose your desired scope level and content preset.
6. Click **Run workflow**.
7. Review the generated Markdown report in the **Job Summary**.

---

## 3. Local CLI & Automation Script Execution

The seeder can also be run locally using the CLI binary or the direct runner script.

### Prerequisites

- Node.js `>=22.13.0`
- Monorepo packages compiled: `npm run build:packages`
- A Personal Access Token (PAT) with `admin:org`, `repo`, `delete_repo`, and `workflow` scopes.

### Running via CLI Subcommand

```bash
export GHEC_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Provision all 32 items across org and repo
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo"

# Targeted run for governance items only
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --scope "organization" \
  --preset "core-governance"

# Non-mutating dry-run simulation
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --dry-run

# Clean teardown of existing demo assets
npm run dev:cli -- seed-demo \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --cleanup
```

### Running via Standalone Script

```bash
node --import tsx scripts/seed-demo-content.ts \
  --org "octodemo-migration" \
  --repo "demo-ecommerce-monorepo" \
  --preset "actions-and-security"
```

---

## 4. Security & Safety Invariants

1. **Zero-Exposure Secret Boundary (DEC-004)**: Write-only secrets are encrypted using `libsodium-wrappers` sealed-box against organization and repository public keys. Plaintext credentials are never written to disk or logs.
2. **Diagnostic Scrubbing**: All logs, error messages, and summary outputs automatically pass through `sanitizeDiagnostics` to redact authentication tokens (`ghp_*`, `github_pat_*`) and authorization headers.
3. **Idempotency**: All operations perform check-or-create or update-in-place logic. Rerunning the seeder produces zero 409 Conflict errors.
4. **Namespace Safety**: All created resources use the designated prefix (`demo-`). Cleanup routines only target demo-prefixed resources and never touch customer production repositories or teams.
5. **Non-Fatal Degradation**: Enterprise-only features (such as IP allow lists, runner groups, and custom repository roles) gracefully log diagnostic warnings and skip if the target organization lacks an Enterprise plan.
