# Architecture & Implementation Decision Records

Register of technical and architectural decisions made during the migration expansion.

---

## DEC-001: Adoption of Shared-Core Monorepo Architecture with Unified CLI

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (Approved)
- **Decision:** Adopt Option C (Shared-Core Monorepo Architecture) as authoritative. Decompose domain functionality into `packages/contracts`, `packages/github-client`, `packages/discovery`, and `packages/migration`, while retaining `ghec-consultant-cli` as the unified CLI facade in `apps/cli`.
- **Reason:** Keeps discovery and migration aligned on a single GitHub domain model while enforcing physical separation between read-only discovery paths and write-heavy migration paths.
- **Affected Areas:** All workspace packages and applications.

---

## DEC-002: Dual-Tenant Client Isolation

- **Date:** 2026-10-04
- **Agent:** Antigravity
- **Decision:** The migration architecture must instantiate independent `SourceReadClient` and `TargetWriteClient` instances, each with its own credentials and `AdaptiveRateLimiter`.
- **Reason:** Prevents target write tokens from leaking to source endpoints, and prevents rate-limit exhaustion in one tenant from blocking the other.
- **Affected Areas:** `packages/github-client`, `packages/migration`.

---

## DEC-003: Immutable Migration Plan Artifacts

- **Date:** 2026-10-04
- **Agent:** Antigravity
- **Decision:** The `plan` command will generate a deterministic, machine-readable `migration-plan.json` artifact prior to any mutation. The `migrate` command can consume this artifact directly (`--plan`).
- **Reason:** Enables approval gates in GitHub Actions and change management reviews without risk of in-flight discovery drift.
- **Affected Areas:** `packages/contracts`, `packages/migration`, `apps/cli`.

---

## DEC-004: Blank Placeholder Secrets Default with Client Vault Option

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Secret migration modules will create secrets on the target environment using encrypted blank values (`""`) by default. This establishes secret names and visibility scopes in the destination enterprise so that operators only need to update the secret values post-migration. An option to fetch real values from client-provided vaults will be supported.
- **Reason:** GitHub APIs are write-only and do not disclose source secret values. Creating blank-valued secrets establishes the necessary infrastructure footprints and eliminates missing-secret workflow errors.
- **Affected Areas:** `packages/migration/src/modules/repo-secrets/`, `packages/migration/src/modules/org-secrets/`.

---

## DEC-005: Team Structure & Access Migration (Decouple User Membership)

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** The `teams` migration module will focus strictly on migrating team names, descriptions, parent-child hierarchies, and repository permissions. Individual user membership mapping is deferred.
- **Reason:** In GHEC-EMU, team membership is typically governed out-of-band by IdP Group Sync (SCIM/SAML), making direct API assignment of users redundant or prohibited.
- **Affected Areas:** `packages/migration/src/modules/teams/`.

---

## DEC-006: GEI First, Octokit API Rehydration Second

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Repository migrations will execute GEI first for core Git repository content, PRs, issues, and classic branch protections. Octokit API modules execute immediately post-GEI to migrate variables, blank/vault secrets, rulesets, environments, webhooks, LFS objects, and oversized releases (>10GB).
- **Reason:** Preserves GEI as canonical for repository data while ensuring configuration and governance not handled by GEI are fully restored.
- **Affected Areas:** `packages/migration/src/orchestrator/pipeline.ts`.

---

## DEC-007: Primary Target: Self-Hosted Runners with Persistent Storage

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** The migration architecture and CI/CD workflow templates will be designed primarily around self-hosted runners with persistent local disk storage.
- **Reason:** Accommodates long-running migrations that exceed GitHub-hosted runner execution limits and enables multi-day weekend cutover schedules (Friday discovery/cache $\rightarrow$ review plan $\rightarrow$ Saturday migration).
- **Affected Areas:** `apps/cli`, `packages/migration`, `.github/workflows/`.

---

## DEC-008: Dependency Graph Ordering for Repository Waves

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Utilize `@ghec/analysis` dependency graph algorithms to calculate repository wave order, migrating upstream dependency repositories prior to downstream consumer repositories.
- **Reason:** Minimizes broken references and workflow run errors during staggered enterprise cutovers.
- **Affected Areas:** `packages/migration/src/orchestrator/slicer.ts`.

---

## DEC-009: Classic Branch Protection Reconciliation Engine

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Reconcile classic branch protections rather than overwriting them. GEI transfers classic branch protection rules but drops 7 specific settings (`bypass_pull_request_allowances`, `require_last_push_approval`, `required_deployments_enforcement_level`, `lock_branch`, `block_creations`, force push user restrictions, and dismissal exemptions). The `branch-protection` module will discover source rules, query post-GEI destination state, diff for the 7 omitted settings, and apply an in-place `PUT` update.
- **Reason:** Prevents destructive overwrites or branch conflicts while restoring mission-critical branch governance controls.
- **Affected Areas:** `packages/migration/src/modules/branch-protection/`.

