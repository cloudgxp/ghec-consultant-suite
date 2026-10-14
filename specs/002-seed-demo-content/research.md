# Technical Research: Comprehensive Synthetic Demo Content Seeder

**Feature**: `002-seed-demo-content`
**Date**: 2026-10-14
**Status**: Completed

---

## 1. Executive Summary & Problem Context

The GHEC Consultant Suite automates complex enterprise migrations from GitHub Enterprise Cloud (GHEC) to GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU) across 32 distinct functional domains. During client demonstrations, migration rehearsals, pre-flight dry runs, and integration testing, consultants and test pipelines require realistic, synthetic source content populated at both the organization and repository levels.

Manual provisioning of 32 distinct items (teams with hierarchies, rulesets, sealed secrets, custom properties, environments, LFS objects, autolinks, etc.) is error-prone, labor-intensive, and non-deterministic. This research establishes the technical foundation for an on-demand GitHub Actions workflow (`.github/workflows/seed-demo-content.yml`) and supporting TypeScript/Node automation tool (`scripts/seed-demo-content.ts` / CLI subcommand `seed-demo`) that provisions, simulates, or tears down all 32 synthetic items with zero manual intervention.

---

## 2. Inventory of the 32 Migration Items & Provisioning Strategies

The 32 migration items span 13 organization-level resources and 19 repository-level resources. Each item requires a specific GitHub REST or GraphQL API interaction, idempotency check, and error tolerance strategy:

### 2.1 Organization-Level Items (13 Items)

| Item ID                     | Resource Description                                                                   | API Endpoint / Mechanism                                                           | Idempotency & Check Strategy                                                          | Failure / Plan Handling                                                     |
| :-------------------------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------- |
| `org-settings`              | Base org policies (permissions, 2FA, repo creation, forking)                           | `PATCH /orgs/{org}`                                                                | Read via `GET /orgs/{org}`; compare and patch only differing fields.                  | Base permission updates succeed on standard orgs.                           |
| `actions-policies`          | Actions permissions, allowed actions, PR fork execution                                | `PUT /orgs/{org}/actions/permissions`, `PUT .../permissions/workflow`              | Check current permissions; apply `enabled_repositories: all`, `allowed_actions: all`. | Standard GitHub Actions setting.                                            |
| `actions-runners`           | Self-hosted runner group definitions                                                   | `POST /orgs/{org}/actions/runner-groups`                                           | Query `GET /orgs/{org}/actions/runner-groups`; update if exists, create if missing.   | Requires Enterprise plan. If HTTP 403/404, log warning and skip gracefully. |
| `org-variables`             | Actions/Dependabot variables (`GLOBAL_REGION`, `DEPLOY_TIER`)                          | `POST /orgs/{org}/actions/variables`, `PATCH .../variables/{name}`                 | Query `GET /orgs/{org}/actions/variables/{name}`; patch if exists, post if absent.    | Standard Actions API.                                                       |
| `org-secrets`               | Sealed Actions secrets with placeholder payloads                                       | `GET /orgs/{org}/actions/secrets/public-key`, `PUT .../secrets/{name}`             | Fetch org public key; encrypt placeholder string using libsodium sealed-box.          | Write-only in GitHub API; check existence via `GET` list.                   |
| `org-custom-properties`     | Custom property schema (string, single_select, multi_select, true_false)               | `PATCH /orgs/{org}/properties/schema`                                              | Query `GET /orgs/{org}/properties/schema`; merge or upsert property definitions.      | Supported on GitHub Enterprise. If 403/404, warn and skip.                  |
| `teams`                     | Nested team hierarchy (`engineering` $\rightarrow$ `platform-infra`, `frontend-guild`) | `POST /orgs/{org}/teams`, `PATCH /orgs/{org}/teams/{team_slug}`                    | Query team by slug; create parent first, then create children with `parent_team_id`.  | Strict topological creation order: parents before children.                 |
| `custom-roles`              | Custom repository roles (`Release Manager`, `Triage Specialist`)                       | `POST /orgs/{org}/custom-repository-roles`                                         | Query existing custom roles; create or update permissions.                            | Requires Enterprise plan. If 403/404, log warning and skip.                 |
| `ip-allow-lists`            | IP allow list entries & CIDR ranges                                                    | GraphQL `createIpAllowListEntry` or REST `POST /orgs/{org}/settings/ip-allow-list` | Query existing entries; create demo CIDRs (e.g. `192.0.2.0/24`).                      | Requires Enterprise plan & IP allow list policy enabled.                    |
| `webhooks` (org)            | Org-level webhooks pointed to synthetic sink                                           | `POST /orgs/{org}/hooks`, `PATCH .../hooks/{id}`                                   | Query `GET /orgs/{org}/hooks`; match by `url: https://httpbin.org/post`.              | Active webhook with push/pull_request event triggers.                       |
| `projects-v2`               | GitHub Projects v2 boards with custom fields                                           | GraphQL `createProjectV2`, `createProjectV2Field`                                  | Query projects on org owner; create board and status/priority fields if missing.      | Requires GraphQL project scope.                                             |
| `apps-inventory`            | Installed GitHub Apps verification & mock integration                                  | `GET /orgs/{org}/installations`                                                    | Inspect installations; record synthetic app integration evidence.                     | Read-only verification / discovery seeding.                                 |
| `post-migration-mannequins` | Mock mannequin committer attributions                                                  | GraphQL `enterprise.ownerInfo.mannequins`                                          | Seed or verify committer identities for identity reclamation rehearsal.               | Simulated attribution records for EMU testing.                              |

