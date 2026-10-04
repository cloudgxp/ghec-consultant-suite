# GHEC to GHEC-EMU Test Migration Setup Guide & Execution Playbook

This authoritative guide details the exact prerequisites, credentials, scopes, test data, and execution procedures required to execute an end-to-end dry-run and live test migration from GitHub Enterprise Cloud (GHEC) to GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU) using `@ghec/migration` and `ghec-consultant-cli`.

---

## 1. Secrets & Security Architecture (Zero-Local-Secrets Boundary)

> [!IMPORTANT]
> **Zero-Local-Secrets Security Boundary:**
> To guarantee complete credential isolation and protect sensitive migration tokens, Antigravity and operators **never** request, receive, or store GitHub Personal Access Tokens or migration credentials in local `.env` files, shell variables, or chat messages.
> All migration credentials must reside exclusively in **GitHub Repository / Organization Secrets** (`${{ secrets.GHEC_SOURCE_TOKEN }}`, `${{ secrets.GHEC_TARGET_TOKEN }}`).
> All test executions, dry-runs, and live mutations are executed strictly within isolated GitHub Actions runners (`ubuntu-latest` or `self-hosted`).

### GitHub Repository Secrets Matrix

Configure the following secrets in your repository settings (`Settings > Secrets and variables > Actions`) or using the GitHub CLI:

| Secret Name         | Required | Scope / Justification                                                                |
| :------------------ | :------: | :----------------------------------------------------------------------------------- |
| `GHEC_SOURCE_TOKEN` | **Yes**  | Classic PAT with read access to source organization (`repo`, `read:org`, hook read). |
| `GHEC_TARGET_TOKEN` | **Yes**  | Classic PAT under EMU account with Org Owner privileges in destination org.          |

> [!CAUTION]
> **Strict Tenant Credential Isolation Enforcement (SEC-CRED-001):**
> The dual client (`createGitHubDualClient`) strictly checks that `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` are distinct. If both point to the same token, client initialization immediately throws:
> `Error: Source and target tenants must not share the same credential.`
> Ensure you generate two independent Personal Access Tokens from their respective organizations.

### Configuring Secrets via GitHub CLI

To set repository secrets securely without saving them to local files:

```bash
# Set source token
gh secret set GHEC_SOURCE_TOKEN

# Set destination EMU target token
gh secret set GHEC_TARGET_TOKEN
```

---

## 2. Token Permissions & Scopes (Classic PAT vs. Fine-Grained PAT)

### Classic PAT vs. Fine-Grained PAT Guidance

> [!IMPORTANT]
> **Classic PATs are required for end-to-end migration orchestration.**
> While Fine-Grained PATs support repository-level operations, they currently exhibit severe restrictions in enterprise migration contexts:
>
> 1. Fine-Grained PATs cannot span multiple organizations belonging to separate enterprise accounts.
> 2. Fine-Grained PATs do not support organization-level Actions secrets encryption keys or ruleset bypass inspection.
> 3. GitHub Enterprise Importer (`gh-gei`) commands require classic PAT scopes (`admin:org`, `repo`).

### Source GHEC PAT (Read-Only Extraction)

Create a **Classic Personal Access Token** in your source account with these minimal scopes:

| Classic Scope                        | Required By Modules                                                                        | Justification                                                                                            |
| :----------------------------------- | :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `repo`                               | `repos`, `repo-variables`, `repo-secrets`, `environments`, `rulesets`, `branch-protection` | Reading private repositories, Actions configuration metadata, deployment environments, and branch rules. |
| `read:org`                           | `orgs`, `teams`, `users`, `org-variables`, `org-secrets`, `org-custom-properties`          | Enumerating organization membership, team hierarchy, organization variables, and custom properties.      |
| `admin:org_hook` / `read:org_hook`   | `webhooks`, `integrations`                                                                 | Reading organization-level webhooks.                                                                     |
| `admin:repo_hook` / `read:repo_hook` | `webhooks`                                                                                 | Reading repository-level webhooks.                                                                       |

### Target GHEC-EMU PAT (Apply & Mutations)

Create a **Classic Personal Access Token** under an **Enterprise Managed User (EMU)** account with Organization Owner privileges in the target organization:

| Classic Scope     | Required By Modules                                                                                | Justification                                                                                     |
| :---------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `repo`            | `repo-variables`, `repo-secrets`, `repo-settings`, `rulesets`, `branch-protection`, `environments` | Rehydrating variables, secrets, branch protections, PR templates, and environments.               |
| `admin:org`       | `org-variables`, `org-secrets`, `teams`, `org-custom-properties`                                   | Creating teams, establishing parentage, assigning EMU members, and setting org secrets/variables. |
| `admin:org_hook`  | `webhooks`                                                                                         | Creating organization webhooks.                                                                   |
| `admin:repo_hook` | `webhooks`                                                                                         | Creating repository webhooks.                                                                     |
| `workflow`        | `rulesets`, `environments`                                                                         | Updating repository configurations referencing Actions workflow files.                            |

