# Architecture & Technical Decisions and Open Questions Register

**Specification Status:** Authoritative Decision Record & Living Register  
**Target:** GHEC Migration Architecture  
**Applicability:** All implementation agents (Antigravity & Codex)  
**Last Updated:** 2026-10-04 (Incorporated User Architectural Direction)

---

## 1. Resolved: Secret Value Ingestion Strategy (DEC-004)

- **Status:** **Resolved**
- **Decision:**
  1. **Default Behavior (Blank Secrets):** The suite will migrate secrets by creating them on the target repository/organization with an **encrypted blank placeholder value** (e.g. `""` encrypted using the target repository/organization public key via libsodium/`tweetnacl`). This ensures that secret names and visibility scopes are established on the target, so customers/consultants only need to update the secret values manually or via automation post-migration.
  2. **Full Migration Option (Vault Integration):** The system must support an option to perform full migrations by obtaining real secret values from client-provided vaults (e.g. HashiCorp Vault, Azure Key Vault, AWS Secrets Manager, or secured environment payloads).
- **Implementation Impact:** Task 011 (`repo-secrets`) and Task 016 (`org-secrets`) will implement blank-value encryption as the default apply strategy.

---

## 2. Open: Enterprise Managed Users (EMU) Identity Mapping

- **Status:** **Open / Deferred**
- **Context:** Source users do not match target EMU users (e.g. `octocat` $\rightarrow$ `octocat_acme` or completely distinct IdP UPNs). Because mapping rules vary widely per customer and IdP configuration, hardcoding identity transformations would be premature.
- **Current Approach:**
  - Defer automatic user mapping.
  - Implement a pluggable, optional identity mapping interface (`IdentityMappingEngine`) in `@ghec/migration`.
  - When unmapped identities are encountered (in CODEOWNERS or branch protection bypasses), emit structured advisories (`warn`) rather than failing the migration.

---

## 3. Resolved: Team Structure Migration & Membership Decoupling (DEC-005)

- **Status:** **Resolved**
- **Decision:**
  - **Focus on Structure and Repository Access:** The `teams` migration module will focus strictly on migrating **team names, descriptions, parent-child hierarchy structures, and repository permission grants**.
  - **User Membership Decoupled:** User membership migration via the Teams API is explicitly deferred. In GHEC-EMU, team membership is frequently managed out-of-band by Identity Provider (IdP) Group Sync (SCIM/SAML), making direct API insertion of users either redundant or rejected by GitHub policy.
- **Implementation Impact:** Task 017 (`teams`) will prioritize team tree creation and repository permission bindings (`read`, `triage`, `write`, `maintain`, `admin`), omitting direct user membership synchronization.

---

## 4. Resolved: GEI vs. Octokit Migration Boundary (DEC-006)

- **Status:** **Resolved**
- **Decision:**
  - **Stage 1 (GEI):** GitHub Enterprise Importer runs first for repository data (git commit history, branches, tags, pull requests, issues, comments, wikis, and classic branch protections).
  - **Stage 2 (Octokit API Modules):** Targeted API migration modules execute immediately post-GEI to migrate items that GEI does not transfer:
    - Secrets (blank values by default or vault-supplied)
    - Repository and Organization Variables
    - Modern Rulesets & Rule Protections
    - Deployment Environments & Protection Rules
    - Webhooks
    - Large assets / LFS object reconciliation
    - Oversized releases/assets exceeding GEI limits (>10GB)
- **Implementation Impact:** Solidifies the pipeline order in Task 015 (`gei-orchestrator-pipeline-integration`).

---

## 5. Resolved: Self-Hosted Runner Target & Multi-Day Cutover Model (DEC-007)

- **Status:** **Resolved**
- **Decision:**
  - **Self-Hosted Runner Focus:** The architecture and GitHub Actions workflows are primarily designed around **self-hosted runners** with persistent local disk storage or network volumes.
  - **Rationale:**
    1. Large enterprise migrations can exceed the execution timeouts of GitHub-hosted runners.
    2. GitHub-hosted runners are ephemeral, making multi-day cutover windows difficult (e.g. Friday discovery & planning $\rightarrow$ review plan $\rightarrow$ Saturday migration execution).
    3. Self-hosted runners allow storing `./scans/` discovery bundles and `./migrations/.checkpoint-<runId>/` on persistent mounts across multiple days without requiring fragile external artifact uploads.
- **Implementation Impact:** Task 020 and Task 021 will target self-hosted runner topologies, configurable runner labels, and persistent volume paths.

---

## 6. Resolved: Cross-Repository Dependency Ordering via `@ghec/analysis` (DEC-008)

