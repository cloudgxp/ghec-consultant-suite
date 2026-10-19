---
id: TASK-058
title: 'Resolve 3-Tier Audit Repo & Workflow Step Summary Inconsistencies'
status: completed
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-057
packages_affected:
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-058: Resolve 3-Tier Audit Repo & Workflow Step Summary Inconsistencies

## 1. Objective & Context

Resolve all 8 reporting inconsistencies identified across the 3-tier audit repository (`migration-audit-results`) and the GitHub Actions workflow step summaries (`$GITHUB_STEP_SUMMARY`):

1. **`autolinks` Empty Source Repository Behavior (`packages/migration/src/modules/autolinks/module.ts`)**: Stop emitting a synthetic `noop` operation (`No autolinks defined on source repository`) when a repository has `0` autolinks on the source so empty repositories report `⏭️ skipped` (`0` items) instead of `✅ complete` (`1` fake item).
2. **Consistent `⏭️ skipped` Status for 0-Item Modules (`results-generator.ts`, `webhooks`, `repo-custom-properties`, `post-migration-codeowners`)**: Ensure modules with `0` planned/executed operations and `0` discrepancies report `status: 'skipped'` (`⏭️ skipped | 0` and `⏭️ Skipped | No applicable resources in source repository`) instead of `✅ complete (0 items)`.
3. **Accurate `Migrated Categories / Items` Count in `README.md` (`results-markdown-formatter.ts`)**: Count only active/non-skipped categories in `README.md` so repositories don't claim `16 categories` when 12 of them were skipped.
4. **`post-migration-codeowners` Resource Type & Noise Filtering (`packages/migration/src/post-migration/codeowners/module.ts`, `results-generator.ts`)**:
   - Only emit operations for `CODEOWNERS` files or workflow/issue-template files that actually contain `@org/team` references (with accurate resource types `codeowners-file`, `workflow-team-ref`, `issue-template-team-ref` and descriptive `reason`s), rather than emitting `codeowners-file` `noop` rows for every untouched `.github/workflows/*.yml` and `.github/ISSUE_TEMPLATE/*.yml`.
5. **Accurate `gei-repo` Operation & Timestamp (`results-generator.ts`)**:
   - Derive `completedAt` from the earliest operation `completedAt` in the repository's cohort execution (or `executionReport.executedAt`), and set `operationType: 'noop'` with reason `'Target repository already exists on destination; verified parity.'` when the target repository already existed on the destination.
6. **Descriptive `noop` Notes & Verification Warnings in Module Detail Pages (`results-generator.ts`)**:
   - Provide clear default notes when `op.status === 'succeeded'` and `op.operationType === 'noop'` has no explicit reason (`"Configuration already matches target; verified parity."`) instead of blank `-`.
   - Render module-level `warnings` from `VerificationReport` on `organization/<module>.md` and `repositories/<repo>/<module>.md`.
7. **Workflow Step Summary Accuracy (`packages/migration/src/reporting/summary-reporter.ts`)**:
   - Fix `coreTransfer.gei` in `buildSummaryFromExecutionReport()` so `gei-repo` modules with `status === 'complete'` and `results.length === 0` still count as `1` succeeded repository.
   - Fix `coreTransfer.lfs` so `repositoriesWithLfs` counts repositories with LFS operations (`counts.succeeded > 0 ? 1 : 0`), `objectsTransferred` counts LFS objects/blobs (`counts.succeeded`), and `bytesTransferred` sums parsed byte sizes from operation reasons.
   - Map `post-migration-codeowners`, `org-rulesets`, and `org-webhooks` in `buildSummaryFromExecutionReport()`.
   - Fix `completedAt` in `buildSummaryFromExecutionReport()` to derive from the latest operation `completedAt` (or `executedAt + durationMs`) rather than `new Date().toISOString()`.
8. **Workflow Final Audit Step Summary Formatting (`.github/workflows/migration-e2e-autonomous.yml`)**:
   - Use `jq -r` when extracting `PASS_RATE` so `Overall Status` renders without raw JSON quotes (`verified`).
   - Render a clean remediation status line when 0 remediation rounds were required instead of an empty `### Remediation History` section.

## 2. Dependencies & Prerequisites

- [x] `TASK-057` completed

## 3. Scope of Changes

- `packages/migration/src/modules/autolinks/module.ts`
- `packages/migration/src/modules/repo-custom-properties/module.ts`
- `packages/migration/src/modules/webhooks/module.ts`
- `packages/migration/src/post-migration/codeowners/module.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/summary-reporter.ts`
- `.github/workflows/migration-e2e-autonomous.yml`
- `packages/migration/tests/reporting/results-generator.test.ts`
- `packages/migration/tests/reporting/summary.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Fix `autolinks`, `post-migration-codeowners`, `webhooks`, `repo-custom-properties`, and 0-item `skipped` module statuses**
- [x] **Step 2: Fix `results-generator.ts` and `results-markdown-formatter.ts` (categories count, default `noop` notes, `gei-repo` parity note/timestamp, and verification warnings rendering)**
- [x] **Step 3: Fix `summary-reporter.ts` and `.github/workflows/migration-e2e-autonomous.yml`**
- [x] **Step 4: Run `npm run check`, update tests, republish and run workflow (`38802687722`) to verify live `sandbox-mig2/migration-audit-results` and workflow step summary**

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- **Completed Date:** 2026-10-15
- **Unit & Quality Gate (`npm run check`):** Passed (`739` tests across `130` suites, `0` failures).
- **Live Autonomous E2E Workflow Run:** `38802687722` completed with `conclusion: "success"` across all 8 jobs (`verifiedModuleCount: 34`, `unverifiedModuleCount: 0`, `discrepancyCount: 0`, `failedCohortCount: 0`).
- **Live Audit Repository (`sandbox-mig2/migration-audit-results`):** Commit `27e30993d0ad9c8054fbedc41677cdd43ff4079b` verified across all `410` Markdown files (`completeWithZeroItems: 0`, `blankNotes: 0`, `brokenLinks: 0`, `Module Warnings` rendered on 6 pages).
