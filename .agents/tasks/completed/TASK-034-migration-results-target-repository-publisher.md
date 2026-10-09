---
id: TASK-034
title: 'migration-results-target-repository-publisher'
status: completed
owner: agent
created_at: 2026-10-08
dependencies:
  - TASK-032
  - TASK-033
packages_affected:
  - '@ghec/migration'
---

# TASK-034: Migration Results Target Repository Publisher

## 1. Objective & Context

In `gh gei migrate-org`, an organization migration creates a `gei-migration-results` repository directly in the target organization to preserve an immutable, easily accessible audit log of repository migrations.

This task implements the publishing service in `@ghec/migration` (`MigrationResultsRepoPublisher`) that creates or updates the migration results repository in the destination organization and commits the complete file hierarchy (`README.md`, `manifest.json`, `success/<repo>.md`, `failure/<repo>.md`) as an atomic commit via the GitHub Git Data API.

This upholds:

- **DEC-004 (Zero-Exposure Secret Boundary):** Tokens remain strictly in memory and authorization headers; never written to files, logs, or commit messages.
- **Atomic Operations:** Uses Git Data API (blobs, trees, commit, ref update) so that the entire set of markdown logs and manifests are committed in a single transaction.
- **Offline Determinism:** The publisher interacts through the existing `TargetWriteClient` and `GitHubReadAdapter` abstractions, allowing 100% offline unit and integration testing.

## 2. Dependencies & Prerequisites

- [x] Upstream `TASK-032` (contracts/schemas) and `TASK-033` (results generator) completed.
- [x] `TargetWriteClient` available for write operations.

## 3. Scope of Changes

- `packages/migration/src/reporting/results-repo-publisher.ts`: Publisher service class orchestrating repository verification, creation, and atomic commit publishing.
- `packages/migration/src/reporting/index.ts`: Re-export publisher service and configuration types.
- `packages/migration/tests/reporting/results-repo-publisher.test.ts`: Offline deterministic unit tests mocking `TargetWriteClient` and validating GitHub API call sequences.

## 4. Implementation Checklist

- [x] **Step 1: Publisher Service Implementation**
  - Define `ResultsRepoPublisherOptions`:
    - `targetOrg: string`
    - `repoName?: string` (default: `'gei-migration-results'`)
    - `targetClient: GitHubReadAdapter`
    - `targetWriteClient?: TargetWriteClient`
    - `dryRun?: boolean`
    - `branch?: string` (default: `'main'`)
    - `commitMessage?: string`
    - `logger?: StructuredLogger`
    - `signal?: AbortSignal`
  - Implement `ensureTargetRepository()`:
    - Query `GET /repos/{owner}/{repo}` to detect if repository already exists.
    - If absent, call `POST /orgs/{org}/repos` with `{ name: repoName, private: true, description: "Migration audit logs and results for organization transfer", auto_init: true }`.
    - Handle dry-run mode by logging planned repository creation without mutating.
  - Implement `publishAtomicCommit(files: Record<string, string>)`:
    - Resolve base commit SHA via `GET /repos/{owner}/{repo}/git/ref/heads/{branch}`.
    - Create blobs for each generated file via `POST /repos/{owner}/{repo}/git/blobs`.
    - Create a tree with all blob SHAs via `POST /repos/{owner}/{repo}/git/trees` with `base_tree`.
    - Create commit pointing to parent commit via `POST /repos/{owner}/{repo}/git/commits`.
    - Update branch reference via `PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}`.
  - Wrap errors with `sanitizeDiagnostics` to ensure no token leakage.

- [x] **Step 2: Deterministic Offline Tests**
  - Author `packages/migration/tests/reporting/results-repo-publisher.test.ts` using `node:test` and `node:assert/strict`.
  - Test Case 1: Creates repo when missing and publishes complete commit tree.
  - Test Case 2: Updates existing repo without creating a duplicate.
  - Test Case 3: Dry-run mode produces zero write mutations.
  - Test Case 4: Handles API error responses defensively and scrubs tokens from error diagnostics.

- [x] **Step 3: Quality Gate Verification**
  - Validate with `npm run check`.

## 5. Verification Gate

```bash
# Monorepo verification gate
npm run check

# Targeted publisher test
node --import tsx --test packages/migration/tests/reporting/results-repo-publisher.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Implemented `MigrationResultsRepoPublisher` in `packages/migration/src/reporting/results-repo-publisher.ts` providing atomic Git Data API publishing (blobs, trees, commit, ref update) and target audit repository provisioning.
  - Re-exported publisher and options in `packages/migration/src/reporting/index.ts`.
  - Authored deterministic unit tests covering repository creation, existing repository updates, dry-run safety, and diagnostic sanitization in `packages/migration/tests/reporting/results-repo-publisher.test.ts`.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/reporting/results-repo-publisher.test.ts`: 4/4 tests passed cleanly.
  - `npm test`: 535 tests passed cleanly across packages.
  - `npm run lint`: Passed with 0 errors.
