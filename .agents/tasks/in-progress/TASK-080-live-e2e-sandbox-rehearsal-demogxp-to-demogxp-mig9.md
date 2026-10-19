---
id: TASK-080
title: 'Live E2E Sandbox Rehearsal Migration (demogxp -> demogxp-mig9) & Reporting Audit'
status: in-progress
owner: agent
created_at: 2026-10-19
dependencies:
  - TASK-078
  - TASK-079
packages_affected:
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-080: Live E2E Sandbox Rehearsal Migration (demogxp -> demogxp-mig9) & Reporting Audit

## 1. Objective & Context

Execute a complete end-to-end Sandbox Rehearsal migration from `demogxp` to `demogxp-mig9` using GitHub Actions workflows (`generate-scope.yml` and `migration-e2e-autonomous.yml`) with `sandbox_rehearsal=true`, fix any code or workflow issues in a closed loop until 100% green (`0` failed operations, `0` verification discrepancies, `0` broken relative Markdown links), verify live sandbox state on both `demogxp` and `demogxp-mig9`, and thoroughly audit and fix all generated reports and the `demogxp-mig9/migration-audit-results` repository.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks `TASK-078` and `TASK-079` implemented in working tree
- [x] Local quality gate (`npm run check`) passes and changes pushed to `main`
- [x] Target organization `demogxp-mig9` verified accessible

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/migration/src/modules/actions-policies/module.ts`
- `packages/migration/src/modules/gei-repo/module.ts`
- `packages/migration/src/reporting/types.ts`
- `packages/migration/src/reporting/step-summary.ts`
- `packages/migration/src/reporting/summary-reporter.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/src/reporting/post-care-generator.ts`
- `apps/cli/src/commands/migrate.ts`
- `apps/cli/src/commands/verify.ts`
- `apps/cli/src/commands/publish-results.ts`
- `packages/migration/tests/modules/actions-policies.test.ts`
- `packages/migration/tests/modules/gei-repo.test.ts`
- `packages/migration/tests/reporting/summary.test.ts`

## 4. Implementation Checklist

- [x] **Phase 1: Task Tracking, Pre-Flight Fixes & Push to `main`**
  - Enrich `ActionsPoliciesMigrationModule.apply()` results with `resourceType`, `resourceName`, `operationType`, and `reason`, and align sandbox rehearsal `resourceName` across `update` and `noop` operations.
  - Keep `GeiRepoMigrationModule` 1-operation-per-repository invariant while disabling target repository Actions (`PUT /repos/{owner}/{repo}/actions/permissions` `{ enabled: false }`) and recording the sandbox rehearsal note in the repository operation `reason`.
  - Propagate `sandboxRehearsal` through `MigrationRunSummary`, `formatStepSummaryMarkdown`, `formatResultsReadmeMarkdown`, `generatePostCareDeliverables`, and `publish-results` (`🛡️ Sandbox Rehearsal`).
  - Run `npm run check`, verify `demogxp-mig9` accessibility, and commit/push to `main`.
- [ ] **Phase 2: Scope Generation (`generate-scope.yml`) with `sandbox_rehearsal=true`**
  - Trigger `.github/workflows/generate-scope.yml` for `demogxp` -> `demogxp-mig9` with `sandbox_rehearsal=true`.
  - Download `migration-scopes` artifact and verify `"sandboxRehearsal": true` at root, org, and repo levels, all 35/35 repositories (24 active + 11 archived), `modules: ["auto"]`, and `orgItemsMode: "all"`.
- [ ] **Phase 3: Live Sandbox Rehearsal Execution (`migration-e2e-autonomous.yml`) & Closed-Loop Bug Fixing**
  - Trigger `.github/workflows/migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`, `sandbox_rehearsal="true"`.
  - Monitor all jobs (`slicer`, `migrate-cohorts`, `verification-and-remediation`) and resolve any issues in a closed loop until 0 failed operations and 0 verification discrepancies.
- [ ] **Phase 4: Live Sandbox State Verification & Deep Reporting Audit**
  - Confirm via GitHub API: 0 repos locked/modified on `demogxp`; `enabled_repositories === "none"` on `demogxp-mig9`; all 35 repos on `demogxp-mig9` have Actions `enabled === false`; all org and repo webhooks on `demogxp-mig9` have `active === false`; all 11 archived source repos are `archived === true` on `demogxp-mig9`.
  - Clone and audit `demogxp-mig9/migration-audit-results` (`README.md`, `POST-CARE-CHECKLIST.md`, `exports/**/*.csv`, `organization/*.md`, `repositories/<repo>/*.md`, `success/*.md`, `failure/*.md`, `manifest.json`, `evidence/*.json`, and Step Summary) and verify 0 broken relative Markdown links.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Targeted unit tests
node --import tsx --test packages/migration/tests/modules/actions-policies.test.ts packages/migration/tests/modules/gei-repo.test.ts packages/migration/tests/reporting/summary.test.ts
```

## 6. Completion Summary & Evidence

<!-- To be populated upon completion before moving task to completed/ -->
