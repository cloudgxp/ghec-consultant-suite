# Feature Specification: 3-Tier Navigable Audit Results Hierarchy & Granular Item Reporting

**Feature Branch**: `004-granular-results-hierarchy`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Upgrade the `gei-migration-results` audit repository generator (`@ghec/contracts`, `@ghec/migration`, and `apps/cli`) into a 3-tier navigable Markdown drill-down hierarchy with granular organization-level and repository-level item reporting. 1. Problem & Goal: Currently, `generateMigrationResults` and `results-markdown-formatter.ts` produce a flat `README.md` and basic `success/<repo>.md` or `failure/<repo>.md` pages. They only recognize 6 hardcoded organization modules, do not link to granular organization module details, do not attribute per-repository module execution results when invoked from `migration-execution.json`, and do not show a per-repository summary table of migrated items with links to granular item-level pages. We want a 3-tier drill-down architecture inside `gei-migration-results`: Tier 1 (`README.md`), Tier 2 Organization Module Detail (`organization/<module>.md`), Tier 2 Repository Overview (`success/<repo>.md` and `failure/<repo>.md`), and Tier 3 Repository Module Granular Detail (`repositories/<repo>/<module>.md`). 2. Data Contract & Orchestrator Requirements: Enrich `OperationExecutionResultSchema` and `ModuleExecutionResultSchema` in `@ghec/contracts` with optional backward-compatible metadata fields (`targetIdentifier`, `scopeLevel`, `resourceType`, `resourceName`, `operationType`, `reason`) populated by `MigrationOrchestrator` and `RepositoryMigrationPipeline` from `ModulePlan` / `PlannedOperation` during execution so `migration-execution.json` is self-contained. Update `MigrationResultsManifestSchema` in `@ghec/contracts` to represent organization module relative file paths (`organization/<module>.md`), per-repository module summaries, and Tier 3 relative file paths (`repositories/<repo>/<module>.md`). Ensure `publish-results` and `migrate --publish-results` accurately correlate both organization-level and repository-level `ModuleExecutionResult` entries, `VerificationReport` discrepancies, and `RemediationPlan` actions even when only `executionReport` and `scope` (or `plan`) are provided. Enforce Zero-Exposure Secret Boundary (DEC-004)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Executive Overview & Organization-Level Granular Drill-Down (Priority: P1)

As an enterprise migration consultant or stakeholder reviewing the `gei-migration-results` audit repository, I need the root `README.md` (Tier 1) to list every executed organization-level module across the entire catalog (not just 6 hardcoded modules) with item counts, discrepancy counts, and clickable links to dedicated `organization/<module>.md` detail pages (Tier 2), so that I can inspect the exact status, operation type, and verification parity of every individual organization asset (teams, organization variables, sealed organization secrets, custom properties, custom roles, Projects v2, runners, enterprise policies, organization rulesets, mannequins, etc.).

**Why this priority**: Organization-level governance, identity mappings, and security policies form the foundation of an Enterprise Managed Users (EMU) migration. Stakeholders and compliance auditors cannot sign off on a migration when organization modules are either omitted from the summary table or reduced to aggregate operation counts without showing which specific teams, roles, policies, or variables were created, skipped, or failed.

**Independent Test**: Can be tested independently by generating results from a synthetic execution report and verification report containing multiple organization modules (including `teams`, `org-variables`, `org-secrets`, `custom-properties`, `org-custom-roles`, `org-projects-v2`, `actions-runners`, and org-scoped `rulesets`). Verification confirms that `README.md` links to `organization/<module>.md` for every executed module, and each `organization/<module>.md` page renders a breadcrumb back to `../README.md` along with a granular items table listing each processed organization resource.

**Acceptance Scenarios**:

