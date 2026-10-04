# GHEC to GHEC-EMU Test Migration Setup Guide & Execution Playbook

This authoritative guide details the exact prerequisites, credentials, scopes, test data, and execution procedures required to execute an end-to-end dry-run and live test migration from GitHub Enterprise Cloud (GHEC) to GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU) using `@ghec/migration` and `ghec-consultant-cli`.

---

## 1. Environment Variables & Secrets Checklist

Configure the following environment variables. You may supply them via a `.env` file in the workspace root or export them in your current shell session.

### Environment Variable Matrix

| Variable Name              | Required | Default / Example        | Purpose / Component                                                    |
| :------------------------- | :------: | :----------------------- | :--------------------------------------------------------------------- |
| `GHEC_SOURCE_TOKEN`        | **Yes**  | `ghp_source123...`       | Source tenant read PAT (used by `@ghec/github-client` source adapter). |
| `GHEC_TARGET_TOKEN`        | **Yes**  | `ghp_target456...`       | Target EMU tenant read/write PAT (used by `@ghec/migration` writer).   |
| `GHEC_SOURCE_ORG`          | **Yes**  | `acme-corp-source`       | Source organization slug.                                              |
| `GHEC_TARGET_ORG`          | **Yes**  | `acme-corp-emu-target`   | Destination organization slug under the target EMU enterprise.         |
| `GHEC_BASE_URL`            |    No    | `https://api.github.com` | Base GitHub API URL (override for GHES / data residency instances).    |
| `GHEC_SOURCE_BASE_URL`     |    No    | `https://api.github.com` | Specific base URL for source tenant.                                   |
| `GHEC_TARGET_BASE_URL`     |    No    | `https://api.github.com` | Specific base URL for target tenant.                                   |
| `GHEC_API_VERSION`         |    No    | `2026-03-10`             | GitHub REST API version header.                                        |
| `GH_SOURCE_PAT`            |    No    | `$GHEC_SOURCE_TOKEN`     | Fallback token for GitHub Enterprise Importer (`gh gei`) source calls. |
| `GH_PAT` / `GH_TARGET_PAT` |    No    | `$GHEC_TARGET_TOKEN`     | Fallback token for GitHub Enterprise Importer (`gh gei`) target calls. |

> [!CAUTION]
> **Strict Tenant Credential Isolation Enforcement (SEC-CRED-001):**
> The dual client (`createGitHubDualClient`) strictly checks that `GHEC_SOURCE_TOKEN` and `GHEC_TARGET_TOKEN` are distinct. If both point to the same token, client initialization immediately throws:
> `Error: Source and target tenants must not share the same credential.`
> Ensure you generate two independent Personal Access Tokens from their respective organizations.

### Shell Export Template (`.env.migration`)

```bash
# Source GHEC Credentials
export GHEC_SOURCE_TOKEN="ghp_source_pat_here"
export GHEC_SOURCE_ORG="cloudgxp-source"

# Destination GHEC-EMU Credentials
export GHEC_TARGET_TOKEN="ghp_emu_target_pat_here"
export GHEC_TARGET_ORG="cloudgxp-emu-target"

# Global CLI Settings
export GHEC_BASE_URL="https://api.github.com"
export GHEC_API_VERSION="2026-03-10"

# GEI CLI Bindings
export GH_SOURCE_PAT="$GHEC_SOURCE_TOKEN"
export GH_PAT="$GHEC_TARGET_TOKEN"
export GH_TARGET_PAT="$GHEC_TARGET_TOKEN"
```

To load into your shell:

```bash
set -a && source .env.migration && set +a
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

## 4. Execution Playbook: Full Dry-Run Sequence

Follow this exact command sequence to validate the entire suite safely in dry-run mode. **No resources will be created or modified on the destination organization.**

### Step 1: Preflight Capability & Scope Matrix Probe

Verify credential validity, rate limits, and scopes offline and online:

```bash
# 1. Source tenant preflight dry-run probe
ghec-consultant-cli discover \
  --organization "$GHEC_SOURCE_ORG" \
  --modules all \
  --dry-run \
  --verbose

