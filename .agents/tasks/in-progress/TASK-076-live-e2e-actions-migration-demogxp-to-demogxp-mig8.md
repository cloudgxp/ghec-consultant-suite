---
id: TASK-076
title: 'Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig8 (All 35 Repos Including Archived) & Full Reporting Audit'
status: in-progress
owner: antigravity
created_at: 2026-10-18
dependencies: [TASK-074, TASK-075]
packages_affected:
  [
    '@ghec/cli',
    '@ghec/migration',
    '@ghec/discovery',
    '@ghec/contracts',
    '@ghec/github-client',
    '@ghec/dashboard',
  ]
---

# TASK-076: Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig8 (All 35 Repos Including Archived) & Full Reporting Audit

## 1. Objective & Context

Execute a complete, live end-to-end migration from `demogxp` to `demogxp-mig8` (`target_type: ghec`) using only GitHub Actions workflows (`generate-scope.yml` and `migration-e2e-autonomous.yml`), including **all 35 repositories** (the 24 active repositories plus all 11 archived repositories: `WebKit`, `linux`, `llvm-project`, `nixpkgs`, `next.js`, `TypeScript`, `grafana`, `node`, `kubernetes`, `rust`, `runner`), **all organization items**, and **all 34 modules** (15 organization + 19 repository).

Ensure archived repositories are unarchived/deferred during migration so downstream write modules do not fail with `403 Repository was archived so is read-only`, and restored to `archived: true` as the final step and verified cleanly. Also add CSV reporting support (`exports/archived-repositories-skipped.csv`) when archived repositories are excluded from scope (`include_archived: false`) and reflect archived status in repository reports/CSV exports when `include_archived: true`.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-074`, `TASK-075`)
- [ ] Target organization `demogxp-mig8` accessible and verified ready for migration from `demogxp`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `.github/workflows/migration-execute-wave.yml`
- `apps/cli/src/commands/*`
- `packages/migration/src/orchestrator/*`
- `packages/migration/src/modules/repo-settings/*`
- `packages/migration/src/strategies/*`
- `packages/migration/src/reporting/*`
- `packages/migration/tests/**/*`

## 4. Implementation Checklist

- [ ] **Phase 1: Pre-Flight Code Audit & Enhancements (Archived Lifecycle, CSV Reporting & Pages)**
  - Ensure archived repository lifecycle defers `archived: true` or unarchives target repositories until all downstream repository modules complete, then restores `archived: true` at the end and verifies cleanly.
  - Check timeout, disk space, and `mirror-push` (`fast-snapshot`) handling for massive formerly-archived repos (`WebKit`, `linux`, `llvm-project`, `nixpkgs`, `next.js`, `TypeScript`, etc.).
  - Add CSV reporting support (`exports/archived-repositories-skipped.csv`) when `include_archived: false` skips archived source repos, and reflect archived status in repository reports/CSV exports when `include_archived: true`.
  - Add deterministic unit tests, pass `npm run check`, and merge to `main` (including `TASK-075` Private GitHub Pages dashboard changes).
- [ ] **Phase 2: Generate Scope via GitHub Actions (`generate-scope.yml`)**
  - Trigger `generate-scope.yml` with `source_org="demogxp"`, `target_org="demogxp-mig8"`, `target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_archived="true"`, `include_org_resources="true"`, `org_items_mode="all"`.
  - Download and verify `generated-scopes/demogxp-to-demogxp-mig8-all.json` has all **35/35** repositories, `modules: ["auto"]`, and `orgItemsMode: "all"`.
- [ ] **Phase 3: Execute Live E2E Migration (`migration-e2e-autonomous.yml`)**
  - Trigger `migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`.
  - Monitor slicer, parallel cohort workers (`cohort-massive-*` and `cohort-standard-*`), post-cohort reconciliation, verification, and self-healing remediation.
  - Fix any discovered execution, verification, or reporting bugs in closed loop with unit tests, pass `npm run check`, push to `main`, and re-run until 100% clean.
- [ ] **Phase 4: Deep Audit of `demogxp-mig8/migration-audit-results`**
  - Download final workflow artifacts and clone `demogxp-mig8/migration-audit-results`.
  - Audit `$GITHUB_STEP_SUMMARY`, `README.md` (`35/35` repos, `34/34` modules, `0` failed operations, `0` discrepancies, Private GitHub Pages link), `POST-CARE-CHECKLIST.md`, `exports/**/*.csv`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, `manifest.json`, and `evidence/*`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

<!--
To be populated upon completion before moving task to completed/:
- Completion Date: YYYY-MM-DD
- Execution Summary: Brief description of changes made
- Verification Evidence: Output from npm run check or targeted test runs
-->