1. **Given** a migration run that executes any combination of organization-scoped modules (all modules in `ALL_ORGANIZATION_MODULES` plus organization-scoped `rulesets`), **When** `generateMigrationResults` compiles the audit repository, **Then** Tier 1 (`README.md`) displays every executed organization module in the **Organization-Level Modules** table with status badge, `Total`, `Succeeded`, `Failed`, `Skipped`, `Discrepancies`, `Duration`, and a clickable `[View Details](organization/<module>.md)` link.
2. **Given** an executed organization module, **When** a user navigates to `organization/<module>.md` (Tier 2), **Then** the page renders a `[← Back to Overview](../README.md)` breadcrumb, module summary metrics, any module-level warnings or errors, and a **Granular Organization Items** table listing every individual item with its resource name, resource type, operation type (`create`, `update`, `noop`, `skip`), execution status (`succeeded`, `failed`, `skipped`), verification status/discrepancy details, and sanitized diagnostic notes.
3. **Given** organization secrets processed by `org-secrets` or actions runner secrets, **When** rendered in `organization/org-secrets.md` or `manifest.json`, **Then** only the secret name and a `[SEALED]` placeholder indicator are displayed, never exposing plaintext or encrypted secret payloads.

---

### User Story 2 - Repository Overview & Per-Category Item Summary Table (Priority: P1)

As a migration operator or repository owner inspecting `README.md` (Tier 1) and navigating to a repository's outcome page (`success/<repo>.md` or `failure/<repo>.md`, Tier 2), I need to see a comprehensive **Migrated Items Summary Table** broken down by every repository module/category executed for that repository (`gei-repo`, `repo-settings`, `branch-protection`, `rulesets`, `environments`, `repo-variables`, `repo-secrets`, `webhooks`, `issues`, `pull-requests`, `releases`, `lfs`, `collaborators`, `deploy-keys`, `autolinks`, `discussions`, `repo-custom-properties`, etc.), with item counts and a clickable link (`[View Items](../repositories/<repo>/<module>.md)`) for each category, so that I can immediately see what was migrated for that repository and drill down into any specific category.

**Why this priority**: Previously, `success/<repo>.md` only showed generic stage names (`preflight`, `gei`, `verification`) without breaking down how many branch protections, rulesets, secrets, variables, environments, webhooks, issues, pull requests, or releases were migrated for that repository. Repository owners need verifiable proof of per-category item counts on their repository's overview page.

**Independent Test**: Can be tested independently by passing an execution report containing repository-scoped module executions for `repo-alpha` (succeeded) and `repo-beta` (failed) into `generateMigrationResults`. Verification confirms that `README.md` shows total categories/items migrated per repository and links to `success/repo-alpha.md` and `failure/repo-beta.md`, and both Tier 2 pages contain a `[← Back to Overview](../README.md)` breadcrumb and a **Migrated Items Summary** table with relative links to `../repositories/<repo>/<module>.md`.

**Acceptance Scenarios**:

1. **Given** a migrated repository (succeeded or failed), **When** Tier 1 (`README.md`) renders the **Repositories Index** table, **Then** each row displays the repository name, status badge, migrated categories/items summary count, discrepancy count, duration, and a clickable link to `success/<repo>.md` or `failure/<repo>.md`.
2. **Given** a repository overview page at `success/<repo>.md` or `failure/<repo>.md` (Tier 2), **When** rendered, **Then** it includes a `[← Back to Overview](../README.md)` breadcrumb at the top, repository metadata and GEI transfer summary, diagnostic blockers and remediation commands (for failures), and a **Migrated Items Summary** table with one row per executed repository module showing module name, status badge, `Total`, `Succeeded`, `Failed`, `Skipped`, `Discrepancies`, `Duration`, and `[View Items](../repositories/<repo>/<module>.md)`.
3. **Given** a repository with verification discrepancies or failed operations in a specific module (e.g., `webhooks` or `rulesets`), **When** viewing `failure/<repo>.md`, **Then** the **Migrated Items Summary** table highlights the affected module's failed/discrepancy counts and links directly to `../repositories/<repo>/<module>.md`.

---

### User Story 3 - Granular Per-Repository Category Item Drill-Down (Priority: P1)

As a migration engineer or auditor drilling down from a repository overview page (`success/<repo>.md` or `failure/<repo>.md`) into a specific category page (`repositories/<repo>/<module>.md`, Tier 3), I need to see a complete table of every individual item migrated or verified in that category for that repository—including resource name, resource type, planned operation (`create`, `update`, `noop`, `skip`), execution status (`succeeded`, `failed`, `skipped`), completed timestamp, verification parity status, and any error or discrepancy diff (`expected` vs `actual`)—so that I can verify item-by-item migration fidelity or pinpoint the exact item that failed.

