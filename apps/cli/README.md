# ghec-consultant-cli

Authoritative CLI guide. This package provides the executable discovery tool `ghec-consultant-cli`. Help/version, offline option parsing, preflight `--dry-run`, topological collector orchestration, resilient read adapter with link pagination and backoff, HMAC pseudonymization, and atomic schema-validated bundle generation are fully implemented and verified.

## Installation and development

From the repository root, use Node 22.13+ and npm 10+:

```bash
npm ci
npm run build
npm run dev:cli -- --help
npm exec --workspace ghec-consultant-cli -- ghec-consultant-cli --version
node apps/cli/dist/index.js discover --help
npm test
```

The package is private and not published. After building, the npm workspace executable is available through `npm exec --workspace ghec-consultant-cli -- ...`; no global installation is required. Credential input is read safely from `GHEC_TOKEN` (or an approved local credential store). Optional `GHEC_BASE_URL` allows targeting GitHub Enterprise Server or local test proxies. `.env.example` is explanatory only; `.env` is ignored and not automatically loaded. Tokens are never accepted via command line arguments, logged to stdout/stderr, or written to bundles.

## Commands Overview

The CLI provides four primary subcommands representing the full migration lifecycle:

- `discover`: Enumerate source tenant metadata and emit versioned `DiscoveryBundle`.
- `plan`: Compute an immutable, auditable `MigrationPlan` comparing source and target tenant states.
- `migrate`: Execute a pre-approved plan (or scope) with dry-run safety and error recovery.
- `verify`: Perform post-migration compliance audit of the target tenant state against the plan.
- `publish-results`: Synthesize reports and publish the `gei-migration-results` audit repository directly to the target organization.

```bash
# Global help & version
ghec-consultant-cli --help
ghec-consultant-cli --version

# Subcommand-specific help
ghec-consultant-cli discover --help
ghec-consultant-cli plan --help
ghec-consultant-cli migrate --help
ghec-consultant-cli verify --help
ghec-consultant-cli publish-results --help
```

---

## 1. Discovery (`discover`)

```bash
# Dry-run preflight planning (exits 0 without API calls or writing files)
ghec-consultant-cli discover --modules all --organization "$YOUR_GITHUB_ORG" --dry-run

# Live discovery invocations
ghec-consultant-cli discover --modules all --organization "$YOUR_GITHUB_ORG"
ghec-consultant-cli discover --modules repos,teams,lfs,actions --organization "$YOUR_GITHUB_ORG"
ghec-consultant-cli discover --modules all --enterprise "$YOUR_ENTERPRISE_NAME"
ghec-consultant-cli discover --modules repos --organization fictional-north --output ./scans --format json
ghec-consultant-cli discover --modules all --enterprise fictional-enterprise --continue-on-error --output ./scans/engagement.json
ghec-consultant-cli discover --modules users,integrations --organization fictional-north --redaction-profile standard
```

| Option                                    | Default / behavior                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--organization <name>`                   | One organization; mutually exclusive with enterprise                                                                            |
| `--enterprise <slug>`                     | Every accessible organization in enterprise; enumeration can be partial                                                         |
| `--modules <list\|all>`                   | Required; resolved dependencies are recorded                                                                                    |
| `--output <path>`                         | `./scans`; directory or explicit `.json` bundle path                                                                            |
| `--format json`                           | `json`; other formats rejected                                                                                                  |
| `--dry-run`                               | False; prints preflight DAG plan, request estimates, and credential presence without network calls; exits 0                     |
| `--include-sensitive-metadata`            | False; approved metadata only, never values; initial schema adds no fields for this flag                                        |
| `--redaction-profile <standard\|minimal>` | `standard`; minimal means less redaction, subject to an approved field allowlist; current identity shape remains pseudonym-only |
| `--continue-on-error`                     | False; continuation on collector error emitting partial bundle with exit code 4                                                 |
| `--verbose`                               | False; allowlisted redacted diagnostics only                                                                                    |
| `--help`, `--version`                     | Root help/version; discover also accepts `--help`                                                                               |

---

## 2. Planning (`plan`)

Computes a diff between source metadata (from live API or cached discovery bundle) and target tenant state, producing a validated `migration-plan.json`.

```bash
# Generate plan from scope and live tenant connections
ghec-consultant-cli plan --scope ./scopes/org-scope.json --output ./scans/migration-plan.json

