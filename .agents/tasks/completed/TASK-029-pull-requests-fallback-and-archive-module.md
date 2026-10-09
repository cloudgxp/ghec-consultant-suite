---
id: TASK-029
title: 'Implement Pull Requests Fallback and Historical Archival Module'
status: completed
owner: Antigravity
created_at: 2026-10-08
dependencies: ['TASK-025', 'TASK-026']
packages_affected: ['@ghec/migration', '@ghec/contracts', '@ghec/dashboard']
---

# TASK-029: Implement Pull Requests Fallback and Historical Archival Module

## 1. Objective & Context

When GEI fails to migrate metadata for large repositories (e.g. due to review thread corruption `REVIEW_THREAD_MISSING_END_COMMIT_OID` or archive limits exceeding 10 GiB), pull requests are omitted from the target repository.

Unlike issues, pull requests have direct Git branch dependencies (`head` and `base` refs), and the GitHub REST API does not support creating closed or merged pull requests in a historically merged state with custom commit timestamps.

This task creates a specialized 4-stage migration module `PullRequestsMigrationModule` (`moduleId: 'pull-requests'`) that handles both active pull requests and historical PR archives:

1. **`discover`**: Queries source pull requests (both open and closed/merged), including titles, bodies, authors, head/base branch names, review comments, labels, and milestones.
2. **`plan`**:
   - Categorizes missing pull requests into:
     - **Active Open PRs**: Re-creatable via API if the head branch exists at the target.
     - **Closed / Merged PRs**: Historical records that cannot be natively recreated as merged PRs via REST API.
   - Plans `create` operations for active open PRs.
   - Plans `archive` operations for closed/merged PRs (generating an auditable PR history digest or dedicated archival record issue).
3. **`apply`**:
   - Recreates active open PRs via `POST /repos/{owner}/{repo}/pulls` with head/base refs, titles, descriptions, labels, and milestones.
   - Re-attaches PR review comments and discussion comments to newly recreated PRs.
   - For closed/merged PRs, creates an immutable historical archive document / summary issue in the repository or releases metadata.
   - Fully supports `dryRun: true`.
4. **`verify`**: Confirms that all open PRs exist on the target and that historical archival records are present.

## 2. Dependencies & Prerequisites

- [x] `TASK-025` and `TASK-026` completed or in progress.
- [x] Prerequisite Git refs pushed by `gei-repo`.
- [x] Invariant: 4-stage module lifecycle (`discover`, `plan`, `apply`, `verify`).

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/migration/src/modules/pull-requests/`:
  - `types.ts`: Domain models for pull requests, reviews, comments, and archival payloads.
  - `module.ts`: Core `PullRequestsMigrationModule` implementing `MigrationModule`.
  - `pr-recreator.ts`: Helper for creating open PRs and posting review comments.
  - `pr-archiver.ts`: Helper for synthesizing historical closed/merged PR records.
  - `index.ts`: Module exports.
- `packages/migration/src/core/registry.ts`: Register `PullRequestsMigrationModule` in `createDefaultModuleRegistry()` with `dependencies: ['gei-repo']`.
- `apps/dashboard/src/components/ScopeBuilderModal.tsx` & `apps/dashboard/src/lib/step-summary.ts`: Add `pull-requests` to repository scope list.
- `packages/migration/tests/modules/pull-requests.test.ts`: Offline test suite verifying discovery, planning, dry-run, application, and discrepancy verification.

## 4. Implementation Checklist

- [x] **Step 1: Domain Types & Contracts**
  - Define `MigrationPullRequest`:
    ```ts
    export interface MigrationPullRequest {
      readonly number: number;
      readonly title: string;
      readonly body: string;
      readonly state: 'open' | 'closed';
      readonly merged: boolean;
      readonly headRef: string;
      readonly baseRef: string;
      readonly author: string;
      readonly labels: readonly string[];
      readonly milestone?: number | undefined;
      readonly commentsCount: number;
      readonly reviewCommentsCount: number;
    }
    ```
- [x] **Step 2: Module Discovery Stage**
  - Query pull requests from source repository via `GET /repos/{owner}/{repo}/pulls?state=all`.
  - Fetch review comments and discussion comments for open PRs.
- [x] **Step 3: Module Planning Stage**
  - Query target repository for existing PRs via `GET /repos/{owner}/{repo}/pulls?state=all`.
  - Check whether target repository contains required head branches for open PRs.
  - Plan `create` operations for missing open PRs.
  - Plan `archive` operations for closed/merged PRs if missing.
- [x] **Step 4: Module Apply Stage**
  - Implement dry-run mode emitting simulation logs without mutation.
  - In live mode:
    - For open PRs: Post `POST /repos/{owner}/{repo}/pulls`.
    - Apply labels, milestones, and reviewers.
    - Post associated comments via `POST /repos/{owner}/{repo}/issues/{pull_number}/comments`.
    - For closed/merged PRs: Generate structured historical markdown / audit summary issue.
- [x] **Step 5: Module Verify Stage**
  - Query target PRs and compare against open PRs from source.
  - Emit `VerificationDiscrepancy` for any missing open PRs or unarchived closed PR batches.
- [x] **Step 6: Registration & Dashboard Catalog**
  - Register in `ModuleRegistry` with `dependencies: ['gei-repo']`.
  - Add to dashboard `REPO_MODULES` and `step-summary.ts`.
- [x] **Step 7: Deterministic Offline Tests**
  - Add unit tests with synthetic fixtures validating open PR recreation, closed PR archiving, dry-run execution, and verification discrepancies.
- [x] **Step 8: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test packages/migration/tests/modules/pull-requests.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Implemented `packages/migration/src/modules/pull-requests/`:
    - `types.ts`: Domain models for `MigrationPullRequest`, `MigrationPullRequestComment`, `CreatePullRequestPayload`, and `ArchivePullRequestsPayload`.
    - `pr-recreator.ts`: Logic to recreate open pull requests via `POST /repos/{owner}/{repo}/pulls`, replay discussion comments, and attach labels.
    - `pr-archiver.ts`: Logic to generate formatted historical markdown and create/close an archival audit issue for historical closed/merged PRs.
    - `module.ts`: Implemented `PullRequestsMigrationModule` executing all 4 stages (`discover`, `plan`, `apply`, `verify`) with complete dryRun safety.
    - `index.ts`: Re-exported all pull-request module symbols.
  - Registered `PullRequestsMigrationModule` in `createDefaultModuleRegistry()` with `dependencies: ['gei-repo']`.
  - Added `pull-requests` to `REPO_MODULES` in `ScopeBuilderModal.tsx` and `CANONICAL_MODULES` in `step-summary.ts`.
  - Authored unit test suite in `packages/migration/tests/modules/pull-requests.test.ts` (7 tests).
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/modules/pull-requests.test.ts`: 7/7 passing.
  - `npm run check`: 514/514 tests passing offline, 0 lint errors, 0 type errors.
