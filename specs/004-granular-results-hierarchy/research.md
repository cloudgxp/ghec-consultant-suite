# Research & Technical Decisions: 3-Tier Navigable Audit Results Hierarchy

**Feature**: `004-granular-results-hierarchy`
**Created**: 2026-10-14
**Status**: Completed (All Unknowns Resolved)

---

## 1. Enriching `ModuleExecutionResult` and `OperationExecutionResult` Without Breaking Backward Compatibility

### Decision

Extend `OperationExecutionResultSchema` and `ModuleExecutionResultSchema` in `packages/contracts/src/results/execution-result.ts` with optional metadata fields populated from `ModulePlan` and `PlannedOperation` during `MigrationOrchestrator.run()` and `RepositoryMigrationPipeline.execute()`:

- `OperationExecutionResultSchema`:
  - `resourceType?: string` (`NonEmptyStringSchema.optional()`)
  - `resourceName?: string` (`NonEmptyStringSchema.optional()`)
  - `operationType?: PlannedOperationType` (`PlannedOperationTypeSchema.optional()`)
  - `reason?: string` (`z.string().max(2048).optional()`)
  - `targetIdentifier?: string` (`NonEmptyStringSchema.optional()`)
- `ModuleExecutionResultSchema`:
  - `targetIdentifier?: string` (`NonEmptyStringSchema.optional()`)
  - `scopeLevel?: 'organization' | 'repository'` (`MigrationScopeLevelSchema.optional()`)

### Rationale

Individual migration modules (`packages/migration/src/modules/**`) currently return `ModuleExecutionResult` from `apply(ctx, plan)` containing `results: OperationExecutionResult[]` where each item only has `{ operationId, status, httpStatus, error, completedAt }`. Meanwhile, the `ModulePlan` passed into `apply(ctx, plan)` already contains the rich human-readable metadata (`targetIdentifier`, `scopeLevel`, and `operations[]` with `id`, `resourceType`, `resourceName`, `operation`, `reason`).

By enriching the returned `ModuleExecutionResult` inside a shared helper in `@ghec/migration` (invoked by both `MigrationOrchestrator` and `RepositoryMigrationPipeline` immediately after `mod.apply(ctx, effectiveModulePlan)`), all 32 modules automatically produce self-contained enriched execution records without requiring boilerplate edits across 32 module files. Making these fields `.optional()` on the Zod schemas guarantees 100% backward compatibility with existing unit test fixtures and historical `migration-execution.json` artifacts.

### Alternatives Considered

- **Modifying all 32 migration modules individually to populate `resourceName` / `resourceType` in `apply()`**: Rejected as primary mechanism because it duplicates plan metadata mapping in 32 places; centralized enrichment in `MigrationOrchestrator` and `RepositoryMigrationPipeline` (plus fallback parsing from `operationId` in `generateMigrationResults`) is cleaner and DRY.
- **Requiring `migration-plan.json` to always be passed to `publish-results`**: Rejected because `MigrationOrchestrator` dynamically re-plans modules after `gei-repo` imports a repository (`freshlyMigratedTargets`), meaning the runtime `effectiveModulePlan` executed during `migrate` is more authoritative than a pre-migration static plan file.

---

## 2. Full Organization Module Recognition & Dual-Scoped `rulesets` Attribution

### Decision

Replace the hardcoded 6-item `ORG_LEVEL_MODULE_IDS` set in `packages/migration/src/reporting/results-generator.ts` with dynamic classification based on:

1. Explicit `modResult.scopeLevel === 'organization'` (when present on enriched `ModuleExecutionResult`), OR
2. Membership in `ALL_ORGANIZATION_MODULES` (`org-variables`, `org-secrets`, `org-custom-properties`, `teams`, `post-migration-mannequins`, `packages`, `custom-roles`, `org-settings`, `actions-policies`, `actions-runners`, `ip-allow-lists`, `apps-inventory`, `projects-v2`) plus legacy aliases (`custom-properties`, `rulesets-org`, `org-custom-roles`, `org-projects-v2`, `org-*`), OR
3. For dual-scoped modules such as `rulesets`: classifying as `organization` when `scopeLevel === 'organization'` or when `targetIdentifier` does not contain `'/'` and matches `sourceOrg` / `targetOrg` (and does not match a scoped repository name).

### Rationale

The suite supports 13+ organization-level modules in `ALL_ORGANIZATION_MODULES` plus organization-level `rulesets`. Relying on a 6-element hardcoded `Set` caused modules like `custom-roles`, `actions-policies`, `actions-runners`, `ip-allow-lists`, `apps-inventory`, `packages`, and `projects-v2` to be silently dropped from `manifest.summary.orgModulesSummary` and `README.md`.

### Alternatives Considered

