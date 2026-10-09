---
id: TASK-033
title: 'migration-results-markdown-and-manifest-generator'
status: completed
owner: agent
created_at: 2026-10-08
dependencies:
  - TASK-032
packages_affected:
  - '@ghec/migration'
---

# TASK-033: Migration Results Markdown and Manifest Generator

## 1. Objective & Context

When migrating organizations to GHEC-EMU, migration stakeholders need an immediate, transparent, and navigable overview of migration outcomes. Emulating `gh gei migrate-org`'s audit repository structure, this task implements the core generation engine in `@ghec/migration` that compiles migration execution reports, verification reports, and remediation plans into a complete directory structure:

- A root `README.md` with executive metrics, organization-level modules breakdown, and repository outcome tables.
- A `success/<repo>.md` document for every repository that migrated cleanly and verified with 0 discrepancies.
- A `failure/<repo>.md` document for any repository that failed transfer, metadata reconciliation, or verification, complete with error diagnostics, log excerpts, and actionable remediation steps.
- A machine-readable `manifest.json` conforming to `@ghec/contracts` (`MigrationResultsManifest`).

This generator supports both in-memory representation (for streaming/publishing via GitHub API) and local file-system persistence (for local audits and CI artifact archiving).

## 2. Dependencies & Prerequisites

- [x] Upstream `TASK-032` completed: `@ghec/contracts` manifest and record schemas available.
- [x] Conforms to Zero-Exposure Secret Boundary (DEC-004) and diagnostic sanitization standards.

## 3. Scope of Changes

- `packages/migration/src/reporting/results-markdown-formatter.ts`: Formatter functions generating GFM-compliant markdown for `README.md`, `success/<repo>.md`, and `failure/<repo>.md`.
- `packages/migration/src/reporting/results-generator.ts`: Orchestrating generator compiling `MigrationExecutionReport`, `VerificationReport`, and `RemediationPlan` into a `MigrationResultsManifest` and map of in-memory files.
- `packages/migration/src/reporting/index.ts`: Re-export the generator and formatter utilities.
- `packages/migration/tests/reporting/results-generator.test.ts`: Offline deterministic unit tests validating markdown formatting and directory outputs.

## 4. Implementation Checklist

- [x] **Step 1: Results Markdown Formatter Implementation**
  - Implement `formatResultsReadmeMarkdown(manifest: MigrationResultsManifest)`:
    - Executive header: Run ID, Source Org $\rightarrow$ Target Org, Mode (Dry-Run vs Live), Timestamp, Total Duration.
    - KPI Metrics table: Total Repositories, Succeeded Repositories, Failed Repositories, Success Rate Percentage.
    - Org-level modules summary table: Teams, Org Variables, Org Secrets, Rulesets, Webhooks, Custom Properties, Mannequins.
    - Repositories Index table: Repo Name, Status badge (`✅ Succeeded` vs `❌ Failed`), Duration, Discrepancies, and relative links (`[View Log](success/repo.md)` or `[View Failure Log](failure/repo.md)`).
    - Unresolved Failures table with immediate blocker diagnostics.
    - Next Steps & Runbook section (mannequin reclamation, post-cutover webhook enablement).
  - Implement `formatSuccessRepoMarkdown(record: RepositoryMigrationRecord, details: RepositorySuccessDetails)`:
    - Repository attributes: Name, Visibility, Default Branch, Sizing metrics.
    - Stage execution breakdown table (Preflight, GEI Transfer, LFS, Releases, Variables, Secrets, Rulesets, Webhooks, Environments).
    - Verification checklist confirming 0 discrepancies and target state parity.
    - GEI log summary and notices.
  - Implement `formatFailureRepoMarkdown(record: RepositoryMigrationRecord, details: RepositoryFailureDetails)`:
    - High-visibility warning alert (`> [!CAUTION]`).
    - Failure stage & operation identifier.
    - Sanitized error message and diagnostics.
    - Discrepancy comparison table (expected vs actual state).
    - Captured error logs (excerpts from GEI or CLI execution).
    - Actionable remediation advice with ready-to-run CLI commands.

- [x] **Step 2: Generator & File Engine Implementation**
  - Implement `generateMigrationResults(options: GenerateResultsOptions)`:
    - Correlates execution results, verification results, and remediation actions per repository.
    - Slices repositories into `succeeded` vs `failed` collections according to strict invariants (any unhandled failure or verification discrepancy categorizes a repo into `failure`).
    - Produces validated `MigrationResultsManifest` validated against `@ghec/contracts`.
    - Returns in-memory file dictionary: `{ 'README.md': string, 'manifest.json': string, 'success/<repo>.md': string, 'failure/<repo>.md': string }`.
  - Implement `writeResultsToDirectory(results: GeneratedResults, outputDir: string)`:
    - Safely creates `success/` and `failure/` subdirectories.
    - Writes all files with deterministic utf-8 encoding.

- [x] **Step 3: Deterministic Offline Tests**
  - Author `packages/migration/tests/reporting/results-generator.test.ts` using `node:test` and synthetic fixtures.
  - Test scenario with all successful repositories.
  - Test scenario with mixed successful and failed repositories.
  - Verify markdown links and tables are correctly rendered without formatting breaks.
  - Verify directory writer creates expected hierarchy in temporary directory (`fs.mkdtempSync`).

- [x] **Step 4: Quality Gate Verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Monorepo verification gate
npm run check

# Targeted reporting test
node --import tsx --test packages/migration/tests/reporting/results-generator.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Implemented `formatResultsReadmeMarkdown`, `formatSuccessRepoMarkdown`, and `formatFailureRepoMarkdown` in `packages/migration/src/reporting/results-markdown-formatter.ts` with diagnostic sanitization, GFM alert callouts, and tabular summaries.
  - Created `generateMigrationResults` and `writeResultsToDirectory` in `packages/migration/src/reporting/results-generator.ts` with full contract validation against `@ghec/contracts`.
  - Re-exported all formatters, options, and generators in `packages/migration/src/reporting/index.ts`.
  - Authored comprehensive deterministic offline unit tests in `packages/migration/tests/reporting/results-generator.test.ts`.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/reporting/results-generator.test.ts`: 6/6 tests passed.
  - `npm test`: 531 tests passed cleanly across packages.
  - `npm run lint && npm run typecheck`: Passed cleanly.