- **Status:** **Resolved**
- **Decision:** Leverage `@ghec/analysis`'s dependency graph algorithms (`buildDependencyIndex`, `transitiveDependencies`, and `stronglyConnectedComponents`) to partition and sequence repository migration cohorts. Repositories providing shared internal packages or reusable Actions workflows are prioritized in earlier migration waves.
- **Implementation Impact:** Embedded in Task 020 (`scope-matrix-slicer-parallel-execution`).

---

## 7. Resolved: Branch Protection Reconciliation vs. Blind Overwrite (DEC-009)

- **Status:** **Resolved**
- **Decision:** Do not blindly recreate branch protections on the destination. GEI natively migrates classic branch protections, but deliberately drops 7 specific settings (`bypass_pull_request_allowances`, `require_last_push_approval`, `required_deployments_enforcement_level`, `lock_branch`, `block_creations`, force push restrictions, and dismissal exemptions). The `branch-protection` module will discover source state, query post-GEI destination state, diff for the 7 omitted settings, and apply an in-place `PUT` reconciliation.

---

## 8. Resolved: Two-Tier Large Release & Overflow Strategy (DEC-010)

- **Status:** **Resolved**
- **Decision:** Preflight calculates total release asset sizes per repository. If release assets exceed 10 GiB or repository metadata exceeds 40 GiB, the GEI executor passes `--skip-releases` to prevent migration job abortion. Post-GEI, a dedicated release fallback engine recreates releases via REST API and streams binary assets from source to destination in chunks.

---

## 9. Resolved: Git LFS Dual-Remote Streamed Migration Strategy (DEC-011)

- **Status:** **Resolved**
- **Decision:** Git LFS objects (which GEI drops entirely) are migrated via a specialized dual-remote mirroring strategy on persistent self-hosted runners (`git lfs fetch --all` from source, `git lfs push --all` to target). Verifies enterprise LFS quota enablement prior to push.

---

## 10. Resolved: Destination Ruleset Preflight & Exempt Bypass Enforcement (DEC-012)

- **Status:** **Resolved**
- **Decision:** Before launching GEI, the suite audits destination organization and enterprise rulesets to verify that "Repository migrations" is added to the bypass list in **Exempt** mode. (The "Always allow" mode is rejected because evaluation still occurs and triggers timeouts during ref batch pushes).

---

## 11. Resolved: Mannequin Reattribution with EMU Fast-Track (DEC-013)

- **Status:** **Resolved**
- **Decision:** User activity (issues, PRs, comments) imported under mannequins is reattributed using `gh gei reclaim-mannequin` with `--skip-invitation`. In GHEC-EMU, enterprise authority allows immediate attribution without waiting for individual user acceptance. The suite explicitly documents the platform limitation that Git commits authored with non-primary emails cannot be linked to EMU accounts.

---

## 12. Resolved: Webhook Anti-Duplication Reconciliation (DEC-014)

- **Status:** **Resolved**
- **Decision:** GEI transfers active webhooks into a disabled state with purged secrets. The migration module must never call `POST /repos/.../hooks` (which creates duplicate webhooks); it must match migrated webhooks by target URL and subscribed events, rehydrate the secret from vault/env, and execute `PATCH /repos/.../hooks/{id}` with `active: true`.

---

## 13. Resolved: Repository Visibility Post-GEI Restoration Gate (DEC-015)

- **Status:** **Resolved**
- **Decision:** GEI forces all migrated repositories to `private` visibility. The suite records original source visibility (`internal`, `public`, `private`) during preflight/discovery and executes a post-GEI reconciliation pass (`PATCH /repos/...`) to restore intended visibility in accordance with target enterprise policy.

---

## 14. Living Open Questions

### Q-1: Historical Code Scanning SARIF Sync Scope

- **Context:** GEI does not migrate code scanning alerts. Source alerts can be exported as SARIF and uploaded to the target via REST API, but historical timeline and dismissal states are flattened to `open` or `fixed`, and the creator becomes the PAT owner.
- **Question:** Should SARIF sync be enabled by default for all GHAS-enabled repositories, or offered as an opt-in flag given that a new scan on the target default branch will automatically populate current alerts?

### Q-2: External Package Registry vs. GitHub Packages Cutover

- **Context:** GEI does not migrate GitHub Packages (npm, Maven, Container/GHCR, NuGet). Rebuilding or re-pushing packages via CI/CD is standard enterprise practice.
- **Question:** Should the suite generate package republishing scripts for CI/CD, or restrict package handling to discovery inventory and readiness warnings?
