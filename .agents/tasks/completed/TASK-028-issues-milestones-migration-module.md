---
id: TASK-028
title: 'Implement Standalone Issues and Milestones Migration Module'
status: completed
owner: Antigravity
created_at: 2026-10-08
dependencies: ['TASK-025', 'TASK-026']
packages_affected: ['@ghec/migration', '@ghec/contracts', '@ghec/dashboard']
---

# TASK-028: Implement Standalone Issues and Milestones Migration Module

## 1. Objective & Context

When GEI migrates a repository with large metadata volume (>10 GiB or hundreds of thousands of comments/events), the metadata transfer frequently fails, resulting in a target repository with Git commits and branches intact, but zero issues or milestones.

Currently, `ghec-consultant-suite` has no module to migrate or backfill Issues. If GEI metadata fails or the GitHub Migration API cannot import issues, operators have no supported path to recover them.

This task implements a dedicated 4-stage migration module `IssuesMigrationModule` (`moduleId: 'issues'`) adhering to the migration module contract:

1. **`discover`**: Collects source repository milestones, labels, issues, and issue comments.
2. **`plan`**: Compares target repository state, identifying missing milestones, labels, issues, and comments.
3. **`apply`**:
   - Idempotently creates missing labels (`POST /repos/{owner}/{repo}/labels`) and milestones (`POST /repos/{owner}/{repo}/milestones`).
   - Imports missing issues and comments using the **GitHub Issue Import API** (`POST /repos/{owner}/{repo}/import/issues` with header `Accept: application/vnd.github.golden-comet-preview+json`), which preserves original author attribution, original creation dates, and closed states without triggering user email notifications.
   - Includes fallback to standard Issues REST API (`POST /repos/{owner}/{repo}/issues`) if Issue Import API is restricted.
   - Fully supports `dryRun: true`.
4. **`verify`**: Inspects destination milestones, labels, and issues to assert parity and emits structured discrepancies for any un-migrated items.

## 2. Dependencies & Prerequisites

- [x] `TASK-025` and `TASK-026` completed or in progress.
- [x] Invariant: 4-stage module lifecycle (`discover`, `plan`, `apply`, `verify`).
- [x] Invariant: TypeScript strictness and ESM standards.

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/migration/src/modules/issues/`:
  - `types.ts`: Domain models for milestones, labels, issues, issue comments, and import payloads.
  - `module.ts`: Core `IssuesMigrationModule` class implementing `MigrationModule`.
  - `issue-importer.ts`: Client logic for GitHub Issue Import API (`golden-comet-preview`) and standard REST fallback.
  - `index.ts`: Module exports.
- `packages/migration/src/core/registry.ts`: Register `IssuesMigrationModule` in `createDefaultModuleRegistry()` with `dependencies: ['gei-repo']`.
- `apps/dashboard/src/components/ScopeBuilderModal.tsx` & `apps/dashboard/src/lib/step-summary.ts`: Add `issues` module to repository scope list.
- `packages/migration/tests/modules/issues.test.ts`: Unit test suite covering all 4 lifecycle stages with synthetic fixtures.

## 4. Implementation Checklist

- [x] **Step 1: Domain Types and Schema Definition**
  - Define `MigrationMilestone`, `MigrationLabel`, `MigrationIssueComment`, `MigrationIssue`.
  - Define Issue Import API payload schema:
    ```ts
    export interface IssueImportPayload {
      readonly issue: {
        readonly title: string;
        readonly body: string;
        readonly created_at?: string;
        readonly closed?: boolean;
        readonly closed_at?: string;
        readonly labels?: readonly string[];
        readonly milestone?: number;
      };
      readonly comments?: ReadonlyArray<{
        readonly created_at?: string;
        readonly body: string;
      }>;
    }
    ```
- [x] **Step 2: Module Discovery Stage**
  - Fetch milestones via `GET /repos/{owner}/{repo}/milestones?state=all`.
  - Fetch labels via `GET /repos/{owner}/{repo}/labels`.
  - Fetch issues (excluding PRs) via `GET /repos/{owner}/{repo}/issues?state=all&filter=all`.
  - Fetch issue comments for identified issues.
  - Support reading from cached discovery bundle if available.
- [x] **Step 3: Module Planning Stage**
  - Query destination repository for existing milestones, labels, and issues.
  - Plan `create` operations for missing milestones, labels, and issues.
  - Plan `noop` operations for already existing items.
- [x] **Step 4: Module Apply Stage**
  - Implement dry-run mode emitting planned actions without mutation.
  - In live mode:
    1. Recreate missing labels.
    2. Recreate missing milestones and build milestone ID mapping.
    3. Invoke GitHub Issue Import API (`POST /repos/{owner}/{repo}/import/issues`) for each missing issue.
    4. Fallback to standard `POST /repos/{owner}/{repo}/issues` if preview API returns 415 or 404.
- [x] **Step 5: Module Verify Stage**
  - Count target milestones, labels, and issues.
  - Compare with expected source counts and emit `VerificationDiscrepancy` for any missing resources.
- [x] **Step 6: Registration & UI Catalog**
  - Register in `ModuleRegistry` with `dependencies: ['gei-repo']`.
  - Add to dashboard `REPO_MODULES` and `step-summary.ts`.
- [x] **Step 7: Deterministic Offline Tests**
  - Verify all 4 lifecycle stages with mock adapters and synthetic fixtures.
  - Verify dry-run safety and zero network leakage.
- [x] **Step 8: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test packages/migration/tests/modules/issues.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Implemented `packages/migration/src/modules/issues/`:
    - `types.ts`: Domain models for `MigrationMilestone`, `MigrationLabel`, `MigrationIssue`, `MigrationIssueComment`, and `IssueImportPayload`.
    - `issue-importer.ts`: Implemented `executeIssueImport` supporting GitHub Issue Import API (`application/vnd.github.golden-comet-preview+json`) and automatic fallback to standard REST API (`POST /repos/{owner}/{repo}/issues` + state patch + comments replay) when preview is unavailable or returns 415/404/422.
    - `module.ts`: Implemented `IssuesMigrationModule` executing all 4 lifecycle stages (`discover`, `plan`, `apply`, `verify`) with dryRun safety, milestone ID remapping, and post-migration discrepancy reporting.
    - `index.ts`: Re-exported all types and classes.
  - Registered `IssuesMigrationModule` in `createDefaultModuleRegistry()` with `dependencies: ['gei-repo']`.
  - Enhanced `TargetWriteOperation` and `HttpTargetWriteClient` to support optional custom request `headers`.
  - Added `issues` module to `ScopeBuilderModal.tsx` and `CANONICAL_MODULES` in `step-summary.ts`.
  - Added unit test suite in `packages/migration/tests/modules/issues.test.ts` (7 tests).
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/modules/issues.test.ts`: 7/7 passing.
  - `npm run check`: 507/507 tests passing offline, 0 lint errors, 0 type errors.