- **Hardcoding a larger static list only**: Insufficient on its own for dual-scoped `rulesets`; combining `scopeLevel`, `targetIdentifier` inspection, and `ALL_ORGANIZATION_MODULES` handles both enriched and legacy execution reports.

---

## 3. Correlating Per-Repository Module Execution Results from `migration-execution.json`

### Decision

Update `generateMigrationResults` in `packages/migration/src/reporting/results-generator.ts` to extract and group repository-level `ModuleExecutionResult` entries by repository across all input modes:

1. When `pipelineResults` are provided in memory, group `pipeResult.moduleResults` (and synthesize `gei-repo` from `pipeResult.geiResult` / `completedStages` if not already in `moduleResults`).
2. When `executionReport` (`migration-execution.json`) is provided, attribute each `ModuleExecutionResult` to its repository using:
   - `modResult.targetIdentifier` (stripping `<org>/` prefix if formatted as `<org>/<repo>`, or mapping `sourceRepo` → `targetRepo` via `scope.repositories`),
   - Or operation-level `op.targetIdentifier` / `op.operationId` prefix/token matching against known repositories in `scope.repositories` or `verificationReport`.
3. When `scope` is absent and only `executionReport` is provided, infer the list of migrated repositories directly from the repository-scoped `ModuleExecutionResult` target identifiers so `publish-results --execution-report ... --target-org ...` still generates all 3 tiers.

### Rationale

When `ghec-consultant-cli migrate` runs via `MigrationOrchestrator.run()`, it populates `report.results` as a flat array of `ModuleExecutionResult` objects (one per `(moduleId, targetIdentifier)` pair). Previously, `generateMigrationResults` only inspected `executionReport.results` for org modules and ignored repo-level `ModuleExecutionResult` entries unless `pipelineResults` was passed. Grouping repo-level `ModuleExecutionResult` entries by target repository unlocks full Tier 2 and Tier 3 reporting from `migration-execution.json`.

### Alternatives Considered

- **Changing `MigrationExecutionReport.results` from an array to a nested map**: Rejected because it would break the existing `MigrationExecutionReport` contract consumed by `json-summary`, `step-summary`, and existing CLI tests.

---

## 4. 3-Tier Relative Path Layout & Bidirectional Breadcrumb Navigation

### Decision

Standardize the virtual file tree produced by `generateMigrationResults` (`GeneratedResults.files`) as follows:

- **Tier 1 — Executive Overview (`README.md`)**:
  - Links to Tier 2 Organization Module pages: `organization/<moduleId>.md`
  - Links to Tier 2 Repository Overview pages: `success/<targetRepo>.md` or `failure/<targetRepo>.md`
- **Tier 2 — Organization Module Detail (`organization/<moduleId>.md`)**:
  - Breadcrumb to Tier 1: `[← Back to Overview](../README.md)`
- **Tier 2 — Repository Overview (`success/<targetRepo>.md` or `failure/<targetRepo>.md`)**:
  - Breadcrumb to Tier 1: `[← Back to Overview](../README.md)`
  - **Migrated Items Summary** table links to Tier 3: `[View Items](../repositories/<targetRepo>/<moduleId>.md)`
- **Tier 3 — Repository Module Granular Detail (`repositories/<targetRepo>/<moduleId>.md`)**:
  - Breadcrumb to Tier 2 & Tier 1: `[← Back to <targetRepo>](../../success/<targetRepo>.md)` (or `../../failure/<targetRepo>.md`) and `[Overview](../../README.md)`

### Rationale

Because `success/<repo>.md` and `failure/<repo>.md` sit 1 directory level below root, relative links from Tier 2 to Tier 1 use `../README.md` and relative links from Tier 2 to Tier 3 use `../repositories/<repo>/<module>.md`. Because `repositories/<repo>/<module>.md` sits 2 directory levels below root, relative links back to Tier 2 use `../../success/<repo>.md` (or `../../failure/<repo>.md`) and `../../README.md`. This guarantees native navigation inside GitHub's web UI when viewing `gei-migration-results`.

---

## 5. Zero-Exposure Secret Boundary (DEC-004) & GFM Table Sanitization

### Decision

1. Any item belonging to a secret module (`org-secrets`, `repo-secrets`) or having `resourceType` containing `secret` must format its display name or notes with a `[SEALED]` badge and never render secret payloads.
2. Every cell rendered in Tier 1, Tier 2, and Tier 3 Markdown tables must pass through a dedicated `escapeMarkdownTableCell(sanitizeDiagnostics(text))` helper that:
   - Scrubs embedded URL credentials (`https://***@github.com`), PATs (`ghp_*`, `github_pat_*`), and `Authorization` headers via `sanitizeDiagnostics`.
   - Replaces pipe characters (`|`) with `\|` and collapses newlines (`\r?\n`) into spaces (` `) so GitHub Flavored Markdown tables never break structure.