# Generate plan using offline cached discovery bundle
ghec-consultant-cli plan --scope ./scopes/org-scope.json --input ./scans/discovery-bundle.json --output ./scans/migration-plan.json

# Filter specific modules during planning
ghec-consultant-cli plan --scope ./scopes/org-scope.json --modules repo-variables --output ./scans/migration-plan.json
```

| Option                             | Default / behavior                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `--scope <file>`                   | **Required**; Path to validated `MigrationScope` JSON definition                 |
| `--input <file>`                   | Optional path to cached `DiscoveryBundle` (avoids source tenant network calls)   |
| `--modules <list>`                 | Comma-separated module IDs to include (defaults to all modules in scope)         |
| `--output <file>`                  | Output path for `MigrationPlan` JSON (default: `./scans/migration-plan.json`)    |
| `--source-token`, `--target-token` | Explicit tenant token overrides (defaults to `GHEC_TOKEN` / `GHEC_TARGET_TOKEN`) |

---

## 3. Migration (`migrate`)

Applies planned mutations to the destination tenant. When `--plan` is supplied, the pre-approved plan is executed without re-running discovery or diffing.

```bash
# Dry-run execution of a pre-approved plan (simulates mutations without writing to target)
ghec-consultant-cli migrate --plan ./scans/migration-plan.json --dry-run

# Live execution of a pre-approved plan
ghec-consultant-cli migrate --plan ./scans/migration-plan.json --output ./scans/execution-report.json

# Resilient migration with error continuation
ghec-consultant-cli migrate --plan ./scans/migration-plan.json --continue-on-error

# Direct migration from scope (runs planning then apply)
ghec-consultant-cli migrate --scope ./scopes/org-scope.json --dry-run
```

| Option                  | Default / behavior                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `--plan <file>`         | Pre-approved `MigrationPlan` JSON file (mutually exclusive or paired with `--scope`)     |
| `--scope <file>`        | `MigrationScope` JSON file (used if `--plan` not supplied)                               |
| `--dry-run`             | Simulates mutations safely without writing to target; returns exit code 0                |
| `--continue-on-error`   | Continues executing remaining modules on error; returns exit code 4 on partial success   |
| `--output <file>`       | Output path for `MigrationExecutionReport` (default: `./scans/migration-execution.json`) |
| `--resume [id\|latest]` | Checkpoint resumption token                                                              |
| `--publish-results`     | Synthesize and commit results repo to target org upon completion                         |

---

## 4. Verification (`verify`)

Audits the destination tenant post-migration and reconciles state against the migration plan, generating a comprehensive `verification-report.json`.

```bash
# Verify destination compliance against migration plan
ghec-consultant-cli verify --plan ./scans/migration-plan.json --output ./scans/verification-report.json

# Verify with scope context
ghec-consultant-cli verify --plan ./scans/migration-plan.json --scope ./scopes/org-scope.json
```

| Option            | Default / behavior                                                                 |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--plan <file>`   | **Required**; Path to `MigrationPlan` JSON to audit against                        |
| `--scope <file>`  | Optional path to `MigrationScope` JSON for tenant metadata                         |
| `--output <file>` | Output path for `VerificationReport` (default: `./scans/verification-report.json`) |
| `--target-token`  | Destination tenant token override                                                  |

---

## 5. Migration Results Publishing (`publish-results`)

Synthesizes execution reports, verification reports, and remediation plans into a standardized results repository (`gei-migration-results` by default) in the target organization. Commits are published atomically via the GitHub Git Data API (blobs, trees, commit, ref update).

```bash
# Publish results repository to destination organization
ghec-consultant-cli publish-results \
  --execution-report ./scans/migration-execution.json \
  --verification-report ./scans/verification-report.json \
  --remediation-plan ./scans/remediation-plan.json \
  --target-org "$TARGET_ORG"

# Dry-run: generate local audit tree without pushing to remote
ghec-consultant-cli publish-results \
  --scope ./scopes/org-scope.json \
  --output-dir ./scans/results-repo \
  --dry-run

# Local generation only (skip remote push entirely)
ghec-consultant-cli publish-results \
  --scope ./scopes/org-scope.json \
  --skip-push \
  --output-dir ./scans/results-repo
```