**Why this priority**: When a repository has 25 variables, 12 secrets, 4 environments, 8 webhooks, and 50 releases, an operator needs a dedicated Tier 3 page per module (`repositories/<repo>/<module>.md`) to inspect the exact items without cluttering the Tier 2 repository overview page or losing granular visibility.

**Independent Test**: Can be tested independently by generating results for a repository with operations across multiple modules (`repo-variables`, `repo-secrets`, `webhooks`, `releases`, `rulesets`) and verifying that `repositories/<repo>/<module>.md` is generated for each module, contains valid breadcrumbs back to `../../success/<repo>.md` (or `../../failure/<repo>.md`) and `../../README.md`, and lists every individual item with sanitized details.

**Acceptance Scenarios**:

1. **Given** a repository `<repo>` and an executed repository module `<module>`, **When** `repositories/<repo>/<module>.md` (Tier 3) is generated, **Then** it includes breadcrumb links `[← Back to <repo>](../../success/<repo>.md)` (or `../../failure/<repo>.md` when the repo status is failed) and `[Overview](../../README.md)`.
2. **Given** individual operations and verification checks for `<repo>` under `<module>`, **When** the **Granular Repository Items** table in `repositories/<repo>/<module>.md` is rendered, **Then** every item row displays: Resource Name, Resource Type, Operation (`create`, `update`, `noop`, `skip`), Execution Status (`succeeded`, `failed`, `skipped`), Completed At, Verification Status (`✅ Verified`, `❌ Discrepancy`, or `—`), and Notes / Discrepancy Diff (`expected` vs `actual` or sanitized error/reason).
3. **Given** repository secrets (`repo-secrets` or environment secrets) or webhooks with secret tokens/URLs, **When** rendered in `repositories/<repo>/<module>.md`, **Then** secret values are shown strictly as `[SEALED]` placeholders and webhook URLs or error messages containing credentials are scrubbed via `sanitizeDiagnostics`.

---

### User Story 4 - Self-Contained Execution Artifact Attribution & Standalone CLI Publishing (Priority: P2)

As a CLI user or automated GitHub Actions workflow running `ghec-consultant-cli publish-results --execution-report migration-execution.json --verification-report verification-report.json --scope scope.json` (or `migrate --publish-results`), I need `migration-execution.json` to carry enriched per-module and per-operation metadata (`targetIdentifier`, `scopeLevel`, `resourceType`, `resourceName`, `operationType`, `reason`) populated automatically during orchestration, so that `publish-results` can accurately reconstruct the full 3-tier hierarchy even when invoked in a separate workflow job without in-memory `RepositoryPipelineResult` objects.

**Why this priority**: In partitioned GitHub Actions workflows and standalone CLI runs, `publish-results` reads serialized JSON artifacts (`migration-execution.json`, `verification-report.json`, `remediation-plan.json`, `scope.json`) from disk. Previously, `ModuleExecutionResult` and `OperationExecutionResult` omitted the target repository identifier and human-readable resource metadata from `ModulePlan`/`PlannedOperation`, preventing `publish-results` from attributing per-repository module results when `pipelineResults` were not passed in memory.

**Independent Test**: Can be tested by running `MigrationOrchestrator` / `RepositoryMigrationPipeline` to produce `migration-execution.json`, serializing it to disk, and invoking `executePublishResultsCommand` using only the file paths on disk. Verification confirms that all 3 tiers (`README.md`, `organization/<module>.md`, `success|failure/<repo>.md`, and `repositories/<repo>/<module>.md`) and `manifest.json` are accurately populated and schema-validated.

**Acceptance Scenarios**:

