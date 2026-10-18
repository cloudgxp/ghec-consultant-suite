---
id: TASK-071
title: 'Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig6 & Full Reporting Audit'
status: completed
owner: antigravity
created_at: 2026-10-17
completed_at: 2026-10-18
dependencies: [TASK-068, TASK-069, TASK-070]
packages_affected:
  ['@ghec/cli', '@ghec/migration', '@ghec/discovery', '@ghec/contracts']
---

# TASK-071: Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig6 & Full Reporting Audit

## 1. Objective & Context

Execute a complete, live end-to-end migration from `demogxp` to `demogxp-mig6` (`target_type: ghec`) strictly following the operator workflow in `docs/guides/consultant-operators-manual.md` and `docs/guides/generating-migration-scopes.md` using **only GitHub Actions workflows** (`generate-scope.yml` and `migration-e2e-autonomous.yml`).

Run in a closed loop: diagnose any workflow, module, strategy resolution, or reporting discrepancies; fix the underlying code with deterministic unit tests; pass `npm run check`; commit and push to `main`; and re-run until:

- All non-archived repositories in `demogxp` (`24/24`) and all **34/34 modules** (15 organization + 19 repository) are migrated and verified with **0 failed operations** and **0 verification discrepancies**.
- The published `demogxp-mig6/migration-audit-results` repository, workflow artifacts, and `$GITHUB_STEP_SUMMARY` are 100% accurate across Tier 1 (`README.md`, `POST-CARE-CHECKLIST.md`, `exports/*.csv`), Tier 2 (`organization/*.md`, `repositories/<repo>/<module>.md`), Tier 3 (`success/*.md`, `failure/*.md`), `manifest.json`, and `evidence/*` (including `evidence/README.md`).

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-068`, `TASK-069`, `TASK-070`)
- [x] Target organization `demogxp-mig6` accessible and verified clean-slate ready for migration from `demogxp`

## 3. Scope of Changes

Expected files or directories to inspect/modify if issues arise during live execution or reporting audit:

- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `.github/workflows/migration-execute-wave.yml`
- `.github/workflows/post-migration-cutover.yml`
- `apps/cli/src/commands/*`
- `packages/migration/src/orchestrator/*`
- `packages/migration/src/modules/*`
- `packages/migration/src/reporting/*`

## 4. Implementation Checklist

- [x] **Phase 1: Prepare & Trigger Scope Generation via GitHub Actions (`generate-scope.yml`)**
  - Ensure all pending code changes (including `TASK-070`) are verified via `npm run check`, committed, and pushed to `main`.
  - Verify `demogxp-mig6` target organization is in a clean state.
  - Trigger `generate-scope.yml` for `source_org="demogxp"` and `target_org="demogxp-mig6"` (`target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_org_resources="true"`, `org_items_mode="all"`).
  - Watch the workflow run, inspect `$GITHUB_STEP_SUMMARY`, and download/verify the `migration-scopes` artifact (24 repositories, all 34 modules covered).
- [x] **Phase 2: Execute Live Migration via GitHub Actions (`migration-e2e-autonomous.yml`)**
  - Trigger `migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`.
  - Monitor slicer, parallel cohort matrix workers, post-cohort reconciliation, verification, and self-healing remediation.
- [x] **Phase 3: Closed-Loop Code Fix, Ship & Retry**
  - Diagnose any module or workflow errors, fix in codebase, add unit tests, pass `npm run check`, push to `main`, and re-run until 0 failed operations, 0 discrepancies, and 34/34 verified modules across 24/24 repositories.
- [x] **Phase 4: Deep Audit & Remediation of Migration Reporting**
  - Download final workflow artifacts and clone `demogxp-mig6/migration-audit-results`.
  - Audit `README.md`, `$GITHUB_STEP_SUMMARY`, `POST-CARE-CHECKLIST.md`, all CSV exports in `exports/*.csv`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, `manifest.json`, and `evidence/*` (`evidence/README.md` + `evidence/*.json`).
  - Fix any reporting mismatches, broken links, or formatting bugs, push to `main`, and re-verify in GitHub Actions.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- **Completed Date:** `2026-10-18`
- **GitHub Actions Workflow Runs:**
  1. **Phase 1 — Scope Generation (`generate-scope.yml` Run `39094418368`):**
     - Generated `migration-scopes` artifact (`generated-scopes/demogxp-to-demogxp-mig6-all.json`) covering all `24/24` non-archived repositories (`react`, `prometheus`, `nest`, `release-heavy-benchmark`, `dummy-repo-public`, `flask`, `svelte`, `chromium`, `ansible`, `dummy-repo-private-lfs`, `express`, `terraform`, `ghe-actions-migration-framework`, `core`, `ghec-content-filler`, `migration-demo-1361857985-companion`, `migration-demo-1361857985-fork`, `demo`, `juice-shop`, `cpython`, `go`, `django`, `fastify`, `vite`) and `auto` modules (`34/34` modules: 15 organization + 19 repository).
  2. **Closed-Loop Code & Reporting Improvements (PRs #128, #129, #130):**
     - **PR #128 (`a0b81a3`):** Resolved CodeQL regex/URL sanitization alerts in `post-care-generator.ts` and `post-care-generator.test.ts`.
     - **PR #129 (`75a520a`):**
       - Fixed double `1.5x` disk headroom multiplier in `.github/workflows/migration-e2e-autonomous.yml` (`Runner Scratch Disk Headroom Check`) so `verifyScratchDiskHeadroom` applies its `1.5x` safety multiplier once against raw `estimatedGitBytes + totalReleaseAssetBytes`.
       - Preserved `(\d+ bytes)` suffixes in `packages/migration/src/reporting/results-generator.ts` when normalizing pre-apply planning reasons into post-migration outcome notes, restoring exact `Large-Release Asset Streaming` (`11.05 GiB / 11,864,642,357 bytes`) and `Git LFS Object Streaming` (`100 MiB / 104,857,649 bytes`) byte metrics in `README.md`.
       - Routed `resourceType: 'org-permission'` in `teams` module to `https://github.com/organizations/<org>/settings/member_privileges` (`Configure Member Privileges ↗`) in `post-care-generator.ts`.
       - Updated `agent-review.ts` and `migration-e2e-autonomous.yml` to preserve sequential `./scans/remediation-execution-*.json` reports across self-healing rounds.
     - **PR #130 (`994e7a4`):**
       - Updated `packages/migration/src/modules/gei-repo/module.ts` to always call `listBranches` on existing target repositories when `gitTransferStrategy === 'mirror-push'` even if GitHub REST API temporarily reports `size === 0` while background disk calculation is pending.
       - Updated `packages/migration/src/strategies/mirror-push/executor.ts` to pass `['--force', '--all']` when `useShallowPackGuard` is active.
       - Updated `apps/cli/src/commands/agent-review.ts` to strip newlines from error strings before emitting bash `#` comment headers in `remediation.sh` and to run `--modules auto` when remediating `gei-repo` apply failures.
  3. **Final Clean Live Migration Run (`migration-e2e-autonomous.yml` Run `39102324168`):**
     - Completed with `success` across Phase 1 Slicer, all 7 Phase 2 Cohort jobs (`cohort-massive-01` + `cohort-standard-01..06`), and Phase 3 & 4 Verification & Audit Publication (`expectedCohortCount: 7`, `observedCohortCount: 7`, `missingCohortReports: 0`, `failedCohortCount: 0`, `failedModuleCount: 0`).
     - **Final Audit Metrics (`demogxp-mig6/migration-audit-results` & `migration-final-audit-39102324168`):**
       - `Total Repositories: 24`, `Succeeded Repositories: 24`, `Failed Repositories: 0`, `Success Rate: 100%`
       - `Verified Modules: 34 / 34 (0 Discrepancies)`
       - `Total Operations: 386 (385 succeeded [11 mutated, 374 noop], 1 skipped, 0 failed)`
       - `Large-Release Asset Streaming`: `release-heavy-benchmark`: 42 releases, 91 assets streamed (`11.05 GiB / 11,864,642,357 bytes`)
       - `Git LFS Object Streaming`: `dummy-repo-private-lfs`, `demo`: 3 objects (`100 MiB / 104,857,649 bytes`)
       - `Direct Git Mirror-Push`: `chromium` (`6 categories (17 items) · 🔄 mirror-push`, `0` discrepancies)
       - `Customer Post-Care Items`: `32 items` across `POST-CARE-CHECKLIST.md` and `exports/*.csv` (`post-care-items.csv`: 32, `secrets-to-populate.csv`: 23, `github-apps-reinstall.csv`: 1, `webhooks-reconfiguration.csv`: 3, `runners-registration.csv`: 4, `migration-operations-full.csv`: 386)
       - `0` file differences (`diff -rq`) between artifact `scans/audit-results-repo` and published `demogxp-mig6/migration-audit-results` (`508` total files, `498` Markdown files, `0` broken links, `0` blank cells).
- **Local Verification Gate (`npm run check`):** Passed cleanly (`785/785` unit tests across `133` suites, `0` failures).
