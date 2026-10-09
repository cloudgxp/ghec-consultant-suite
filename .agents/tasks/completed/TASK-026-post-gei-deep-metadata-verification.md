---
id: TASK-026
title: 'Post-GEI Deep Metadata and Parity Verification'
status: completed
owner: Antigravity
created_at: 2026-10-08
dependencies: ['TASK-025']
packages_affected: ['@ghec/migration', '@ghec/contracts']
---

# TASK-026: Post-GEI Deep Metadata and Parity Verification

## 1. Objective & Context

Currently, `GeiRepoMigrationModule.verify()` only validates that the destination repository exists (`GET /repos/{owner}/{repo}` returns HTTP 200). It performs no validation to determine whether repository contents and metadata were actually transferred. For large repositories where GEI pushes Git commits but drops or truncates metadata, verification falsely reports `verified: true` with zero discrepancies.

This task enhances post-GEI repository verification to perform a deep parity and completeness audit across Git data and metadata:

1. Verify Git commit/default branch presence and ref sanity.
2. Compare source vs target Issue counts and open/closed distribution.
3. Compare source vs target Pull Request counts and status.
4. Compare source vs target Releases and Release Assets.
5. Check repository feature settings (`has_issues`, `has_wiki`, `has_projects`, PR merge rules).
6. Inspect the destination "Migration Log" issue to assert whether GEI recorded dropped items.

Discrepancies must be surfaced with precise `expected` vs `actual` shapes so the remediation agent and downstream fallback modules can trigger corrective migrations.

## 2. Dependencies & Prerequisites

- [ ] `TASK-025` completed or prerequisite GEI diagnostics in place.
- [ ] Invariant: Contracts, Schemas & Immutability (`VerificationReportSchema`).

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/migration/src/modules/gei-repo/module.ts`:
  - Extend `verify()` method to query source and target statistics.
  - Compare issue, PR, release, and settings counts.
  - Parse target repository "Migration Log" issue comments for recorded failures.
  - Emit categorized `VerificationDiscrepancy` entries.
- `packages/migration/src/modules/gei-repo/parity-inspector.ts`:
  - Create dedicated helper to execute parallel read-only queries against source and target clients.
- `packages/migration/tests/modules/gei-repo.test.ts`:
  - Add offline unit tests with mock read adapters validating deep discrepancy reporting when metadata is omitted.

## 4. Implementation Checklist

- [x] **Step 1: Define Parity Audit Interface**
  - Define `RepositoryParityReport` containing counts and states for:
    - Default branch & commit reachability.
    - Issues (open, closed, total).
    - Pull Requests (open, closed, merged, total).
    - Releases and release asset counts.
    - Key repository settings (`hasIssues`, `hasWiki`, `hasProjects`, `allowSquashMerge`, etc.).
- [x] **Step 2: Implement Parity Inspector**
  - Query source repository statistics using lightweight GraphQL / REST counts.
  - Query target repository statistics.
  - Query destination repo for "Migration Log" issue comments using `ctx.targetClient.readSingle`.
- [x] **Step 3: Discrepancy Synthesis in `GeiRepoMigrationModule.verify()`**
  - If target issue count is 0 while source has > 0, emit discrepancy:
    `resourceName: "issues", expected: sourceCount, actual: 0, message: "Target repository has no issues; GEI metadata migration omitted issues."`
  - If target PR count is 0 while source has > 0, emit discrepancy:
    `resourceName: "pull-requests", expected: sourceCount, actual: 0, message: "Target repository has no pull requests; GEI metadata migration omitted pull requests."`
  - If releases or release assets are missing, emit discrepancy:
    `resourceName: "releases", expected: sourceReleaseCount, actual: targetReleaseCount, message: "Release assets missing on target."`
  - If repository settings differ, emit discrepancy:
    `resourceName: "repo-settings", expected: sourceSettings, actual: targetSettings, message: "Repository settings drift detected post-migration."`
  - If "Migration Log" issue reports errors, include extracted warnings in the discrepancy details.
- [x] **Step 4: Deterministic Offline Tests**
  - Verify that when source and target match, `verified === true` and `discrepancies === []`.
  - Verify that when metadata was omitted, `verified === false` and discrepancies are accurately populated.
- [x] **Step 5: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test packages/migration/tests/modules/gei-repo.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Created `RepositoryParityInspector` in `packages/migration/src/modules/gei-repo/parity-inspector.ts` to audit source vs target counts for issues, pull requests, releases, and settings drift.
  - Integrated `RepositoryParityInspector` into `GeiRepoMigrationModule.verify()` to produce categorized post-migration verification discrepancies.
  - Excluded GEI internal "Migration Log" issue from real issue counts and parsed its comments for GEI error diagnostics.
  - Added unit test coverage in `packages/migration/tests/modules/gei-repo.test.ts` for clean parity and multi-category discrepancy detection.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/modules/gei-repo.test.ts` passed 8/8 tests.
  - `npm run check` passed cleanly (496 tests passing across 94 suites).