1. **Given** a `ModulePlan` containing `PlannedOperation` entries (`id`, `type`, `resourceType`, `resourceName`, `reason`), **When** `MigrationOrchestrator` or `RepositoryMigrationPipeline` records the `ModuleExecutionResult`, **Then** it enriches each `OperationExecutionResult` with `resourceType`, `resourceName`, `operationType`, and `reason` from the corresponding `PlannedOperation`, and enriches `ModuleExecutionResult` with `targetIdentifier` (e.g., target repository name or target organization) and `scopeLevel` (`organization` or `repository`).
2. **Given** a legacy `migration-execution.json` artifact that lacks the optional enrichment fields, **When** validated by `ModuleExecutionResultSchema` or consumed by `generateMigrationResults`, **Then** schema validation succeeds (backward-compatible optional fields) and the generator gracefully infers resource names and repository attribution from `operationId` patterns, `verification-report.json`, and `scope.json`.
3. **Given** `MigrationResultsManifestSchema` in `@ghec/contracts`, **When** `manifest.json` is generated and validated, **Then** `summary.orgModulesSummary[moduleId]` includes `relativeFilePath` (`organization/<module>.md`) and `discrepancyCount`, and each `RepositoryMigrationRecord` includes `moduleSummaries` (mapping each executed repo module to its counts, status, and `relativeFilePath: "repositories/<repo>/<module>.md"`).

---

### Edge Cases

- **Legacy / Unenriched Execution Reports**: When `OperationExecutionResult` entries come from older artifacts or direct module invocations that do not populate `resourceName`, `resourceType`, or `targetIdentifier`, the generator must fall back deterministically to parsing `operationId` (e.g., `<module>:<op>:<repo>:<resource>`) and matching repository names against `scope.repositories` or `verificationReport`.
- **Dual-Scoped Modules (`rulesets`)**: The `rulesets` module can execute at both the organization level and the repository level (`rulesets` vs `rulesets-org`). The generator must inspect `scopeLevel` and `targetIdentifier` (or operation/module metadata) so organization rulesets appear under `organization/<module>.md` and repository rulesets appear under `repositories/<repo>/rulesets.md`.
- **Modules with Zero Operations (`noop` or Empty Scope)**: When an executed module has `0` operations (e.g., a repository has `0` autolinks or `0` deploy keys), the Tier 2 summary table shows `0` items and the Tier 3 page (`repositories/<repo>/<module>.md`) renders an explicit empty-state message (`_No items were processed for this module._`) rather than omitting the linked file or leaving a broken link.
- **Verification-Only Discrepancies Without Execution Operations**: If `verification-report.json` reports a discrepancy for a repository/module that had no corresponding entry in `migration-execution.json` (or when `publish-results` is invoked with `--verification-report` and `--scope` only), the generator still synthesizes the module summary and Tier 3 detail page showing the verification discrepancy so no audit evidence is hidden.
- **Special Characters in Resource Names or Error Messages**: Resource names or diagnostic messages containing pipe characters (`|`), newlines (`\n`), or Markdown syntax must be escaped in Markdown table cells so table layout is never corrupted.
- **Zero-Exposure Secret & Token Scrubbing (DEC-004)**: Any secret module (`org-secrets`, `repo-secrets`, `environments` secrets, `dependabot` or `codespaces` secrets) must display `[SEALED]` in item summaries, and all URLs, error strings, expected/actual values, and remediation commands must pass through `sanitizeDiagnostics`.

## Requirements _(mandatory)_

### Functional Requirements

#### Contract & Schema Enrichment (`@ghec/contracts`)

- **FR-001**: `OperationExecutionResultSchema` in `@ghec/contracts` MUST support optional backward-compatible metadata fields:
  - `resourceType` (non-empty string, optional)
  - `resourceName` (non-empty string, optional)
  - `operationType` (`'create' | 'update' | 'delete' | 'noop' | 'skip'`, optional)
  - `reason` (string, optional)
  - `targetIdentifier` (non-empty string, optional)
- **FR-002**: `ModuleExecutionResultSchema` in `@ghec/contracts` MUST support optional backward-compatible context fields:
  - `targetIdentifier` (non-empty string, optional — identifying the target repository name for repo-scoped runs or target organization name for org-scoped runs)
  - `scopeLevel` (`'organization' | 'repository'`, optional)
- **FR-003**: `OrgModuleResultSummarySchema` in `@ghec/contracts` MUST include:
  - `discrepancyCount` (non-negative integer, default `0`)
  - `relativeFilePath` (non-empty string starting with `"organization/"` and ending with `".md"`, optional or populated on generation)
