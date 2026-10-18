---
id: TASK-074
title: 'Live End-to-End GitHub Actions Migration: demogxp to demogxp-mig7 & Full Reporting Audit'
status: completed
owner: antigravity
created_at: 2026-10-18
dependencies: [TASK-071, TASK-072, TASK-073]
packages_affected:
  [
    '@ghec/cli',
    '@ghec/migration',
    '@ghec/discovery',
    '@ghec/contracts',
    '@ghec/github-client',
  ]
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
- `packages/github-client/src/adapters/*`
- `packages/migration/src/advisory/apps-matrix.ts`
- `packages/migration/src/modules/apps-inventory/*`
- `packages/migration/src/reporting/*`

## 4. Implementation Checklist

- [x] **Phase 1: Prepare & Trigger Scope Generation via GitHub Actions (`generate-scope.yml`)**
  - Ensure all pending code changes (`TASK-072`, `TASK-073`) are verified via `npm run check`, committed, and merged to `main` (`PR #132` $\rightarrow$ `3feea81`).
  - Verify `demogxp-mig7` target organization is in a clean state.
  - Trigger `generate-scope.yml` for `source_org="demogxp"` and `target_org="demogxp-mig7"` (`target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_org_resources="true"`, `org_items_mode="all"`).
  - Watch the workflow run (`39141420871`), inspect `$GITHUB_STEP_SUMMARY`, and download/verify the `migration-scopes` artifact (24 repositories, all 34 modules covered via `modules: ["auto"]` and `orgItemsMode: "all"`).
- [x] **Phase 2: Execute Live Migration via GitHub Actions (`migration-e2e-autonomous.yml`)**
  - Trigger `migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`.
  - Monitor slicer, parallel cohort matrix workers (`cohort-massive-01`, `cohort-standard-01`..`06`), post-cohort reconciliation, verification, and self-healing remediation.
- [x] **Phase 3: Closed-Loop Code Fix, Ship & Retry**
  - Diagnose any module or reporting issues, fix in codebase, add unit tests, pass `npm run check`, ship to `main` (`PR #133` $\rightarrow$ `852b53d`), and re-run (`39151140985`) until 0 failed operations, 0 discrepancies, and 34/34 verified modules across 24/24 repositories.
- [x] **Phase 4: Deep Audit & Remediation of Migration Reporting**
  - Download final workflow artifacts (`migration-final-audit-39151140985`) and clone `demogxp-mig7/migration-audit-results`.
  - Audit `README.md`, `$GITHUB_STEP_SUMMARY`, `POST-CARE-CHECKLIST.md`, all 16 CSV exports in `exports/**/*.csv`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, `manifest.json`, and `evidence/*` (`evidence/README.md` + `evidence/*.json`).
  - Verified 100% parity (`diff -rq` 0 differences across all 518 files), 0 broken relative links, 0 blank table cells, 0 internal `DEC-*` references, and 0 unreplaced `<SOURCE_ORG>` placeholders.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- **Completed At:** 2026-10-18
- **GitHub Actions Workflows Executed:**
  1. **Pre-Flight Merge (`PR #132` $\rightarrow$ `3feea81`):** Merged pending `TASK-072` (GitHub App URL pre-fill & enterprise classification) and `TASK-073` (executive-grade report polish) changes to `main` so all GitHub Actions runs executed against the latest codebase.
  2. **Phase 1 — Scope Generation (`generate-scope.yml` Run `39141420871`):**
     - Triggered with `source_org="demogxp"`, `target_org="demogxp-mig7"`, `target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_org_resources="true"`, `org_items_mode="all"`.
     - Verified artifact `generated-scopes/demogxp-to-demogxp-mig7-all.json`: 24 non-archived repositories, `modules: ["auto"]`, `orgItemsMode: "all"`.
  3. **Phase 2 — Initial Live Migration (`migration-e2e-autonomous.yml` Run `39141539260`):**
     - Executed across 9 jobs (`slicer`, `cohort-massive-01`, `cohort-standard-01`..`06`, `verification-and-remediation`), migrating all `24/24` repositories and verifying `34/34` modules with `0` failed operations and `0` verification discrepancies.
  4. **Phase 3 — Closed-Loop Remediation (`PR #133` $\rightarrow$ `852b53d` & Re-Run `39151140985`):**
     - Identified two subtle reporting/discovery bugs during the deep audit of Run `39141539260`:
       - **Bug #1 (`apps-inventory` & `GitHubAppsAdvisoryPlanner` public vs. private app probe):** Calling `GET /apps/{app_slug}` with a token from the owning enterprise/org returned HTTP `200 OK` even for private internal apps (`demogxp-test-custom`, `testing-all-repos-app`), causing them to be classified as `third_party`. Fixed by adding `unauthenticated?: boolean` to `ReadOperation` and `HttpGitHubReadAdapter` (omitting the `Authorization` header and bypassing authenticated rate-limiter state updates), probing `rest.apps.getBySlug` with `unauthenticated: true`, and enriching metadata (`appName`, `description`, `externalUrl`, `ownerLogin`) via `rest.apps.getBySlugAuthenticated` when `status !== 200`. Also updated `classifyGitHubApp()` to support Enterprise owner objects (`owner.slug`).
       - **Bug #2 (`<SOURCE_ORG>` placeholder in `deploy-keys-cutover.csv`):** Threaded `sourceOrg` into `resolveTargetSettingsLinks()` in `post-care-generator.ts` and `results-generator.ts` so `exports/identity-and-access/deploy-keys-cutover.csv` and `exports/post-care-items.csv` render `--source-org demogxp` instead of `<SOURCE_ORG>`.
     - Added unit tests, passed `npm run check` (`790/790` tests), merged `PR #133` (`852b53d`), and re-ran `migration-e2e-autonomous.yml` (**Run `39151140985`**).
  5. **Phase 4 — Final Deep Audit of `demogxp-mig7/migration-audit-results` (Run `39151140985`):**
     - **Executive Summary & Parity:** `24/24` repositories migrated (`100.0%`), `34/34` modules verified (`15` org + `19` repo), `855` total operations (`37` succeeded, `792` already in sync / noop, `26` skipped/advisory, `0` failed), `0` discrepancies, and `release-heavy-benchmark` (`3` releases, `3.42 GB` / `3,670,016,000` bytes streamed).
     - **GitHub Apps Classification & Deep Links:** `hackmd-hub` (`third_party` $\rightarrow$ `https://github.com/apps/hackmd-hub/installations/new`), `demogxp-test-custom` (`custom_private` $\rightarrow$ pre-filled `/settings/apps/new?...` with description & permissions + selected repos `react, demo`), and `testing-all-repos-app` (`custom_private` $\rightarrow$ pre-filled `/settings/apps/new?...`).
     - **4 Secret Domains & 2 Variable Domains:** Verified `actions`, `dependabot`, `codespaces`, and `agents` secrets (`ORG_AGENT_SECRET_DEMO`, `AGENT_SECRET_DEMO` $\rightarrow$ `/settings/secrets/agents`) and `actions` and `agents` variables (`ORG_AGENT_VARIABLE_DEMO`, `AGENT_VARIABLE_DEMO` $\rightarrow$ `/settings/variables/agents`).
     - **Structural Integrity:** `518` files (`498` `.md`, `16` `.csv`, `manifest.json`, `3` `.json` in `evidence/`), `0` differences between workflow artifact and `demogxp-mig7/migration-audit-results`, `0` broken links, `0` blank cells, `0` `DEC-*` references, and `0` `<SOURCE_ORG>` placeholders.