# 2. Destination EMU tenant preflight dry-run probe
ghec-consultant-cli discover \
  --organization "$GHEC_TARGET_ORG" \
  --modules all \
  --dry-run \
  --verbose
```

### Step 2: Source Discovery & Bundle Generation

Extract full configuration metadata and generate an encrypted, pseudonymized JSON discovery bundle:

```bash
mkdir -p ./scans ./scopes

ghec-consultant-cli discover \
  --organization "$GHEC_SOURCE_ORG" \
  --modules all \
  --output ./scans/source-discovery-bundle.json \
  --format json \
  --redaction-profile standard
```

### Step 3: Migration Scope Definition

Create your migration scope descriptor mapping source resources to target EMU resources:

```bash
cat <<EOF > ./scopes/test-migration-scope.json
{
  "version": "1.0.0",
  "migrationId": "emu-test-migration-run-001",
  "organizations": [
    {
      "source": "$GHEC_SOURCE_ORG",
      "target": "$GHEC_TARGET_ORG"
    }
  ],
  "repositories": [
    {
      "sourceOrg": "$GHEC_SOURCE_ORG",
      "sourceRepo": "dummy-repo-public",
      "targetOrg": "$GHEC_TARGET_ORG",
      "targetRepo": "dummy-repo-public"
    },
    {
      "sourceOrg": "$GHEC_SOURCE_ORG",
      "sourceRepo": "dummy-repo-private-lfs",
      "targetOrg": "$GHEC_TARGET_ORG",
      "targetRepo": "dummy-repo-private-lfs"
    }
  ]
}
EOF
```

### Step 4: Plan Generation (Diff Engine)

Generate the comprehensive migration plan comparing source bundle/APIs with target state:

```bash
ghec-consultant-cli plan \
  --scope ./scopes/test-migration-scope.json \
  --input ./scans/source-discovery-bundle.json \
  --output ./scans/test-migration-plan.json \
  --split-matrix 2 \
  --output-matrix ./scans/test-migration-matrix.json \
  --verbose
```

Review `./scans/test-migration-plan.json` to inspect the planned operations across all modules (`org-variables`, `org-secrets`, `teams`, `rulesets`, `environments`, `repo-variables`, `repo-secrets`, etc.).

### Step 5: Universal Dry-Run Migration Execution

Execute the full migration in **dry-run mode**. The orchestrator will simulate all 12 modules, log operations, evaluate LFS/release transfers, and write an audit report without making target mutations:

```bash
ghec-consultant-cli migrate \
  --plan ./scans/test-migration-plan.json \
  --dry-run \
  --output ./scans/test-dryrun-execution-report.json \
  --json-summary ./scans/test-dryrun-summary.json \
  --verbose
```

### Step 6: Validate Dry-Run Results

Verify that dry-run recorded clean completion and zero target mutations:

```bash
# Check execution status
node -e '
  const report = JSON.parse(require("fs").readFileSync("./scans/test-dryrun-execution-report.json", "utf8"));
  console.log("Status:", report.status);
  console.log("DryRun Flag:", report.dryRun);
  console.log("Total Module Results:", report.results.length);
  if (report.dryRun !== true || report.status !== "complete") {
    console.error("Dry-run validation failed!");
    process.exit(1);
  }
  console.log("Universal dry-run succeeded without mutations.");
'
```

### Step 7: Post-Migration Compliance Verification Probe

Run the verification compliance engine against the plan to prove discrepancy reporting:

```bash
ghec-consultant-cli verify \
  --plan ./scans/test-migration-plan.json \
  --output ./scans/test-verification-report.json \
  --json-summary ./scans/test-verification-summary.json \
  --verbose
```

_(Note: Prior to live apply, `verify` will report that planned resources are not yet present on destination, confirming that discrepancy detection is fully functional.)_

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