- **FR-004**: `@ghec/contracts` MUST define `RepoModuleResultSummarySchema` (with `moduleId`, `status`, `totalOperations`, `succeededOperations`, `failedOperations`, `skippedOperations`, `discrepancyCount`, `durationMs`, and `relativeFilePath` starting with `"repositories/"` and ending with `".md"`) and include `moduleSummaries: z.record(z.string(), RepoModuleResultSummarySchema).optional()` on `RepositoryMigrationRecordSchema`.

#### Orchestrator & Pipeline Metadata Propagation (`@ghec/migration`)

- **FR-005**: `MigrationOrchestrator` and `RepositoryMigrationPipeline` MUST enrich `ModuleExecutionResult` and its child `OperationExecutionResult` items after `module.apply(plan)` by correlating each `OperationExecutionResult.operationId` with its corresponding `PlannedOperation` from `ModulePlan.operations`, copying `resourceType`, `resourceName`, `operationType: op.type`, `reason`, `targetIdentifier`, and `scopeLevel`.
- **FR-006**: When `RepositoryMigrationPipeline` executes repository-level stages (including `gei-repo` / mirror-push and metadata modules), `MigrationOrchestrator` MUST include or preserve per-repository `ModuleExecutionResult` entries with `targetIdentifier: targetRepo` and `scopeLevel: 'repository'` in `MigrationExecutionReport.results` (or `pipelineResults`) so serialized `migration-execution.json` files contain complete per-repository module attribution.

#### 3-Tier Audit Repository Generation (`@ghec/migration` & `apps/cli`)

- **FR-007**: `generateMigrationResults` MUST recognize all organization-scoped modules defined in `ALL_ORGANIZATION_MODULES` (as well as any module with `scopeLevel === 'organization'`, `moduleId.startsWith('org-')`, or `rulesets-org`) rather than a hardcoded 6-module subset.
- **FR-008**: For every executed organization module, `generateMigrationResults` MUST generate a Tier 2 Markdown file at `organization/<moduleId>.md` and link to it from the **Organization-Level Modules** table in `README.md` (`[View Details](organization/<moduleId>.md)`).
- **FR-009**: Each `organization/<moduleId>.md` page MUST include:
  - Breadcrumb navigation (`[← Back to Overview](../README.md)`).
  - Module execution summary metrics (`Status`, `Total Items`, `Succeeded`, `Failed`, `Skipped`, `Discrepancies`, `Duration`).
  - A **Granular Organization Items** table listing each operation/item with columns for Resource Name, Resource Type, Operation, Execution Status, Verification Status, and Diagnostic Notes / Discrepancies.
- **FR-010**: Tier 1 (`README.md`) **Repositories Index** table MUST display for each repository: Repository Name, Status Badge, Migrated Categories / Items count, Discrepancy Count, Duration, and a clickable link to `success/<repo>.md` or `failure/<repo>.md`.
- **FR-011**: Each Tier 2 repository overview page (`success/<repo>.md` and `failure/<repo>.md`) MUST include:
  - Breadcrumb navigation (`[← Back to Overview](../README.md)`).
  - Repository summary metadata, GEI transfer summary, and (for `failure/<repo>.md`) diagnostic errors, verification discrepancies, and remediation commands.
  - A **Migrated Items Summary** table listing every executed repository module/category for that repository with columns: Module / Category, Status Badge, Total Items, Succeeded, Failed, Skipped, Discrepancies, Duration, and a clickable link `[View Items](../repositories/<repo>/<moduleId>.md)`.
