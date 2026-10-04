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
