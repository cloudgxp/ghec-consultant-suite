# Implementation Plan: 3-Tier Navigable Audit Results Hierarchy & Granular Item Reporting

**Branch**: `004-granular-results-hierarchy` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/004-granular-results-hierarchy/spec.md](./spec.md)

---

## Summary

Upgrade the `gei-migration-results` audit repository generator across `@ghec/contracts`, `@ghec/migration`, and `apps/cli` from a flat 2-level summary into a self-contained **3-tier navigable Markdown drill-down hierarchy**:

1. **Tier 1 (`README.md`)**: Executive summary metrics, an **Organization-Level Modules** table recognizing all organization modules in `ALL_ORGANIZATION_MODULES` (plus org-scoped `rulesets`) with `[View Details](organization/<module>.md)` links, and a **Repositories Index** table showing migrated category/item counts and links to `success/<repo>.md` or `failure/<repo>.md`.
2. **Tier 2 — Organization Module Detail (`organization/<module>.md`)**: Breadcrumb navigation (`[← Back to Overview](../README.md)`), module execution metrics, and a **Granular Organization Items** table listing every individual organization item (teams, org variables, sealed org secrets, custom properties, custom roles, Projects v2, runners, policies, mannequins, org rulesets) with operation type, execution status, verification status, and sanitized diagnostics.
3. **Tier 2 — Repository Overview (`success/<repo>.md` & `failure/<repo>.md`)**: Breadcrumb navigation (`[← Back to Overview](../README.md)`), repository transfer summary, failure diagnostics/remediation commands, and a **Migrated Items Summary** table listing every repository module executed or verified for that repository with item counts and `[View Items](../repositories/<repo>/<module>.md)` links.
4. **Tier 3 — Repository Module Granular Detail (`repositories/<repo>/<module>.md`)**: Breadcrumb navigation (`[← Back to <repo>](../../success/<repo>.md)` or `../../failure/<repo>.md` and `[Overview](../../README.md)`), module summary metrics for that repository, and a **Granular Repository Items** table detailing every individual item (variables, `[SEALED]` secrets, environments, rulesets, branch protections, webhooks, releases, issues, PRs, LFS, collaborators, deploy keys, autolinks, discussions, custom properties).

To make `migration-execution.json` self-contained for standalone `publish-results` runs, `OperationExecutionResultSchema` and `ModuleExecutionResultSchema` in `@ghec/contracts` are enriched with optional backward-compatible metadata fields (`targetIdentifier`, `scopeLevel`, `resourceType`, `resourceName`, `operationType`, `reason`) populated automatically by `MigrationOrchestrator` and `RepositoryMigrationPipeline` from `ModulePlan` / `PlannedOperation`.

---

## Technical Context

- **Language/Version**: TypeScript 5.x / 6.x, Node.js `>=22.13.0` (pure ESM `"type": "module"`).
- **Primary Dependencies**: `@ghec/contracts` (Zod schemas), `@ghec/github-client` (`sanitizeDiagnostics`), `@ghec/migration` (`MigrationOrchestrator`, `RepositoryMigrationPipeline`, `generateMigrationResults`, `MigrationResultsRepoPublisher`), `apps/cli` (`publish-results`, `migrate`).
- **Storage**: Local filesystem output (`writeResultsToDirectory`) and atomic Git Data API tree commits (`MigrationResultsRepoPublisher.publishAtomicCommit`) to `<targetOrg>/gei-migration-results`.
- **Testing**: Node.js native test runner (`node:test`) and assertion library (`node:assert/strict`) with 100% offline synthetic fixtures (`--test-concurrency=8`).
- **Target Platform**: Node.js CLI & GitHub Actions runners (`ubuntu-latest`, `self-hosted`).
- **Project Type**: Monorepo domain packages (`packages/contracts`, `packages/migration`) and CLI application (`apps/cli`).
- **Performance Goals**: In-memory 3-tier Markdown generation for 50+ repositories and 32 modules in `<250ms`; zero broken relative links across all generated files.
- **Constraints**: 100% backward compatibility with existing `ModuleExecutionResult` and `MigrationResultsManifest` test fixtures; Zero-Exposure Secret Boundary (`DEC-004`); strict TypeScript (no `any`, explicit return types, `node:` protocol imports, `.js` relative import extensions).
- **Scale/Scope**: All 32 migration modules (13+ organization modules and 19+ repository modules) across multi-repository migration waves.

