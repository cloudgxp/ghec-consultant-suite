---
id: TASK-030
title: 'Integrate Metadata Failure Remediation in Agent Review and Wave Orchestrator'
status: completed
owner: Antigravity
created_at: 2026-10-08
dependencies: ['TASK-025', 'TASK-026', 'TASK-027', 'TASK-028', 'TASK-029']
packages_affected: ['apps/cli', 'packages/migration', '@ghec/dashboard']
---

# TASK-030: Integrate Metadata Failure Remediation in Agent Review and Wave Orchestrator

## 1. Objective & Context

When GEI finishes a large repository migration with metadata dropped (releases skipped, issues dropped, pull requests omitted, or settings unapplied), operators need an end-to-end automated workflow to detect these conditions and immediately trigger the corresponding fallback modules.

Currently:

1. `MigrationOrchestrator` runs modules sequentially based on DAG dependencies, but does not dynamically queue or advise metadata fallback modules if `gei-repo` reports metadata failures.
2. `apps/cli/src/commands/agent-review.ts` generates remediation actions for secrets, variables, rulesets, releases, and collaborators, but has no knowledge of `issues`, `pull-requests`, or comprehensive repository settings discrepancies.

This task connects metadata failure detection and the fallback modules into the migration orchestrator and the `agent-review` remediation engine:

- Enables dynamic fallback scheduling in `MigrationOrchestrator` when GEI metadata errors are detected.
- Enhances `agent-review` to recognize metadata discrepancies and generate idempotent, executable remediation commands for `issues`, `pull-requests`, `releases`, and `repo-settings`.
- Updates the live migration console and markdown step summary to surface metadata recovery status to operators.

## 2. Dependencies & Prerequisites

- [x] `TASK-025`, `TASK-026`, `TASK-027`, `TASK-028`, and `TASK-029` completed or contracts established.
- [x] Skill: `verification-and-remediation`.

## 3. Scope of Changes

Expected files or directories to modify:

- `packages/migration/src/orchestrator/migration-orchestrator.ts`:
  - Detect metadata failure outputs from `gei-repo`.
  - When metadata errors or omissions are detected, dynamically append or recommend fallback module runs (`repo-settings`, `releases`, `issues`, `pull-requests`).
- `apps/cli/src/commands/agent-review.ts`:
  - Add discrepancy mapping for `issues`, `pull-requests`, `releases`, and `repo-settings`.
  - Generate targeted CLI migration commands:
    ```bash
    ghec-consultant-cli migrate --modules issues --scope ./scopes/<slice>.json
    ghec-consultant-cli migrate --modules pull-requests --scope ./scopes/<slice>.json
    ghec-consultant-cli migrate --modules releases --scope ./scopes/<slice>.json
    ghec-consultant-cli migrate --modules repo-settings --scope ./scopes/<slice>.json
    ```
  - Categorize actions under `'metadata-and-content'` or `'assets-and-storage'`.
- `apps/cli/tests/agent-review.test.ts`:
  - Unit test verifying remediation plan and bash script generation for metadata discrepancies.
- `packages/migration/src/reporting/step-summary.ts`:
  - Highlight metadata failure diagnostics and suggested fallback executions in the GitHub Actions `$GITHUB_STEP_SUMMARY`.

## 4. Implementation Checklist

- [x] **Step 1: Orchestrator Metadata Feedback Loop**
  - In `MigrationOrchestrator`, inspect the execution result of `gei-repo`.
  - If `failedMetadataCategories` is present, record recommendations in the migration execution report.
- [x] **Step 2: Update Agent Review Discrepancy Mappings**
  - In `apps/cli/src/commands/agent-review.ts`, add handlers for:
    - `modId === 'issues'` -> Suggest `ghec-consultant-cli migrate --modules issues --scope <scope>`.
    - `modId === 'pull-requests'` -> Suggest `ghec-consultant-cli migrate --modules pull-requests --scope <scope>`.
    - `modId === 'releases'` -> Suggest `ghec-consultant-cli migrate --modules releases --scope <scope>`.
    - `modId === 'repo-settings'` -> Suggest `ghec-consultant-cli migrate --modules repo-settings --scope <scope>`.
    - Discrepancies emitted by `gei-repo` with `resourceName: 'issues' | 'pull-requests' | 'releases' | 'repo-settings'` -> Route to the appropriate fallback module command.
- [x] **Step 3: Update Remediation Script Generation**
  - Ensure generated `remediation.sh` contains the sequential fallback migration commands.
- [x] **Step 4: Step Summary Formatting**
  - In `step-summary.ts`, render a dedicated alert box if GEI metadata failures occurred, listing the specific recovery commands.
- [x] **Step 5: Deterministic Offline Tests**
  - Test `agent-review` with a verification report containing metadata discrepancies.
  - Assert that the output plan and script contain the correct fallback module commands.
- [x] **Step 6: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test apps/cli/tests/agent-review.test.ts
node --import tsx --test packages/migration/tests/reporting/summary.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-08
- **Execution Summary:**
  - Integrated feedback loop in `MigrationOrchestrator` (`packages/migration/src/orchestrator/migration-orchestrator.ts`) to detect `failedMetadataCategories` from `gei-repo` and advise fallback module executions (`issues`, `pull-requests`, `releases`, `repo-settings`).
  - Extended `RemediationAction` and `generateRemediationPlan` in `apps/cli/src/commands/agent-review.ts` with `'metadata-and-content'` categorization and targeted remediation CLI commands for `issues`, `pull-requests`, `repo-settings`, and `gei-repo` metadata omissions.
  - Updated `generateCliRemediationCommand` in `apps/dashboard/src/lib/verification-diff.ts` to provide copyable remediation commands for `issues`, `pull-requests`, `repo-settings`, and `gei-repo`.
  - Added `metadataFailures` tracking in `MigrationRunSummary` and populated it in `packages/migration/src/reporting/summary-reporter.ts`.
  - Rendered a dedicated `[!CAUTION]` alert box with suggested remediation commands in `packages/migration/src/reporting/step-summary.ts`.
  - Authored deterministic unit tests in `apps/cli/tests/agent-review.test.ts` and `packages/migration/tests/reporting/summary.test.ts`.
- **Verification Evidence:**
  - `node --import tsx --test apps/cli/tests/agent-review.test.ts`: 6/6 tests passing.
  - `node --import tsx --test packages/migration/tests/reporting/summary.test.ts`: 10/10 tests passing.
  - `npm run check`: 0 lint errors, 0 type errors across all packages and apps, 516/516 tests passing across 95 suites.