| Option                         | Default / behavior                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `--execution-report <file>`    | Path to `MigrationExecutionReport` JSON file                                           |
| `--verification-report <file>` | Path to `VerificationReport` JSON file                                                 |
| `--remediation-plan <file>`    | Path to `RemediationPlan` JSON file                                                    |
| `--scope <file>`               | Path to `MigrationScope` JSON definition (used to infer organizations and repos)       |
| `--target-org <name>`          | Target GitHub organization                                                             |
| `--source-org <name>`          | Source GitHub organization                                                             |
| `--repo-name <name>`           | Target audit repository name (default: `gei-migration-results`)                        |
| `--output-dir <path>`          | Local directory to write markdown files and manifest (default: `./scans/results-repo`) |
| `--dry-run`                    | Simulate creation and commit without mutating remote repository                        |
| `--skip-push`                  | Write local files only; skip remote repository creation and git push                   |
| `--append-step-summary`        | Append summary markdown to `$GITHUB_STEP_SUMMARY`                                      |
| `--branch <name>`              | Destination branch to commit results to (default: `main`)                              |

---

## Standardized Exit Codes

All CLI subcommands adhere strictly to standardized process exit codes:

- `0`: Complete success (or dry-run success).
- `1`: Fatal error (authentication failure, network error, or verification discrepancies).
- `2`: Invalid command syntax, missing required options, or unrecognized arguments.
- `4`: Partial success (one or more modules failed with `--continue-on-error`).
- `130`: Interrupted by operator (`SIGINT` / Ctrl+C).

## Modules and permissions matrix

The following compact matrix intentionally makes **no unverified scope or privilege recommendation**. “Verify” means “requires verification against current GitHub documentation.” Exact minima, required roles, resource owners, sensitivity, official sources and verification records are controlled by the [authoritative permissions matrix](../../docs/specs/permissions-matrix.md). Its PERM rows must be completed before release; do not substitute broad permissions for missing research.

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

Help/version/offline syntax checks need no token or GitHub role. Future `discover` needs the union of verified selected capabilities; enterprise enumeration and dry-run probes need their own verified requirements. See [collector catalog](../../docs/specs/collector-catalog.md) for purpose, API rationale, sensitivity, limitations and acceptance criteria for every module. Role names above are questions for verification, not claims that each role is required or sufficient.

Fine-grained tokens may be restricted by resource owner, selected repositories, approval and policy. A classic PAT scope does not override account privileges. SSO, licensing and access changes can independently affect visibility. Confirm all exact capabilities and permission requirements against official GitHub documentation and approved synthetic live tests before any release. Enterprise access must not be inferred from a slug or a token's existence.

## Organization versus enterprise behavior

An organization scan remains inside the requested organization. An enterprise scan enumerates accessible organizations and retains an organization ID on every execution and entity. Enterprise totals describe observed scope only. Failed or incomplete enumeration is disclosed; unknown inaccessible counts are null. IDs, not display names, identify relationships. Dependencies run before dependent collectors; missing repository anchors cause explicit skipped results.

## Output and dashboard handoff

Each run writes one versioned UTF-8 JSON bundle. Directory targets receive `ghec-discovery-<scope-kind>-<sanitized-scope>-<YYYYMMDDTHHmmssSSSZ>-<run-id>.json`; explicit `.json` paths are honored. Writes are restricted, atomic and non-overwriting. No companion customer logs or per-organization files are required.

```text
scans/                          # ignored local CLI output
  ghec-discovery-enterprise-fictional-enterprise-20260101T120000000Z-example.json
reports/                        # ignored local dashboard exports
fixtures/synthetic/             # tracked, fictional examples only
  enterprise-v1.json
  organization-v1.json
  specialized-v1.json
  partial-denied-v1.json
```

Top-level fields: schemaVersion, synthetic, scan, configuration, scope, organizations, collectors, entities, findings, limitations, errors, summary. Each collector has timestamps, provenance, status, warnings/errors and coverage; entities carry organization/execution references. Configuration omits tokens, raw argv and absolute customer paths. See [data contract](../../docs/specs/data-contract.md).

To hand off a bundle, start the local dashboard (`npm run dev`), choose Import
bundle, select the local JSON file, validate its version/schema, review
coverage, then inspect views and export reports. The dashboard never needs a
GitHub token or a network connection to GitHub.

The current reader supports schema 1.0.0 only. Future readers retain registered older-compatible versions through explicit normalizers; unknown future/minor or major versions reject clearly. No silent migration or original-file overwrite is allowed.

