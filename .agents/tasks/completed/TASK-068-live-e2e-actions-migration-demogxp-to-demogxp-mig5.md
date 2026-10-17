---
id: TASK-068
title: 'Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig5 & Full Reporting Audit'
status: completed
owner: agent
created_at: 2026-10-17
completed_at: 2026-10-17
dependencies: [TASK-064, TASK-065, TASK-066, TASK-067]
packages_affected: ['@ghec/cli', '@ghec/migration', '@ghec/contracts']
---

# TASK-068: Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig5 & Full Reporting Audit

## 1. Objective & Context

Execute a complete, live end-to-end migration from `demogxp` to `demogxp-mig5` (`target_type: ghec`) strictly following the operator workflow in `docs/guides/consultant-operators-manual.md` and `docs/guides/generating-migration-scopes.md` using **only GitHub Actions workflows** (`generate-scope.yml` and `migration-e2e-autonomous.yml`).

Run in a closed loop: diagnose any workflow, module, strategy resolution, or reporting discrepancies; fix the underlying code with deterministic unit tests; pass `npm run check`; commit and push to `main`; and re-run until:

- All **24/24 repositories** in `demogxp` and all **34/34 modules** (15 organization + 19 repository) are migrated and verified with **0 failed operations** and **0 verification discrepancies**.
- The published `demogxp-mig5/migration-audit-results` repository, workflow artifacts, and `$GITHUB_STEP_SUMMARY` are 100% accurate across Tier 1 (`README.md`, `POST-CARE-CHECKLIST.md`, `exports/*.csv`), Tier 2 (`organization/*.md`, `repositories/<repo>/<module>.md`), Tier 3 (`success/*.md`, `failure/*.md`), and `manifest.json`.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-062` through `TASK-067`)
- [x] Target organization `demogxp-mig5` accessible and ready for clean-slate migration from `demogxp`

## 3. Scope of Changes

Expected files or directories to inspect/modify if issues arise during live execution or reporting audit:

- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `.github/workflows/migration-execute-wave.yml`
- `apps/cli/src/commands/generate-scope.ts`
- `apps/cli/src/commands/publish-results.ts`
- `packages/migration/src/orchestrator/*`
- `packages/migration/src/reporting/*`

## 4. Implementation Checklist

- [x] **Phase 1: Prepare & Trigger Scope Generation via GitHub Actions (`generate-scope.yml`)**
  - Ensure all pending code changes are committed, rebased on `origin/main`, verified via `npm run check`, and pushed to `main`.
  - Verify `demogxp-mig5` target organization is in a clean state.
  - Trigger `generate-scope.yml` for `source_org="demogxp"` and `target_org="demogxp-mig5"` (`target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_org_resources="true"`, `org_items_mode="all"`).
  - Watch the workflow run, inspect `$GITHUB_STEP_SUMMARY`, and download/verify the `migration-scopes` artifact (24 repositories, all modules covered).
- [x] **Phase 2: Execute Live Migration via GitHub Actions (`migration-e2e-autonomous.yml`)**
  - Trigger `migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`.
  - Monitor slicer, parallel cohort matrix workers, post-cohort reconciliation, verification, and self-healing remediation.
- [x] **Phase 3: Closed-Loop Code Fix, Ship & Retry**
  - Diagnose any module or workflow errors, fix in codebase, add unit tests, pass `npm run check`, push to `main`, and re-run until 0 failed operations, 0 discrepancies, and 34/34 verified modules across 24/24 repositories.
- [x] **Phase 4: Deep Audit & Remediation of Migration Reporting**
  - Download final workflow artifacts and clone `demogxp-mig5/migration-audit-results`.
  - Audit `README.md`, `$GITHUB_STEP_SUMMARY`, `POST-CARE-CHECKLIST.md`, all 6 CSV exports in `exports/*.csv`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, `manifest.json`, and `evidence/*.json`.
  - Fix any reporting mismatches, broken links, or formatting bugs, push to `main`, and re-verify in GitHub Actions.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- **Completed At:** 2026-10-17
- **Phase 1 (`generate-scope.yml` Run `39027958471`):**
  - Generated and validated `./scopes/demogxp-to-demogxp-mig5-all.json` in artifact `migration-scopes`: **24/24 repositories**, **15 organization modules**, and **19 repository modules** (`34/34` total modules).
- **Phase 2 & 3 (`migration-e2e-autonomous.yml` Runs `39028219225`, `39038359061`, and `39048518474`):**
  - Closed-loop fixes shipped via PR #121 (`2f9eda8`), PR #122 (`a22fdd6`), and PR #123 (`04e17a0`):
    - Handled global SSH deploy key uniqueness (`HTTP 422 key is already in use`) in `deploy-keys` (`status: 'skipped'` deferred to post-care + source-bound SSH key verification check).
    - Re-planned and re-verified `repo-settings` (`delete_branch_on_merge`) after `security` enables GHAS on public repositories.
    - Preserved resolved scope path `./scopes/<name>.json` for self-healing remediation scripts.
- **Phase 4 (`migration-e2e-autonomous.yml` Run `39048518474` & PR #124 `f2a3bd3`):**
  - Shipped reporting fixes in PR #124 (`f2a3bd3`):
    - Deduplicated multi-pass organization module executions across `pre-cohort-org-report.json` and `post-cohort-reconcile-report.json` in `summary-reporter.ts` and `publish-results.ts`.
    - Added `⏭️ Skipped` badge in `step-summary.ts` and post-care deferral note in `formatSuccessRepoMarkdown`.
    - Preserved `mirror-push` (`chromium`) and `--skip-releases` (`release-heavy-benchmark`) strategy summaries when target repositories already exist on destination, and enriched `README.md` Executive Metrics and Repositories Index with Verified Modules (`34 / 34`), Total Operations (`381`: `380 succeeded [11 mutated, 369 noop], 1 skipped, 0 failed`), Large-Release Asset Streaming (`release-heavy-benchmark`: `42 releases, 91 assets streamed, 11.05 GiB`), Git LFS Object Streaming (`dummy-repo-private-lfs`, `demo`: `3 objects, 100 MiB`), Direct Git Mirror-Push (`chromium`), and per-repo strategy badges.
  - Verified **100% parity** (`0` diffs across all `507` files and `0` broken relative links across all `497` Markdown files) between `migration-final-audit-39048518474` and `demogxp-mig5/migration-audit-results`.
  - Quality gate `npm run check` passed with **771/771 unit tests** passing.