---

## DEC-010: Two-Tier Large Release & Metadata Overflow Strategy

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Preflight inspects release asset sizes across all releases. If total release size exceeds 10 GiB or repository metadata exceeds 40 GiB, the GEI executor automatically passes `--skip-releases` to prevent migration job failure. Post-GEI, a dedicated release fallback engine recreates releases via REST API and streams binary assets from source to destination in chunks.
- **Reason:** Eliminates migration job failures caused by GEI's hard 10 GiB release limit and 40 GiB metadata archive threshold.
- **Affected Areas:** `packages/migration/src/strategies/releases/`, `packages/migration/src/preflight/`.

---

## DEC-011: Git LFS Dual-Remote Streamed Migration Strategy

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Git LFS objects (which GEI drops entirely) will be transferred using a specialized dual-remote mirror-and-push strategy on persistent self-hosted runners (`git lfs fetch --all` from source, `git lfs push --all` to target).
- **Reason:** GEI only migrates LFS pointer files, resulting in 404 errors when developers attempt to pull LFS objects on the destination without follow-up transfer.
- **Affected Areas:** `packages/migration/src/strategies/git-lfs/`.

---

## DEC-012: Destination Ruleset Preflight & Exempt Bypass Enforcement

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Preflight must audit destination organization and enterprise rulesets to verify that "Repository migrations" is added to the bypass list in **Exempt** mode prior to initiating GEI.
- **Reason:** GEI pushes refs in batches. If destination rulesets evaluate these refs, migrations fail (`GH013`) or time out. "Exempt" mode bypasses evaluation completely.
- **Affected Areas:** `packages/migration/src/preflight/`.

---

## DEC-013: Mannequin Reattribution with EMU Fast-Track (`--skip-invitation`)

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Mannequins created by GEI are reattributed using `gh gei reclaim-mannequin` with `--skip-invitation`. In GHEC-EMU, enterprise authority enables immediate attribution without waiting for individual user email acceptance. The limitation that Git commits authored with non-primary emails cannot be linked to EMU accounts is documented in audit reports.
- **Reason:** Ensures issue and pull request contribution history is immediately restored to provisioned enterprise identities.
- **Affected Areas:** `packages/migration/src/post-migration/mannequins/`.

---

## DEC-014: Webhook Anti-Duplication Reconciliation

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** Webhook migration must never blindly call `POST /repos/.../hooks` because GEI already transfers active webhooks into a disabled state. The module will match target webhooks by payload URL, re-hydrate secret tokens from vault/env, and execute `PATCH /repos/.../hooks/{id}` with `active: true`.
- **Reason:** Prevents duplicate webhook endpoints on destination repositories while re-establishing delivery and cryptographic signature validation.
- **Affected Areas:** `packages/migration/src/modules/webhooks/`.

---

## DEC-015: Repository Visibility Post-GEI Restoration Gate

- **Date:** 2026-10-04
- **Agent:** Antigravity & Codex (User Approved)
- **Decision:** GEI creates all migrated repositories with `private` visibility. The suite records source visibility during preflight and executes a post-GEI reconciliation pass (`PATCH /repos/...`) to restore original `internal` or `public` visibility where permitted by target enterprise policy.
- **Reason:** Restores cross-organization dependency consumption and inner-source collaboration models.
- **Affected Areas:** `packages/migration/src/modules/repo-settings/`.

---

## DEC-016: Keep `apps/cli/src/github/*` as Re-Export Shims

- **Date:** 2026-10-04
- **Agent:** Antigravity
- **Decision:** After extracting `@ghec/github-client`, the old CLI modules remain as thin re-exports; production code imports the package directly.
- **Reason:** Task 001 requires the 116 existing tests to pass unmodified, and they import `../src/github/*`. Remove the shims once the tests are migrated.
- **Affected Areas:** `apps/cli/src/github/`, `apps/cli/tests/`.

---

## DEC-017: Discovery Compatibility Shims and Host-Owned Config

- **Date:** 2026-10-04
- **Agent:** Antigravity
- **Decision:** (1) `@ghec/discovery` owns the `DiscoveryPlan` and `DiscoveryConfig` types, while argv parsing and env/credential loading stay in `apps/cli`. (2) Old CLI module paths remain as re-export shims until tests are repointed.
- **Reason:** Keeps the package free of CLI dependencies so `@ghec/migration` can reuse it. Existing tests (CLI and dashboard) import the old paths and the task requires them to pass unmodified.
- **Affected Areas:** `packages/discovery/`, `apps/cli/src/`, `apps/dashboard/tests/portfolio.test.ts`.
