---
id: TASK-074
title: 'Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig7 & Full Reporting Audit'
status: in-progress
owner: antigravity
created_at: 2026-10-18
dependencies: [TASK-071, TASK-072, TASK-073]
packages_affected:
  ['@ghec/cli', '@ghec/migration', '@ghec/discovery', '@ghec/contracts']
---

# TASK-074: Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig7 & Full Reporting Audit

## 1. Objective & Context

Execute a complete, live end-to-end migration from `demogxp` to `demogxp-mig7` (`target_type: ghec`) strictly following the operator workflow in `docs/guides/consultant-operators-manual.md` and `docs/guides/generating-migration-scopes.md` using **only GitHub Actions workflows** (`generate-scope.yml` and `migration-e2e-autonomous.yml`).

Run in a closed loop: diagnose any workflow, module, strategy resolution, or reporting discrepancies; fix the underlying code with deterministic unit tests; pass `npm run check`; ship to `main`; and re-run until:

- All non-archived repositories in `demogxp` (`24/24`) and all **34/34 modules** (15 organization + 19 repository) are migrated and verified with **0 failed operations** and **0 verification discrepancies**.
- The published `demogxp-mig7/migration-audit-results` repository, workflow artifacts, and `$GITHUB_STEP_SUMMARY` are 100% accurate across Tier 1 (`README.md`, `POST-CARE-CHECKLIST.md`, `exports/**/*.csv`), Tier 2 (`organization/*.md`, `repositories/<repo>/<module>.md`), Tier 3 (`success/*.md`, `failure/*.md`), `manifest.json`, and `evidence/*` (including `evidence/README.md`).

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-071`, `TASK-072`, `TASK-073`)
- [x] Target organization `demogxp-mig7` accessible and verified clean-slate ready for migration from `demogxp`

## 3. Scope of Changes

Expected files or directories to inspect/modify if issues arise during live execution or reporting audit:

- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `.github/workflows/migration-execute-wave.yml`
- `apps/cli/src/commands/*`
- `packages/migration/src/orchestrator/*`
- `packages/migration/src/modules/*`
- `packages/migration/src/reporting/*`

## 4. Implementation Checklist

- [ ] **Phase 1: Prepare & Trigger Scope Generation via GitHub Actions (`generate-scope.yml`)**
  - Ensure all pending code changes (`TASK-072`, `TASK-073`) are verified via `npm run check`, committed, and merged to `main`.
  - Verify `demogxp-mig7` target organization is in a clean state.
  - Trigger `generate-scope.yml` for `source_org="demogxp"` and `target_org="demogxp-mig7"` (`target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_org_resources="true"`, `org_items_mode="all"`).
  - Watch the workflow run, inspect `$GITHUB_STEP_SUMMARY`, and download/verify the `migration-scopes` artifact (24 repositories, all 34 modules covered).
- [ ] **Phase 2: Execute Live Migration via GitHub Actions (`migration-e2e-autonomous.yml`)**
  - Trigger `migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`.
  - Monitor slicer, parallel cohort matrix workers, post-cohort reconciliation, verification, and self-healing remediation.
- [ ] **Phase 3: Closed-Loop Code Fix, Ship & Retry**
  - Diagnose any module or workflow errors, fix in codebase, add unit tests, pass `npm run check`, ship to `main`, and re-run until 0 failed operations, 0 discrepancies, and 34/34 verified modules across 24/24 repositories.
- [ ] **Phase 4: Deep Audit & Remediation of Migration Reporting**
  - Download final workflow artifacts and clone `demogxp-mig7/migration-audit-results`.
  - Audit `README.md`, `$GITHUB_STEP_SUMMARY`, `POST-CARE-CHECKLIST.md`, all CSV exports in `exports/**/*.csv`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, `manifest.json`, and `evidence/*` (`evidence/README.md` + `evidence/*.json`).
  - Fix any reporting mismatches, broken links, or formatting bugs, ship to `main`, and re-verify in GitHub Actions.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

_(To be populated upon completion)_