## Deployment with GitHub Actions and Enterprise GitHub App

To run discovery across multiple organizations in an enterprise without fragile personal access tokens (PATs), the CLI is deployed via GitHub Actions workflows authenticated by an Enterprise-level GitHub App:

- **Multi-Org Scan Workflow**: `.github/workflows/enterprise-multi-org-scan.yml`
  - Triggered manually via `workflow_dispatch`.
  - Dynamically discovers organizations across the enterprise using GraphQL with an enterprise installation token.
  - Fans out parallel discovery jobs across organizations (`max-parallel: 4`) using organization installation tokens generated on-the-fly.
  - Uploads all discovery bundles (`scans/*.json`) as GitHub Actions artifacts for offline analysis.
- **Reusable Token Minting Workflow**: `.github/workflows/reusable-ghec-token.yml`
  - Reusable `workflow_call` for minting scoped installation access tokens for an organization or enterprise from GitHub App credentials (`GHEC_APP_ID`, `GHEC_APP_PRIVATE_KEY`).

For full setup instructions, required permissions, and installation steps, see the [Enterprise GitHub App Deployment Guide](../../docs/architecture/github-app-enterprise-deployment.md).

## Partial results, warnings and failures

Complete, partial, failed, skipped and unavailable executions are distinct. Missing data is not zero, false or safe. Successful enumeration can coexist with unavailable individual fields. Warnings do not automatically imply failure; errors are sanitized codes/messages, not raw responses.

With `--continue-on-error`, discovery continues independent modules and
produces a usable partial bundle. Without it, the orchestrator stops new work
after a fatal collector failure and preserves completed evidence where safe.
Exit codes: 0 complete/successful preflight; 1 fatal runtime/output error; 2
invalid command; 4 usable partial bundle; 130 interrupted. An invalid output or
unknown scope may prevent bundle creation entirely.

## API limits and scan practices

The adapter uses Octokit with GraphQL and REST fallbacks and applies pagination,
bounded retries, and rate-limit pacing. There is no universal
requests-per-hour assumption. Start with one organization and a small module
selection, use least-privilege access, avoid concurrent scans with the same
credential, schedule broad scans thoughtfully, and inspect coverage rather
than repeatedly retrying denied resources. LFS storage, enterprise
enumeration, SSO, billing, and registry capabilities may not be completely
observable through available APIs.

## Data handling

No PATs, secret values, private keys, webhook secrets, variable values, raw payloads or unredacted diagnostics may be retrieved/exported through this product. Actions secret metadata means approved names/scope/timestamps only. Do not call value-bearing APIs for variables just to discard their values. Do not fetch workflow contents, logs, repository content or artifact binaries by default.

Standard redaction minimizes user identities to run-scoped pseudonyms. Names of repositories, workflows and secrets remain potentially confidential metadata. Sensitive opt-in and minimal redaction cannot bypass prohibited fields. Keep files in ignored `scans/` and `reports/`, agree retention/sharing with the customer, and never commit customer data or URLs. Schema validation alone does not prove string contents are safe. Review [security and privacy](../../docs/specs/security-and-privacy.md).

## Troubleshooting

| Symptom                                  | Interpretation / next step                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GHEC_TOKEN missing, exit 1               | Live collection requires `GHEC_TOKEN` in environment; run with `--dry-run` to test offline           |
| Partial collection, exit 4               | One or more collectors encountered an error with `--continue-on-error`; check bundle errors/coverage |
| Invalid options, exit 2                  | Use discover help; supply exactly one scope and valid `--modules`; arguments are not echoed          |
| Missing built package                    | Run `npm ci` then `npm run build` from the root                                                      |
| HTTP 401 Unauthorized                    | Verify credential presence, validity and expiry locally without printing it                          |
| HTTP 403 Forbidden                       | Check documented capability, role, SSO/approval/policy and throttling; do not blindly broaden scopes |
| Future 404 or missing organization       | Could be absent or inaccessible; verify intended target and access with its administrator            |
| Incomplete Actions/security/SSO evidence | Check plan, role, resource owner and operation support; retain unknown state                         |
| Rate limiting                            | Honor reset/retry guidance; reduce concurrency/module breadth, avoid overlapping scans               |
| Incompatible bundle                      | Use a registered compatible reader or explicit migration; keep original intact                       |
| Output collision or denied path          | Choose a new writable private destination; never overwrite existing evidence implicitly              |