### Enterprise Managed Users (EMU) Specific Constraints

1. **SAML Single Sign-On Authorization:**
   - After generating the Classic PAT under your EMU account, you **must** click `Configure SSO` next to the token in GitHub Settings and click `Authorize` for the target enterprise and organization.
   - If not authorized, all target API requests will fail with HTTP 403:
     `Resource protected by organization SAML enforcement. You must grant your Personal Access Token access to this organization.`
2. **EMU Username Format:**
   - EMU accounts have strict username formatting provisioned via SCIM: `<idp_user>_<enterprise_shortcode>` (e.g. `jdoe_cloudgxp`).
   - Personal accounts cannot be invited to an EMU organization.
3. **Mannequin Reclamation (`--skip-invitation`):**
   - Because EMU users cannot accept standard external email invitations, historical commits/PRs mapped via `post-migration-mannequins` require the `--skip-invitation` flag on `gh gei reclaim-mannequin`. This immediately reattributes history without sending email notifications.
4. **Ruleset Bypass Rights:**
   - The EMU migration administrator account must be added to ruleset bypass lists in the target organization so automated mutations do not trip default branch restrictions.

---

## 3. Dummy Source Resources Checklist

To thoroughly exercise all 12 modules and 2 strategies during test migration without affecting production assets, create the following dummy resources in your source test organization (`$GHEC_SOURCE_ORG`):

### Repositories (2 total)

1. **`dummy-repo-public` (Standard Public Repository):**
   - Visibility: `Public`
   - Default Branch: `main`
   - Content: Standard README, 1 sample GitHub Actions workflow (`.github/workflows/test.yml`).
   - Actions Variables (2):
     - `APP_ENV = "staging"`
     - `LOG_LEVEL = "debug"`
   - Actions Secrets (1):
     - `DEPLOY_TOKEN = "synthetic-dummy-value-12345"`
   - Deployment Environments (1):
     - Name: `production`
     - Wait Timer: 5 minutes
     - Protection Rule: 1 required reviewer
     - Environment Variable: `PROD_ENDPOINT = "https://api.example.com"`
     - Environment Secret: `PROD_API_KEY = "env-secret-synthetic"`
   - Ruleset (1):
     - Name: `default-branch-protection`
     - Enforcement: `Active`
     - Targets: Default branch (`~DEFAULT_BRANCH`)
     - Rules: Require pull request review (1 approval), require linear history.
   - Webhook (1):
     - Payload URL: `https://httpbin.org/post`
     - Events: `push`, `pull_request`
     - Active: `true`
   - PR Settings:
     - Allow squash merge: `true`
     - Squash merge commit title: `PR_TITLE`
     - Squash merge commit message: `PR_BODY`
   - Custom Property Value:
     - `environment = "staging"`

2. **`dummy-repo-private-lfs` (Private Repository with LFS & Release):**
   - Visibility: `Private`
   - Git LFS Content:
     - `.gitattributes` containing `*.bin filter=lfs diff=lfs merge=lfs -text`
     - 1 committed binary file `sample-asset.bin` (e.g. 50 KB tracked via Git LFS).
   - GitHub Release (1):
     - Tag: `v1.0.0`
     - Name: `v1.0.0 Initial Release`
     - Attached Asset: `test-artifact.tar.gz` (mock binary file).

### Organization-Level Resources

1. **Organization Custom Property Schemas (2):**
   - `environment`: Type `single_select`, allowed values: `["development", "staging", "production"]`.
   - `cost_center`: Type `string`, description: `Financial billing code`.
2. **Organization Actions Variables (2):**
   - `GLOBAL_REGION = "us-east-1"`
   - `ENABLE_MAINTENANCE_MODE = "false"`
3. **Organization Actions Secrets (1):**
   - `CORP_SEALED_SECRET = "synthetic-org-secret-67890"`
4. **Team Hierarchy (2 teams):**
   - Parent Team: `engineering` (Privacy: `closed`)
   - Child Team: `platform-infra` (Parent: `engineering`, Privacy: `closed`)
   - Membership: At least 1 test user assigned as maintainer.
5. **Organization Webhook (1):**
   - Payload URL: `https://httpbin.org/post`
   - Subscribed Events: `team`, `repository`
   - Secret: `org-test-webhook-secret`

---

## 4. Execution Playbook: Actions-Driven Migration Testing (Zero-Local-Secrets)