---

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                                                 | Requirement                                                                                                                                              | Audit & Design Status                                                                                                                                                                             | Gate Evaluation |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------: |
| **Principle I: Zero-Exposure Secret Boundary (DEC-004)**                  | Plaintext secrets are write-only. Target secrets default to libsodium sealed empty strings (`""`) or placeholders. No plaintext tokens logged/persisted. | Secret items in `org-secrets`, `repo-secrets`, and environment secrets strictly render `[SEALED]` placeholders. All URLs, errors, and diffs pass through `sanitizeDiagnostics`.                   |    **PASS**     |
| **Principle II: 4-Stage Migration Lifecycle & Topological DAG Execution** | Modules implement 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`); execution respects topological dependency order.                            | Orchestrator and pipeline enrich `apply` execution results directly from `plan` operations without altering module lifecycle signatures or DAG order.                                             |    **PASS**     |
| **Principle III: Single Source of Truth & Strict Schema Validation**      | All cross-package data shapes originate from `@ghec/contracts` with Zod schemas and `schemaVersion: 1.0.0`.                                              | `OperationExecutionResultSchema`, `ModuleExecutionResultSchema`, `OrgModuleResultSummarySchema`, `RepoModuleResultSummarySchema`, and `MigrationResultsManifestSchema` live in `@ghec/contracts`. |    **PASS**     |
| **Principle IV: Offline Test Determinism & Synthetic Test Fixtures**      | Unit/integration tests run 100% offline via `node:test` and `node:assert/strict` with synthetic fixtures.                                                | All contract, orchestrator, generator, formatter, and CLI tests run 100% offline using synthetic fixtures and `fs.mkdtemp` (`0700`) cleanup.                                                      |    **PASS**     |
| **Principle V: Strict ESM & TypeScript Standards**                        | Prohibition of `any`, explicit return types, `node:` protocol prefix, and mandatory `.js` extensions.                                                    | All new and modified TypeScript files enforce strict typing, `readonly` properties, `node:` built-in imports, and `.js` extensions.                                                               |    **PASS**     |

---

## Project Structure

### Documentation & Design (this feature)

```text
specs/004-granular-results-hierarchy/
├── spec.md                                            # Feature specification (User stories P1-P2, FR-001..FR-016, SC-001..SC-005)
├── plan.md                                            # Implementation plan (this file)
├── research.md                                        # Phase 0 research & design decisions
├── data-model.md                                      # Phase 1 entity schemas & 3-tier Mermaid topology
├── quickstart.md                                      # Phase 1 runnable validation & test guide
├── contracts/                                         # Phase 1 JSON Schema contracts
│   ├── execution-result-enriched.contract.json
│   └── results-repo-manifest-v1.contract.json
└── checklists/
    └── requirements.md                                # Specification quality checklist (16/16 passing)
```

### Source Code (repository root)

```text
packages/
├── contracts/
│   ├── src/
│   │   ├── results/
│   │   │   ├── execution-result.ts                    # Enrich OperationExecutionResultSchema & ModuleExecutionResultSchema
│   │   │   └── results-repo-manifest.ts               # Add RepoModuleResultSummarySchema & enrich OrgModuleResultSummarySchema / RepositoryMigrationRecordSchema
│   │   └── index.ts                                   # Export RepoModuleResultSummarySchema & RepoModuleResultSummary type
│   └── tests/
│       └── results-repo-manifest.test.ts              # Unit tests for enriched execution results & 3-tier manifest validation
└── migration/
    ├── src/
    │   ├── orchestrator/
    │   │   ├── execution-enricher.ts                  # Helper to enrich ModuleExecutionResult from ModulePlan / PlannedOperation
    │   │   ├── migration-orchestrator.ts              # Enrich ModuleExecutionResult on apply, skip, and error paths
    │   │   └── pipeline.ts                            # Enrich ModuleExecutionResult & record gei-repo module result in RepositoryMigrationPipeline
    │   └── reporting/
    │       ├── results-generator.ts                   # Full org catalog recognition, per-repo module attribution, 3-tier file map generation
    │       └── results-markdown-formatter.ts          # Formatters for Tier 1 README, Tier 2 Org Module & Repo Overviews, Tier 3 Repo Module Items
    └── tests/
        └── reporting/
            ├── results-generator.test.ts              # Unit tests for 3-tier generation, link integrity, standalone executionReport correlation, DEC-004
            └── results-repo-publisher.test.ts         # Unit tests verifying nested 3-tier tree blob commits
apps/
└── cli/
    ├── src/
    │   └── commands/
    │       ├── publish-results.ts                     # Support optional --plan flag & full 3-tier results generation
    │       └── migrate.ts                             # Pass plan & verification context to generateMigrationResults when --publish-results is active
    └── tests/
        └── publish-results.test.ts                    # Integration tests for 3-tier CLI output & standalone execution-report attribution
```

**Structure Decision**: Schema enrichments reside in `packages/contracts/src/results/`, execution plan-to-result enrichment resides in `packages/migration/src/orchestrator/`, and 3-tier aggregation and Markdown formatting reside in `packages/migration/src/reporting/`. `apps/cli` consumes these exports directly without duplicating formatting or attribution logic.

---

## Complexity Tracking

> No constitutional violations or unjustified complexity introduced. All 5 core principles pass without exception.
