---
id: TASK-058
title: 'Resolve 3-Tier Audit Repo & Workflow Step Summary Inconsistencies'
status: in-progress
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
2. **Consistent `⏭️ skipped` Status for 0-Item Modules (`orchestrator.ts`, `results-generator.ts`, `webhooks`, `repo-custom-properties`, `post-migration-codeowners`)**: Ensure modules with `0` planned/executed operations and `0` discrepancies report `status: 'skipped'` (`⏭️ skipped | 0` and `⏭️ Skipped | No applicable resources in source repository`) instead of `✅ complete (0 items)`.
3. **Accurate `Migrated Categories / Items` Count in `README.md` (`results-generator.ts`, `results-markdown-formatter.ts`)**: Count only active/non-skipped categories (or format clearly as `<active>/<total> categories (<N> items)`) in `README.md` so repositories don't claim `16 categories` when 12 of them were skipped.
4. **`post-migration-codeowners` Resource Type & Noise Filtering (`packages/migration/src/modules/codeowners/module.ts`)**:
   - Only emit operations for `CODEOWNERS` files or workflow/issue-template files that actually contain `@org/team` or `@user` handle references (or classify workflow/template files with accurate resource types like `workflow-file` / `issue-template` only when handles are present), rather than emitting `codeowners-file` `noop` rows for every untouched `.github/workflows/*.yml` and `.github/ISSUE_TEMPLATE/*.yml`.
5. **Accurate `gei-repo` Operation & Timestamp (`packages/migration/src/modules/gei-repo/module.ts`, `results-generator.ts`)**:
   - Emit an explicit operation result in `GeiRepoMigrationModule.apply()` (or enrich in `results-generator.ts` using the cohort report's `executedAt` timestamp and actual operation type `create` vs `noop` when target repository already existed).
6. **Descriptive `noop` Notes & Verification Warnings in Module Detail Pages (`results-generator.ts`, `results-markdown-formatter.ts`, `types.ts`)**:
   - Provide clear default notes when `op.status === 'succeeded'` and `op.operationType === 'noop'` has no explicit reason (e.g., `"Configuration matches target; no changes required."`) instead of blank `-`.
   - Render module-level `warnings` from `VerificationReport` on `organization/<module>.md` and `repositories/<repo>/<module>.md` (filtering by `[<targetOrg>/<repo>]` for repository module pages).
7. **Workflow Step Summary Accuracy (`packages/migration/src/reporting/summary-reporter.ts`, `step-summary.ts`)**:
   - Fix `coreTransfer.gei` in `buildSummaryFromExecutionReport()` so `gei-repo` modules with `status === 'complete'` and `results.length === 0` still count as `1` succeeded repository.
   - Fix `coreTransfer.lfs` so `repositoriesWithLfs` counts repositories with LFS operations (`counts.planned > 0`), `objectsTransferred` counts LFS objects/blobs (`counts.succeeded`), and `bytesTransferred` sums parsed byte sizes from operation reasons if present.
   - Map `post-migration-codeowners` (in addition to `codeowners`), `org-rulesets`, and `org-webhooks` in `buildSummaryFromExecutionReport()` and `formatStepSummaryMarkdown()`.
   - Fix `completedAt` in `buildSummaryFromExecutionReport()` to derive from the latest operation `completedAt` (or `executedAt + durationMs`) rather than `new Date().toISOString()`.
8. **Workflow Final Audit Step Summary Formatting (`.github/workflows/migration-e2e-autonomous.yml`)**:
   - Use `jq -r` when extracting `PASS_RATE` so `Overall Status` renders without raw JSON quotes (`passed` / `verified`).
   - Render a clean remediation status line when 0 remediation rounds were required instead of an empty `### Remediation History` section.

## 2. Dependencies & Prerequisites

- [x] `TASK-057` completed

## 3. Scope of Changes

- `packages/migration/src/modules/autolinks/module.ts`
- `packages/migration/src/modules/codeowners/module.ts`
- `packages/migration/src/modules/gei-repo/module.ts`
- `packages/migration/src/orchestrator/orchestrator.ts`
- `packages/migration/src/reporting/types.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/summary-reporter.ts`
- `packages/migration/src/reporting/step-summary.ts`
- `.github/workflows/migration-e2e-autonomous.yml`
- Unit tests in `packages/migration/tests/`

## 4. Implementation Checklist

- [ ] **Step 1: Fix `autolinks`, `post-migration-codeowners`, `gei-repo`, and 0-item `skipped` module statuses**
- [ ] **Step 2: Fix `results-generator.ts` and `results-markdown-formatter.ts` (categories count, default `noop` notes, and verification warnings rendering)**
- [ ] **Step 3: Fix `summary-reporter.ts`, `step-summary.ts`, and `.github/workflows/migration-e2e-autonomous.yml`**
- [ ] **Step 4: Run `npm run check`, update tests, republish and run workflow to verify live `demogxp-mig2/migration-audit-results` and workflow step summary**

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

<!-- To be populated upon completion -->