### 2.2 Repository-Level Items (19 Items)

| Item ID                      | Resource Description                                   | API Endpoint / Mechanism                                                | Idempotency & Check Strategy                                                    | Failure / Plan Handling                                     |
| :--------------------------- | :----------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :---------------------------------------------------------- |
| `gei-repo` & `repo-settings` | Base repository creation, topics, merge strategies     | `GET /repos/{org}/{repo}`, `POST /orgs/{org}/repos`, `PATCH /repos/...` | If 404, auto-create with `auto_init: true`; update merge strategies and topics. | Foundational repo bootstrapping.                            |
| `repo-variables`             | Repository Actions & Codespaces variables              | `POST /repos/{org}/{repo}/actions/variables`, `PATCH ...`               | Check by variable name; update if present, create if absent.                    | Standard repo Actions API.                                  |
| `repo-secrets`               | Sealed repo Actions secrets                            | `GET .../actions/secrets/public-key`, `PUT .../secrets/{name}`          | Encrypt via libsodium sealed-box against repo public key; upsert.               | DEC-004 zero-exposure compliance.                           |
| `repo-custom-properties`     | Applied custom property values matching org schema     | `PATCH /repos/{org}/{repo}/properties/values`                           | Check repo property values; assign values matching org property schema.         | Requires org custom property schema.                        |
| `environments`               | Deployment environments (`production`, `staging`)      | `PUT /repos/{org}/{repo}/environments/{name}`                           | Idempotent PUT; configure review rules, wait timers, branch policies.           | Supported on public repos or private repos with Enterprise. |
| `branch-protection`          | Classic branch protection rules on `main`              | `PUT /repos/{org}/{repo}/branches/main/protection`                      | Idempotent PUT; set required PR reviews, enforce admins.                        | Requires default branch `main` to exist.                    |
| `rulesets`                   | Modern Repository Rulesets                             | `POST /repos/{org}/{repo}/rulesets`, `PUT .../rulesets/{id}`            | Query `GET .../rulesets`; update if matching name found, else post.             | Enforce commit author patterns and PR review requirements.  |
| `webhooks` (repo)            | Repository-level webhook subscriptions                 | `POST /repos/{org}/{repo}/hooks`, `PATCH .../hooks/{id}`                | Match existing hook by URL (`https://httpbin.org/post`).                        | Active repo event triggers.                                 |
| `autolinks`                  | Issue tracker autolink references (`JIRA-`, `TICKET-`) | `POST /repos/{org}/{repo}/autolinks`, `GET .../autolinks`               | Check autolink list for `key_prefix`; create if not present.                    | Standard autolinks API.                                     |
| `collaborators`              | Repository collaborator permissions & team access      | `PUT /orgs/{org}/teams/{team_slug}/repos/{org}/{repo}`                  | Grant seeded teams (`demo-engineering`) push/admin access.                      | Uses seeded team slugs.                                     |
| `deploy-keys`                | Read-only & write deploy keys                          | `POST /repos/{org}/{repo}/keys`, `GET .../keys`                         | Generate synthetic RSA/ED25519 public key; check title before creating.         | Synthetic public keys; no private keys persisted.           |
| `issues`                     | Sample issues with labels, milestones, assignees       | `POST /repos/{org}/{repo}/issues`, `GET .../issues`                     | Check issue titles; create milestone, labels, and issue threads.                | Seed realistic discussion threads.                          |
| `pull-requests`              | Active & merged PRs with branches, commits, reviews    | Git refs + Contents API + `POST /repos/.../pulls`                       | Create feature branch, commit sample files, open PR, add review comment.        | Simulates active code review lifecycle.                     |
| `discussions`                | Repository Discussions with categories & Q&A           | GraphQL `createDiscussion`                                              | Query repo discussion categories; create demo Q&A discussion.                   | Requires discussions enabled on repo.                       |
| `releases`                   | Releases & git tags with downloadable assets           | `POST /repos/{org}/{repo}/releases`                                     | Check tag `v1.0.0-demo`; create release and upload synthetic binary asset.      | Demonstrates release artifact migration.                    |
| `lfs`                        | Git LFS tracking configuration & pointer objects       | Contents API: `.gitattributes` + LFS pointer file                       | Commit valid Git LFS pointer and tracking attributes.                           | Demonstrates LFS object tracking.                           |
| `packages`                   | GitHub Package registry reference                      | Packages API / synthetic metadata entry                                 | Inspect or publish mock container/npm package reference.                        | Package ecosystem validation.                               |
| `post-migration-codeowners`  | `.github/CODEOWNERS` mapping teams                     | Contents API: `.github/CODEOWNERS`                                      | Commit CODEOWNERS mapping paths to `@org/demo-engineering`.                     | Tests post-migration team mapping.                          |
| `security`                   | GHAS settings (Dependabot, Secret Scanning, CodeQL)    | `PUT .../vulnerability-alerts`, `PATCH /repos/...`, CodeQL workflow     | Enable security alerts, push protection, commit `.github/workflows/codeql.yml`. | GHAS features enabled where plan permits.                   |

