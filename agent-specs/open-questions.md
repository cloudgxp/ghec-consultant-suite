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