Follow this lifecycle to validate migration planning, execution, and verification safely without handling or exposing credentials locally. **All API calls and simulations execute within GitHub Actions runners.**

### Step 1: Select Committed Scope Artifact

Select one of the pre-committed scope definitions in `scopes/`:

- `scopes/test-org-wave.json`: Organization-level wave (`org-variables`, `org-secrets`, `teams`, `org-custom-properties`, `webhooks`).
- `scopes/test-repo-wave.json`: Repository-level wave (`dummy-repo-public`, `dummy-repo-private-lfs`).
- `scopes/test-all-wave.json`: Unified full test wave.

Validate the scope structure locally without credentials:

```bash
node --input-type=module -e '
  import { validateMigrationScope } from "./packages/contracts/dist/index.js";
  import fs from "fs";
  const parsed = JSON.parse(fs.readFileSync("scopes/test-org-wave.json", "utf8"));
  const res = validateMigrationScope(parsed);
  if (!res.success) throw new Error("Scope invalid");
  console.log("Scope artifact valid.");
'
```

### Step 2: Trigger Workflow Dispatch via `gh workflow run`

Trigger testing on GitHub Actions runners (`ubuntu-latest`). All migration credentials are automatically injected from repository secrets:

#### Option A: Dedicated Fast-Test Dispatch (`test-migration-dispatch.yml`)

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets,teams \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

#### Option B: Parallel Wave Slicer Dispatch (`migration-execute-wave.yml`)

```bash
gh workflow run migration-execute-wave.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets,teams \
  -f dry_run=true \
  -f runner_labels=ubuntu-latest
```

### Step 3: Monitor Workflow Progress

Track execution in real time:

```bash
RUN_ID=$(gh run list --workflow=test-migration-dispatch.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID"
```

If the run encounters any unexpected failures, inspect failed step logs directly:

```bash
gh run view "$RUN_ID" --log-failed
```

### Step 4: Download and Audit Artifacts

Download the verified plan, execution report, and verification summary:

```bash
mkdir -p ./scans/downloads
gh run download "$RUN_ID" --dir ./scans/downloads

# Verify zero mutations and status complete
node -e '
  const exec = JSON.parse(require("fs").readFileSync("./scans/downloads/test-migration-artifacts-" + process.env.RUN_ID + "/test-migration-execution.json", "utf8"));
  console.log("Status:", exec.status);
  console.log("DryRun Flag:", exec.dryRun);
  if (exec.dryRun !== true || exec.status !== "complete") {
    console.error("Dry-run audit failed!");
    process.exit(1);
  }
  console.log("Dry-run verified successfully with zero write mutations.");
'
```

### Step 5: Review Actions Step Summary

Every workflow run emits a rich GitHub Actions Step Summary table containing:

- Planned operations breakdown (`creates`, `updates`, `no-ops`, `warnings`).
- Cohort execution status and duration.
- Post-migration target verification discrepancy count.

### Step 6: Mandatory Dry-Run Gate before Live Apply

A clean, passing `dry_run: true` workflow run is mandatory before any live mutations are performed. Once the plan and simulation have been reviewed and approved, trigger live apply:

```bash
gh workflow run test-migration-dispatch.yml \
  -f scope=scopes/test-org-wave.json \
  -f modules=org-variables,org-secrets,teams \
  -f dry_run=false \
  -f runner_labels=ubuntu-latest
```

---

## 5. Summary of Audit Findings & Quality Gates

The codebase audit verified the following status across `@ghec/migration` and `apps/cli`:

- **Universal Dry-Run Support:**
  - All 12 core migration modules (`org-variables`, `org-secrets`, `teams`, `org-custom-properties`, `repo-variables`, `repo-secrets`, `repo-custom-properties`, `repo-settings`, `branch-protection`, `rulesets`, `environments`, `webhooks`) strictly honor `ctx.dryRun === true` and skip HTTP mutations.
  - In dry-run mode, `MigrationOrchestrator` does not require a write token or `TargetWriteClient`.
- **Prerequisite Code Tasks:**
  - `prereq-dryrun-git-lfs.md`: Adding `dryRun` directly to `GitLfsMigrationStrategy`.
  - `prereq-dryrun-releases.md`: Adding `dryRun` directly to `LargeReleasesMigrationStrategy`.
  - `prereq-pipeline-module-identifiers-drift.md`: Aligning `'repo-settings'` module ID in `pipeline.ts` Stage 6 and decoupling whole-org mannequin reclamation from the per-repository loop.
- **Root Quality Gate:**
  - Root TypeScript typecheck (`npm run typecheck`) is clean across all 7 monorepo workspaces.
  - ESLint, Prettier, and AST style quality gates (`npm run lint`) pass with 0 warnings.
  - All 350+ unit and integration tests are verified green.
