---
id: TASK-059
title: 'Autonomous E2E Migration & Audit from demogxp to demogxp-mig4'
status: completed
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-058
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-059: Autonomous E2E Migration & Audit from demogxp to demogxp-mig4

## 1. Objective & Context

Execute a complete, clean-slate autonomous E2E migration and deep audit from `demogxp` to `demogxp-mig4` across all 24 repositories (including `release-heavy-benchmark`) and all 34 modules (`15` organization modules + `19` repository modules). Prior to launching the live wave, harden release asset streaming for private repositories and enrich `ReleasesMigrationModule` execution reporting and `buildSummaryFromExecutionReport()` metrics. After execution, perform a comprehensive 3-tier audit of `demogxp-mig4/migration-audit-results` and workflow step summaries, fixing any defects in closed loop until 0 execution failures, 0 discrepancies, and 34/34 verified modules are achieved.

## 2. Dependencies & Prerequisites

- [x] `TASK-058` completed
- [x] `demogxp-mig4` target organization accessible and clean-slate ready

## 3. Scope of Changes

Expected files or directories to create or modify:

- `scopes/demogxp-to-demogxp-mig4.json`
- `packages/migration/src/modules/releases/module.ts`
- `packages/migration/src/modules/releases/asset-transfer.ts`
- `packages/migration/src/reporting/summary-reporter.ts`
- `packages/migration/tests/modules/releases.test.ts`
- `packages/migration/tests/reporting/summary.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Task Lifecycle & Scope Setup (`demogxp` -> `demogxp-mig4`)**
  - Create `scopes/demogxp-to-demogxp-mig4.json` based on `scopes/demogxp-to-demogxp-mig3.json` across all 24 repositories (`target: "demogxp-mig4"`, `targetOrg: "demogxp-mig4"`) and validate against `validateMigrationScope` from `@ghec/contracts`.
- [x] **Step 2: Pre-Flight Fixes for Releases Asset Streaming & Step Summary Metrics**
  - In `packages/migration/src/modules/releases/module.ts`, update `mapApiAsset` to prioritize `raw.url ?? raw.browser_download_url ?? ''` so private repository release assets stream reliably via the REST API asset endpoint with `Accept: application/octet-stream` and Bearer auth, and enrich `OperationExecutionResult` on `ReleasesMigrationModule.apply()` with `resourceType`, `resourceName`, `operationType`, and `reason` (including streamed byte size `(N bytes)` for `release-asset` operations).
  - In `packages/migration/src/modules/releases/asset-transfer.ts`, handle HTTP `422` (`already_exists`) on retry by cleaning up stale starter assets on the target release before re-streaming.
  - In `packages/migration/src/reporting/summary-reporter.ts`, fix `case 'releases'` in `buildSummaryFromExecutionReport()` so `repositoriesWithLargeReleases` counts repositories with succeeded release/asset operations (`counts.succeeded > 0 ? 1 : 0`), `assetsStreamed` counts succeeded `release-asset` operations, and `bytesStreamed` sums the parsed asset byte sizes.
  - Add/update offline unit tests in `packages/migration/tests/` and verify `npm run check` passes.
- [x] **Step 3: Live Autonomous E2E Migration (`demogxp` -> `demogxp-mig4`)**
  - Commit and push scope and pre-flight fixes, trigger `.github/workflows/migration-e2e-autonomous.yml` against `demogxp-mig4` (`scope: scopes/demogxp-to-demogxp-mig4.json`, `target_type: ghec`, `modules: auto`), monitor to completion, and download all workflow artifacts (`slicer-matrix-*`, `cohort-artifacts-*`, `migration-final-audit-*`).
- [x] **Step 4: Deep Audit & Closed-Loop Remediation**
  - Verify `release-heavy-benchmark` cohort slicing (`skipReleases: true`), GEI transfer, and sidecar `releases` + `release-asset` streaming and verification.
  - Audit `demogxp-mig4/migration-audit-results` across all 3 tiers (`README.md`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, and `manifest.json`) for any failed operations, discrepancies, unverified modules, inaccurate counts, blank notes, or broken links.
  - Remediate any root-cause issues and re-verify until 0 execution failures, 0 discrepancies, and 34/34 verified modules.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
npm run check
node --import tsx --test packages/migration/tests/modules/releases.test.ts
node --import tsx --test packages/migration/tests/reporting/summary.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-16
- **Execution Summary:**
  - Created and validated `scopes/demogxp-to-demogxp-mig4.json` across all 24 repositories and identity mappings (`demogxp` ➔ `demogxp-mig4`).
  - Updated `mapApiAsset` in `packages/migration/src/modules/releases/module.ts` to prioritize the REST API asset endpoint (`raw.url ?? raw.browser_download_url ?? ''`), enriched `ReleasesMigrationModule.apply()` operation execution results with `resourceType`, `resourceName`, `operationType`, and `reason` (with `(N bytes)` for `release-asset`), and hardened `packages/migration/src/modules/releases/asset-transfer.ts` to clean up stale `starter` assets on `422` (`already_exists`) upload retries.
  - Updated `buildSummaryFromExecutionReport()` in `packages/migration/src/reporting/summary-reporter.ts` to accurately compute `repositoriesWithLargeReleases`, `assetsStreamed`, and `bytesStreamed` from `releases` module operation results.
  - Executed autonomous workflow `.github/workflows/migration-e2e-autonomous.yml` (Run ID `38843298458`), which succeeded across all 8 jobs (`slicer`, 6 `migrate-cohorts` matrix jobs, and `verification-and-remediation`).
  - Verified `release-heavy-benchmark` was sliced into `cohort-standard-05` with `tier: "large-releases"`, `skipReleases: true`, and `useReleaseFallback: true`, transferred via GEI with `--skip-releases`, and streamed all `42` releases (including draft `v2.19.0`) and `91` release assets (`11,864,642,357` bytes / ~11.05 GiB) with `133/133` succeeded operations and `0` discrepancies.
  - Audited `demogxp-mig4/migration-audit-results` (commit `63a82ed24c76a5e88d4a3fd75b154b5712a50ad0`, `433` files across all 3 tiers): `24/24` repositories succeeded (`100%`), `34/34` modules verified (`15` org + `19` repo), `0` failed operations, `0` verification discrepancies, `0` broken links, and `0` blank notes.
- **Verification Evidence:**
  - `npm run check`: `741/741` unit tests passed across `130` suites; ESLint, Prettier, TypeScript typecheck, and CLI/Dashboard builds passed cleanly.
  - Live workflow run `38843298458`: `conclusion: "success"`, `verifiedModuleCount: 34`, `unverifiedModuleCount: 0`, `discrepancyCount: 0`.
