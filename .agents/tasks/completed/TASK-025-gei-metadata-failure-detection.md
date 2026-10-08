---
id: TASK-025
title: 'Detect GEI Metadata Failures and Warning Diagnostics'
status: completed
owner: Antigravity
created_at: 2026-10-08
dependencies: []
packages_affected: ['@ghec/migration', '@ghec/contracts']
---

# TASK-025: Detect GEI Metadata Failures and Warning Diagnostics

## 1. Objective & Context

During a GitHub Enterprise Importer (GEI) repository migration (`gh gei migrate-repo`), large repositories frequently succeed in migrating Git data (commits, branches, and tags), but fail or skip repository metadata (releases, pull requests, issues, comments, settings, and milestones) due to archive size limits (e.g. metadata exceeding 10 GiB / 40 GiB), archive generation timeouts, or pull request review thread errors.

Currently, `GeiRepoMigrationModule.apply()` only checks whether `gh gei migrate-repo` returns exit code 0. If GEI fails during metadata migration after git data was already pushed, it treats the entire migration as a fatal failure. Conversely, if GEI exits 0 with warnings or skips metadata (e.g. `--skip-releases`, `"Repository metadata too big to migrate"`), the current implementation ignores stdout/stderr warnings, never calls `downloadMigrationLogs`, and never inspects the "Migration Log" issue created in the target repository.

This task implements runtime detection of GEI metadata failures and warning diagnostics to distinguish between Git data migration success and metadata failures, recording structured diagnostics for downstream fallback modules.

## 2. Dependencies & Prerequisites

- [ ] Review GEI log parsing utilities in `packages/migration/src/gei/logs.ts`.
- [ ] Review GEI process execution in `packages/migration/src/gei/executor.ts`.
- [ ] Invariant DEC-004: Zero plaintext secrets in logs or diagnostics.

## 3. Scope of Changes

Expected files or directories to modify:

- `packages/migration/src/gei/types.ts`: Add metadata failure indicators, log diagnostic shapes, and metadata status enum.
- `packages/migration/src/gei/logs.ts`: Enhance warning and error parsers to detect metadata archive overflow, PR review errors, and release omissions.
- `packages/migration/src/modules/gei-repo/module.ts`:
  - Capture and analyze GEI process stdout/stderr for metadata errors.
  - Automatically download migration logs via `downloadMigrationLogs` when GEI completes.
  - Inspect target repository for the "Migration Log" issue (`GET /repos/{owner}/{repo}/issues`) to capture GitHub's internal migration audit notes if CLI logs are unavailable.
  - Emit structured metadata diagnostics in `ModuleExecutionResult` (`metadataState: 'complete' | 'partial' | 'failed' | 'skipped'`, `failedMetadataCategories: string[]`).
- `packages/migration/tests/gei-logs.test.ts` & `packages/migration/tests/modules/gei-repo.test.ts`: Add offline unit tests for metadata failure detection.

## 4. Implementation Checklist

- [x] **Step 1: Enhance GEI log and output pattern matching**
  - Add regex patterns to detect:
    - `"Repository metadata too big to migrate"`
    - `"Archive generation failed"`
    - `"Git source migration succeeded, but metadata migration failed"`
    - `"REVIEW_THREAD_MISSING_END_COMMIT_OID"` / `"LINE_NOT_FOUND_IN_DIFF"`
    - Automated `--skip-releases` triggers.
- [x] **Step 2: Integrate log download into `GeiRepoMigrationModule.apply()`**
  - Following `geiExecutor.execute()`, check stdout/stderr for `migrationId`.
  - Invoke `downloadMigrationLogs()` to save `<repo>-migration.log` in an ephemeral audit directory.
  - Extract and parse warnings and errors from the log file.
- [x] **Step 3: Target "Migration Log" issue fallback inspection**
  - If migration logs cannot be retrieved via CLI, query target repository for the issue titled `"Migration Log"`.
  - Extract failure comments and warnings from the issue body.
- [x] **Step 4: Update execution results and context**
  - Record metadata status in `ModuleExecutionResult` results payload:
    - Indicate whether Git data was preserved.
    - List omitted metadata categories (`issues`, `pull-requests`, `releases`, `settings`).
  - Emit clear operator warnings to `ctx.logger.warn`.
- [x] **Step 5: Offline unit tests**
  - Test synthetic GEI outputs with metadata overflow warnings.
  - Test synthetic migration log parsing with failed metadata entries.
  - Verify zero credential leaks in diagnostic output.
- [x] **Step 6: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Task-specific test commands
node --import tsx --test packages/migration/tests/gei-logs.test.ts
node --import tsx --test packages/migration/tests/modules/gei-repo.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Enhanced `@ghec/contracts` with optional `metadataState` and `failedMetadataCategories` fields on `ModuleExecutionResultSchema`.
  - Enhanced `@ghec/github-client` with embedded URL credential sanitization in `sanitizeDiagnostics`.
  - Added `parseMigrationLogErrors` and `parseGeiMetadataDiagnostics` in `@ghec/migration/gei/logs.ts` with comprehensive regex patterns for metadata archive overflow, pull request review thread failures, and release skips.
  - Integrated automatic GEI ephemeral log download and fallback target "Migration Log" issue inspection into `GeiRepoMigrationModule.apply()`.
  - Added unit test coverage across `gei-logs.test.ts` and `gei-repo.test.ts` with 100% offline determinism and zero credential leakage.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/gei-logs.test.ts packages/migration/tests/modules/gei-repo.test.ts` passed 12/12 tests.
  - `npm run check` passed cleanly (494 tests passing across 94 suites).