- **FR-012**: For every repository `<repo>` and each of its executed or verified repository modules `<moduleId>`, `generateMigrationResults` MUST generate a Tier 3 Markdown file at `repositories/<repo>/<moduleId>.md`.
- **FR-013**: Each Tier 3 `repositories/<repo>/<moduleId>.md` page MUST include:
  - Breadcrumb navigation (`[← Back to <repo>](../../success/<repo>.md)` or `../../failure/<repo>.md` matching the repository's status, plus `[Overview](../../README.md)`).
  - Module summary header for `<repo>` (`Module`, `Repository`, `Status`, `Total Items`, `Succeeded`, `Failed`, `Skipped`, `Discrepancies`, `Duration`).
  - A **Granular Repository Items** table listing every individual item processed or verified in that module for `<repo>`, with columns: Resource Name, Resource Type, Operation, Status, Completed At, Verification, and Notes / Error / Discrepancy Diff.
- **FR-014**: Every internal relative Markdown link across Tier 1 (`README.md`), Tier 2 (`organization/<module>.md`, `success/<repo>.md`, `failure/<repo>.md`), and Tier 3 (`repositories/<repo>/<module>.md`) MUST resolve to an existing key in `GeneratedResults.files` with zero broken links.

#### Security, Sanitization & Integrity Invariants

- **FR-015**: In compliance with DEC-004 (Zero-Exposure Secret Boundary), secret modules (`org-secrets`, `repo-secrets`, environment secrets) MUST never include secret values in any generated Markdown or JSON file and MUST annotate secret items with a `[SEALED]` indicator.
- **FR-016**: All diagnostic messages, failure reasons, webhook URLs, discrepancy expected/actual diffs, and table cell strings MUST be passed through `sanitizeDiagnostics` and escaped for GitHub Flavored Markdown table compatibility.

### Key Entities _(include if feature involves data)_

- **Enriched Operation Execution Result**: Individual item execution record (`operationId`, `status`, `completedAt`, `httpStatus`, `error`) augmented with `resourceType`, `resourceName`, `operationType`, `reason`, and `targetIdentifier`.
- **Enriched Module Execution Result**: Module-level execution record (`moduleId`, `status`, `durationMs`, `results`) augmented with `targetIdentifier` and `scopeLevel` (`organization` | `repository`).
- **Organization Module Summary & Detail (`OrgModuleResultSummary`)**: Summary metrics (`status`, `totalOperations`, `succeededOperations`, `failedOperations`, `skippedOperations`, `discrepancyCount`, `durationMs`, `relativeFilePath: "organization/<module>.md"`) paired with its Tier 2 granular items list.
- **Repository Module Summary & Detail (`RepoModuleResultSummary`)**: Per-repository, per-module summary metrics (`moduleId`, `status`, `totalOperations`, `succeededOperations`, `failedOperations`, `skippedOperations`, `discrepancyCount`, `durationMs`, `relativeFilePath: "repositories/<repo>/<module>.md"`) paired with its Tier 3 granular items list.
- **3-Tier Results File Map (`GeneratedResults.files`)**: Complete virtual file tree committed to `gei-migration-results` containing `manifest.json`, `README.md` (Tier 1), `organization/<module>.md` (Tier 2), `success/<repo>.md` & `failure/<repo>.md` (Tier 2), and `repositories/<repo>/<module>.md` (Tier 3).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of executed organization-level modules from the 32-module catalog appear in the root `README.md` table and have corresponding navigable `organization/<module>.md` pages with item-level breakdowns.
- **SC-002**: 100% of migrated repositories in `success/<repo>.md` and `failure/<repo>.md` display a **Migrated Items Summary** table covering all executed repository categories with working links to `../repositories/<repo>/<module>.md`.
- **SC-003**: 100% of relative Markdown links across all 3 tiers (`README.md` ↔ Tier 2 ↔ Tier 3) resolve to valid generated files in `GeneratedResults.files` with 0 broken links or missing targets.
- **SC-004**: Standalone execution of `publish-results` using serialized `migration-execution.json`, `verification-report.json`, and `scope.json` files produces identical 3-tier repository and organization item attribution as in-memory pipeline execution.
- **SC-005**: 100% of existing and new unit/integration tests across `@ghec/contracts`, `@ghec/migration`, and `apps/cli` pass offline via `npm run check` with zero plaintext secret or token leaks.

## Assumptions

- Enriched metadata fields on `OperationExecutionResultSchema`, `ModuleExecutionResultSchema`, `OrgModuleResultSummarySchema`, and `RepositoryMigrationRecordSchema` are optional or defaulted so existing test fixtures and historical `migration-execution.json` files remain 100% backward compatible.
- When `OperationExecutionResult` does not explicitly provide `resourceName` or `resourceType` (such as in legacy fixtures), the generator extracts human-readable item identifiers from `operationId` and `verificationReport` discrepancies.
- For repositories that completed `gei-repo` transfer without granular sub-operation records in `ModuleExecutionResult.results`, the generator synthesizes the `gei-repo` module summary row and Tier 3 page from the repository transfer record so the core Git transfer is always represented in the repository's **Migrated Items Summary** table.
