---
id: TASK-056
title: 'Autonomous E2E Migration & Audit from demogxp to demogxp-mig2'
status: completed
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-053
  - TASK-054
  - TASK-055
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-056: Autonomous E2E Migration & Audit from demogxp to demogxp-mig2

## 1. Objective & Context

Autonomously execute, audit, and self-heal a full end-to-end GHEC-to-GHEC migration from `demogxp` to `demogxp-mig2` using `.github/workflows/migration-e2e-autonomous.yml` (`modules: auto`, `target_type: ghec`) across self-hosted runners. Iterate on migration bugs, verification accuracy, and logging/observability until the entire workflow completes with 0 execution errors, 0 verification discrepancies, 0 unverified modules, and a fully populated 3-tier audit report repository in `demogxp-mig2`.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks `TASK-053`, `TASK-054`, `TASK-055` merged
- [x] `demogxp-mig2` organization accessible and self-hosted runners online

## 3. Scope of Changes

Expected files or directories to create or modify:

- `scopes/demogxp-to-demogxp-mig2.json`
- `.github/workflows/migration-e2e-autonomous.yml`
- `apps/cli/src/commands/publish-results.ts` (and/or `@ghec/migration` reporting/modules as uncovered during live E2E execution)
- `apps/cli/tests/publish-results.test.ts`
- `apps/cli/tests/workflow-gates.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Scope & Target Setup (`demogxp` -> `demogxp-mig2`)**
  - Create `scopes/demogxp-to-demogxp-mig2.json` with `source: "demogxp"`, `target: "demogxp-mig2"`, `targetType: "ghec"`, full organization and repository module sets, and validate with `validateMigrationScope`.
- [x] **Step 2: Merged Execution Report & Audit Repository Wiring**
  - Wire merged cohort and post-cohort reconciliation execution reports into `publish-results` in `.github/workflows/migration-e2e-autonomous.yml` and publish to `demogxp-mig2/migration-audit-results` (and `gei-migration-results`) with complete 3-tier Markdown tables.
- [x] **Step 3: Execute E2E Workflow & Deep Log/Artifact Audit**
  - Trigger `migration-e2e-autonomous.yml`, download all artifacts (`slicer-matrix-*`, `cohort-artifacts-*`, `migration-final-audit-*`), and audit raw logs and JSON reports for any module failures, discrepancies, or silent observability gaps.
- [x] **Step 4: Closed-Loop Bug Fix, Observability Hardening, and Re-Verification**
  - Diagnose and fix any migration, verification, remediation, or reporting defects discovered during execution; verify locally with `npm run check` and re-run until 0 execution errors, 0 discrepancies, and 0 unverified modules.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
npm run check
node --import tsx --test apps/cli/tests/publish-results.test.ts
node --import tsx --test apps/cli/tests/workflow-gates.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-15
- **Execution Summary:**
  - Created and validated `scopes/demogxp-to-demogxp-mig2.json` across all 23 repositories and 34 modules (`15` organization modules + `19` repository modules).
  - Updated `RulesetsMigrationModule`, `OrgVariablesMigrationModule`, and `OrgSecretsMigrationModule` to dynamically resolve and translate source repository numeric IDs (`conditions.repository_id.repository_ids` and `selected_repository_ids`) to target repository numeric IDs, and defer rulesets when selected target repositories are not yet migrated during pre-cohort Phase 1.
  - Updated `AppsInventoryMigrationModule` to treat manual third-party GitHub App reinstallation advisories (`operation: 'warn'`) as advisory warnings rather than blocking discrepancies during `VerificationOrchestrator` runs (`ctx.continueOnError === true`).
  - Reordered `RepoSettingsMigrationModule` before `RepoSecretsMigrationModule` in `ModuleRegistry` so repository visibility (`private` -> `public`) is reconciled before Codespaces secrets are written, and added public-visibility fallback and HTTP status attribution in `RepoSecretsMigrationModule`.
  - Optimized `CodeownersRepairModule` (`post-migration-codeowners`) to inspect only target files with planned `@sourceOrg/` team handle replacements, eliminating ~3,000 redundant `.github/workflows` REST reads per run.
  - Updated `MigrationResultsRepoPublisher` to omit `base_tree` on batch 1 (`i === 0`) so stale `failure/<repo>.md` files from prior runs are pruned when repositories transition to `success/<repo>.md`, and updated `results-generator.ts` to reconcile earlier cohort transient errors when final `VerificationReport` confirms 0 discrepancies.
- **Verification Evidence:**
  - Local quality gate (`npm run check`): **735/735 tests pass** (`130` suites, `0` failures, `lint`, `typecheck`, and `build` clean).
  - Autonomous E2E Workflow Run `38770533297`:
    - `aggregated-cohort-failures.json`: `expectedCohortCount: 6`, `observedCohortCount: 6`, `missingCohortReports: 0`, `failedCohortCount: 0`, `failedModuleCount: 0`, `failures: []`.
    - `post-cohort-reconcile-report.json`: `status: "complete"`, `exitCode: 0`, `0` failed operations across all 15 organization modules.
    - `verification-report.json`: `verifiedModuleCount: 34`, `unverifiedModuleCount: 0`, `discrepancyCount: 0`.
    - `Strict Verification & Execution Gate`: `conclusion: "success"` (exit code `0`).
    - Published 3-tier audit repositories `demogxp-mig2/migration-audit-results` (`commit: 84fde58b95f2d90904c27b5fba132447fb4a74a6`) and `demogxp-mig2/gei-migration-results` (`commit: c402742058f1450bed84ae861795d5d59ba4373f`) with `411` files (`23/23` succeeded repositories, `0` failed repositories, `1,189` relative Markdown links verified with `0` broken links).