---

## 3. Workflow Trigger & Authentication Architecture

### 3.1 Dynamic Secret Resolution in GitHub Actions

GitHub Actions restricts secret access in expressions. When looking up a secret dynamically by a user-provided input name:

```yaml
env:
  GHEC_TOKEN: ${{ secrets[inputs.pat_secret_name] }}
```

If `inputs.pat_secret_name` is omitted, it defaults to `'GHEC_SOURCE_TOKEN'`.
If the secret evaluates to an empty string (meaning the secret was not defined in repository secrets or organization secrets), the preflight step halts with a structured diagnostic error:

```bash
if [ -z "$GHEC_TOKEN" ]; then
  echo "::error::Secret '${{ inputs.pat_secret_name }}' was not found or is empty."
  echo "::notice::Configure a GitHub Personal Access Token (PAT) with admin:org, repo, delete_repo, and workflow scopes."
  exit 1
fi
```

### 3.2 Dual Entry Points: Script & CLI Subcommand

To satisfy both direct CI execution and developer workstation use, the implementation will follow a unified architecture:

1. **Core Seeding Engine**: Implemented in TypeScript under `apps/cli/src/commands/seed-demo.ts` (or `packages/migration/src/seeder/`), importing standard clients, rate limiters, and libsodium encryption.
2. **CLI Subcommand**: Registered in `apps/cli/src/index.ts` as `ghec-consultant-cli seed-demo [options]`.
3. **Standalone Script**: `scripts/seed-demo-content.ts` acts as a thin wrapper that imports and invokes the seeding engine using CLI flags or environment variables (`GHEC_TOKEN`, `GHEC_ORG`, `GHEC_REPO`, etc.).

