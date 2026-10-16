---
id: TASK-054
title: 'Discovery Read-Error Propagation & Plan Warning Observability in Verification'
status: completed
owner: agent
created_at: 2026-10-15
dependencies:
  - TASK-053
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-054: Discovery Read-Error Propagation & Plan Warning Observability in Verification

## 1. Objective & Context

When `ghec-consultant-cli verify` runs with `--scope`, `MigrationPlanner` executes `module.discover(ctx)` and `module.plan(ctx, discovered)` with `verificationMode: true`. `MigrationPlanner` has a `try / catch` block designed to capture read errors and emit `[VERIFY_READ_ERROR]` warnings, which `VerificationOrchestrator` converts into `read_error` discrepancies (`verified: false`).

However, several migration modules catch all errors inside `discover()` or `plan()`, log a console warning, and return empty arrays (`[]`). When an unexpected API error, permission error (HTTP 401/403), rate limit (HTTP 429), or network error occurs on the source organization/repository during `verify`:

1. `discover()` returns empty data (`0` items).
2. `plan()` generates `0` operations.
3. `verify()` iterates over `0` operations and reports `verified: true` with `0` discrepancies.

Additionally, non-fatal `modulePlan.warnings` (such as skipped inherited organization rulesets or unmapped actors) are dropped from `VerificationReport` and `MigrationExecutionReport`, leaving operators and `agent-review` blind to skipped configurations.

## 2. Dependencies & Prerequisites

- [x] `TASK-053` completed (or coordinated changes in `packages/migration/src/modules/rulesets/module.ts`)
- [x] `isExpectedFeatureAbsentError` and `formatSanitizedReadError` utilities available in `packages/migration/src/core/read-error-classifier.ts`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/contracts/src/verification/verification-report.ts`
- `packages/migration/src/core/read-error-classifier.ts`
- `packages/migration/src/modules/rulesets/module.ts`
- `packages/migration/src/modules/branch-protection/module.ts`
- `packages/migration/src/modules/custom-roles/module.ts`
- `packages/migration/src/modules/teams/module.ts`
- `packages/migration/src/modules/issues/module.ts`
- `packages/migration/src/modules/pull-requests/module.ts`
- `packages/migration/src/orchestrator/verification-orchestrator.ts`
- `packages/migration/src/orchestrator/migration-orchestrator.ts`
- `apps/cli/src/commands/agent-review.ts`
- `packages/migration/tests/orchestrator/verification-orchestrator.test.ts`
- `packages/migration/tests/planner.test.ts`
- `apps/cli/tests/agent-review.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Enforce `isExpectedFeatureAbsentError` in `discover()` across modules**
  - Update `discover()` catch blocks in `rulesets`, `branch-protection`, `custom-roles`, `teams`, `issues`, and `pull-requests` so that:
    - Expected feature-absent / 404 / 410 responses return empty collections gracefully.
    - Unexpected errors (401, 403, 429, 5xx, network failures) are logged via `formatSanitizedReadError` and rethrown so `MigrationPlanner` records `[VERIFY_READ_ERROR]` in `verificationMode` (and halts or flags errors during planning).
- [x] **Step 2: Classify target read errors in `plan()`**
  - In `plan()` methods where target state is queried (e.g., `rulesets`, `branch-protection`, `webhooks`, `custom-roles`), allow 404/feature-absent errors when the target repo/resource does not yet exist prior to migration, but surface unexpected target read errors (401/403/5xx) via `[VERIFY_READ_ERROR]` warnings or rethrown errors.
- [x] **Step 3: Preserve and log `ModulePlan.warnings` in Orchestrators & Reports**
  - Include `warnings?: readonly string[]` on `ModuleVerificationResult` (in `@ghec/contracts`) and populate it in `VerificationOrchestrator` from `modulePlan.warnings`.
  - Log `modulePlan.warnings` clearly in `MigrationOrchestrator` and `VerificationOrchestrator` so skipped resources are always visible in CI logs and structured JSON reports.
  - Surface module verification warnings in `verify` CLI summary output and `agent-review` diagnostics.
- [x] **Step 4: Deterministic offline tests**
  - Add unit tests verifying that HTTP 403 / 500 errors in `discover()` for `rulesets` / `org-rulesets` result in `verified: false` with a `read_error` discrepancy during verification.
  - Add unit tests verifying that `modulePlan.warnings` are preserved on `VerificationReport` and surfaced by `agent-review`.
- [x] **Step 5: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
node --import tsx --test packages/migration/tests/orchestrator/verification-orchestrator.test.ts
node --import tsx --test packages/migration/tests/planner.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-15
- **Execution Summary:**
  - Added `assertReadResponseOk` and `assertFetchAllOk` in `packages/migration/src/core/read-error-classifier.ts` and updated `discover()` across `rulesets`, `branch-protection`, `custom-roles`, `teams`, `issues`, and `pull-requests` to propagate unexpected HTTP errors (`401`, `403`, `429`, `5xx`) while gracefully treating `404`/`410`/feature-absent errors as empty collections.
  - Added optional `warnings` array to `ModuleVerificationResultSchema` in `@ghec/contracts`.
  - Updated `VerificationOrchestrator` and `MigrationOrchestrator` to log `modulePlan.warnings` and preserve them on `ModuleVerificationResult` in `VerificationReport`.
  - Updated `apps/cli/src/commands/agent-review.ts` to support `org-rulesets` and `org-webhooks` and surface `moduleResult.warnings` in `RemediationPlan.warnings`.
- **Verification Evidence:**
  - `node --import tsx --test packages/migration/tests/orchestrator/verification-orchestrator.test.ts packages/migration/tests/planner.test.ts apps/cli/tests/agent-review.test.ts`: 19 passed, 0 failed.
