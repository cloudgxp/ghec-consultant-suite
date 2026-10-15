---
id: TASK-057
title: 'Fix Migration Reporting Inaccuracies & Live LFS Discovery/Verification'
status: in-progress
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
- `packages/migration/src/reporting/results-repo-publisher.ts`
- `packages/migration/tests/reporting/results-generator.test.ts`
- `packages/migration/src/modules/lfs/types.ts`
- `packages/migration/src/modules/lfs/module.ts`
- `packages/migration/tests/modules/lfs.test.ts`

## 4. Implementation Checklist

- [ ] **Step 1: Single Audit Repo (`migration-audit-results`)**
  - Remove `gei-migration-results` from `.github/workflows/migration-e2e-autonomous.yml`, set `migration-audit-results` as the default in `publish-results.ts` and `results-repo-publisher.ts`, update tests, and delete `demogxp-mig2/gei-migration-results`.
- [ ] **Step 2: Accurate Post-Migration Notes (`results-generator.ts`)**
  - Ensure `Notes / Discrepancies` in `organization/*.md`, `success/*.md`, and `repositories/*/*.md` does not show pre-migration planning reasons (e.g. `"Ruleset is missing on target."`) when an operation succeeded and passed verification; audit all generated Markdown tables.
- [ ] **Step 3: Live LFS Discovery & Verification (`packages/migration/src/modules/lfs/`)**
  - Walk recursive Git tree in live discovery when `.gitattributes` contains `filter=lfs`, parse Git LFS pointer blobs (`version https://git-lfs.github.com/spec/v1`) and `.gitattributes`-matched blobs, verify target blob/object parity in `plan()` and `verify()`, and emit granular operation rows.
- [ ] **Step 4: Quality Gate, E2E Workflow Execution & Live Audit**
  - Run `npm run check` locally, commit and push, execute `migration-e2e-autonomous.yml` against `demogxp-mig2`, and inspect live `demogxp-mig2/migration-audit-results` Markdown files.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
npm run check
```

## 6. Completion Summary & Evidence

<!--
To be populated upon completion before moving task to completed/:
- Completion Date: YYYY-MM-DD
- Execution Summary: Brief description of changes made
- Verification Evidence: Output from npm run check and E2E workflow run
-->