---

## 4. Rate Limiting, Backoff & Error Recovery

### 4.1 Rate Limit Mechanics

- GitHub REST API enforces a primary rate limit (5,000 req/hr for PATs, 15,000 for Enterprise accounts) and secondary rate limits for concurrent mutations.
- When an HTTP 403 (with `x-ratelimit-remaining: 0` or secondary rate limit message) or HTTP 429 is encountered:
  - Read `retry-after` header or `x-ratelimit-reset`.
  - Apply exponential backoff with jitter:
    $$\Delta t = \min(t_{\text{max}}, t_{\text{base}} \times 2^{\text{attempt}} + \text{jitter})$$
    where $t_{\text{base}} = 1000\text{ms}$, $t_{\text{max}} = 30000\text{ms}$, and $\text{jitter} = \text{random}(0, 500\text{ms})$.
  - Maximum retry attempts: 5.

### 4.2 Idempotency and Collision Avoidance

- All mutation operations query existence first (`GET`) or handle HTTP 409 / 422 collision responses.
- Resources use a standard prefix: `demo-` (or configurable prefix).
- When `cleanup_existing: true`:
  - Enumerate all resources matching the prefix.
  - Delete or reset demo resources in reverse topological dependency order (e.g. child teams before parent teams, repo webhooks before deleting repos).
  - Never delete non-demo resources.

---

## 5. Security & Zero-Exposure Standards (DEC-004)

1. **Write-Only Secrets**: The GitHub REST API allows writing secrets via `PUT` with `encrypted_value`, but secrets cannot be read back. The seeder generates random synthetic placeholder strings (e.g., `demo-placeholder-org-secret-xyz`), encrypts them using libsodium sealed-box with the organization or repository public key, and sends the ciphertext.
2. **Token Redaction**: Tokens (`ghp_*`, `github_pat_*`) must never be written to stdout, stderr, `$GITHUB_STEP_SUMMARY`, or disk. All loggers and diagnostic formatters wrap outputs in `sanitizeDiagnostics()`.
3. **Execution Summary**: Summaries report the status of secrets as `[CREATED: demo-secret-name (sealed)]` without ever exposing the unencrypted content.

---

## 6. Decisions & Rationale

- **Decision 1: Modular Content Presets**:
  - _Chosen_: Define 5 preset categories (`all`, `core-governance`, `actions-and-security`, `collaboration`, `artifacts-and-code`) plus comma-separated module filtering.
  - _Rationale_: Allows consultants to run rapid 15-second demos focusing on governance or security without waiting for all 32 items to provision.
- **Decision 2: Automatic Repository Bootstrapping**:
  - _Chosen_: If the target repository does not exist, the seeder automatically creates it (`auto_init: true`) with a default branch and README.
  - _Rationale_: Eliminates manual pre-requisites for consultants running push-button demos on empty organizations.
- **Decision 3: Non-Fatal Enterprise Feature Degradation**:
  - _Chosen_: If an enterprise-only feature (IP allow list, runner group, custom role) returns HTTP 403 or 404 because the organization plan lacks Enterprise features, the seeder logs a diagnostic warning and marks the item as `skipped` rather than failing the run.
  - _Rationale_: Allows the demo seeder to be exercised on personal or Team plan test organizations without blocking other supported modules.
