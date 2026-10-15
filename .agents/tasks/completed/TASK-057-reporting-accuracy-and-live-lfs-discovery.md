---
id: TASK-057
title: 'Fix Migration Reporting Inaccuracies & Live LFS Discovery/Verification'
status: completed
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-056
packages_affected:
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-057: Fix Migration Reporting Inaccuracies & Live LFS Discovery/Verification

## 1. Objective & Context

Fix migration reporting inaccuracies and live Git LFS discovery/verification gaps, then re-verify and republish `demogxp-mig2/migration-audit-results`:

1. Standardize on a single audit repository (`migration-audit-results`) across `.github/workflows/migration-e2e-autonomous.yml` and `apps/cli/src/commands/publish-results.ts`, and delete `demogxp-mig2/gei-migration-results`.
2. Stop rendering pre-migration planning reasons (e.g. `"Ruleset is missing on target."`, `"Variable is missing on target."`) in the post-migration `Notes / Discrepancies` column when an operation succeeded and passed verification; audit all `organization/*.md`, `success/*.md`, and `repositories/*/*.md` tables for misleading notes or counts.
3. Enhance `LfsMigrationModule.discover()`, `plan()`, `apply()`, and `verify()` in live mode to walk the repository recursive Git tree when `.gitattributes` has `filter=lfs`, parse Git LFS pointer blobs (for LFS Batch API transfer/verification) and `.gitattributes`-matched binary blobs (verifying target blob SHA parity), and record granular operation rows so LFS repositories (`dummy-repo-private-lfs`, `demo`, etc.) show verified LFS items instead of `skipped`.
4. Run `npm run check`, execute the workflow / verification / publish pipeline against `demogxp-mig2`, and verify the live `demogxp-mig2/migration-audit-results` Markdown files end-to-end.

## 2. Dependencies & Prerequisites

- [x] `TASK-056` completed

## 3. Scope of Changes

Expected files or directories to create or modify:

- `.github/workflows/migration-e2e-autonomous.yml`
- `apps/cli/src/commands/publish-results.ts`
- `apps/cli/tests/publish-results.test.ts`
- `apps/cli/tests/workflow-gates.test.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/results-repo-publisher.ts`
- `packages/migration/tests/reporting/results-generator.test.ts`
- `packages/migration/src/modules/lfs/types.ts`
- `packages/migration/src/modules/lfs/lfs-streamer.ts`
- `packages/migration/src/modules/lfs/module.ts`
- `packages/migration/tests/modules/lfs.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Single Audit Repo (`migration-audit-results`)**
  - Remove `gei-migration-results` from `.github/workflows/migration-e2e-autonomous.yml`, set `migration-audit-results` as the default in `publish-results.ts` and `results-repo-publisher.ts`, update tests, and delete `demogxp-mig2/gei-migration-results`.
- [x] **Step 2: Accurate Post-Migration Notes (`results-generator.ts`)**
  - Ensure `Notes / Discrepancies` in `organization/*.md`, `success/*.md`, and `repositories/*/*.md` does not show pre-migration planning reasons (e.g. `"Ruleset is missing on target."`) when an operation succeeded and passed verification; audit all generated Markdown tables.
- [x] **Step 3: Live LFS Discovery & Verification (`packages/migration/src/modules/lfs/`)**
  - Walk recursive Git tree in live discovery when `.gitattributes` contains `filter=lfs`, parse Git LFS pointer blobs (`version https://git-lfs.github.com/spec/v1`) and `.gitattributes`-matched blobs, verify target blob/object parity in `plan()` and `verify()`, and emit granular operation rows.
- [x] **Step 4: Quality Gate, E2E Workflow Execution & Live Audit**
  - Run `npm run check` locally, commit and push, execute `migration-e2e-autonomous.yml` against `demogxp-mig2`, and inspect live `demogxp-mig2/migration-audit-results` Markdown files.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-15
- **Execution Summary:**
  - Standardized default audit repository to `migration-audit-results` across `.github/workflows/migration-e2e-autonomous.yml`, `apps/cli/src/commands/publish-results.ts`, `packages/migration/src/reporting/results-repo-publisher.ts`, and `packages/migration/src/reporting/results-generator.ts`, and deleted `demogxp-mig2/gei-migration-results` (verified HTTP 404).
  - Updated `packages/migration/src/reporting/results-generator.ts` (`deduplicateOperationResults` and `buildGranularItemsForModule`) and `packages/migration/src/reporting/results-markdown-formatter.ts` (`formatSuccessRepoMarkdown`) so multi-phase operations deduplicate by canonical resource key and post-migration `Notes / Discrepancies` replace pre-execution planning reasons (`"is missing on target"`, `"does not exist"`, etc.) with accurate post-migration outcome notes when `status === 'succeeded'` and verification passed.
  - Enhanced `packages/migration/src/modules/lfs/` (`module.ts`, `lfs-streamer.ts`, `types.ts`) so live discovery walks recursive Git trees across `HEAD` and branches when `.gitattributes` contains `filter=lfs`, discovers both Git LFS pointer blobs (`version https://git-lfs.github.com/spec/v1`) and `.gitattributes`-matched direct Git blobs (`trackedBlobs`), authenticates Git LFS Batch API requests with HTTP Basic (`x-access-token:<token>`), streams and verifies 50 MB LFS objects on `demogxp-mig2/demo` and tracked blob SHA parity on `demogxp-mig2/dummy-repo-private-lfs`, and emits granular operation rows.
- **Verification Evidence:**
  - `npm run check`: 737/737 unit tests passing across 130 suites (0 failures), ESLint and Prettier clean, TypeScript typecheck clean.
  - Workflow Run `38779328031` (`migration-e2e-autonomous.yml` on `feat/demogxp-mig2-e2e`): All 8 jobs succeeded (`expectedCohortCount: 6`, `observedCohortCount: 6`, `failedCohortCount: 0`, `failedModuleCount: 0`, `verifiedModuleCount: 34`, `unverifiedModuleCount: 0`, `discrepancyCount: 0`).
  - Audited all 410 generated Markdown files in `demogxp-mig2/migration-audit-results` (commit `ee41ca6ce57973dc7c90985b60aed73daa1f9fa6`): zero stale `"is missing on target"` notes, `organization/org-rulesets.md` verified, and `dummy-repo-private-lfs` (`1` verified item) and `demo` (`2` verified 50 MB LFS objects) report `lfs` as `✅ complete`.
