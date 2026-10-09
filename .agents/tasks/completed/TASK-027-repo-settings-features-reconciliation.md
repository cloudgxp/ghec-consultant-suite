---
id: TASK-027
title: 'Expand Repo Settings Module for Feature Flags & Metadata Reconciliation'
status: completed
owner: Antigravity
created_at: 2026-10-08
dependencies: []
packages_affected: ['@ghec/migration']
---

# TASK-027: Expand Repo Settings Module for Feature Flags & Metadata Reconciliation

## 1. Objective & Context

When GEI creates a target repository or fails during metadata configuration, the target repository often inherits default organization settings rather than replicating the source repository's configuration.

The existing `RepoSettingsMigrationModule` only reconciles repository visibility and PR merge settings (`allow_squash_merge`, `allow_merge_commit`, `allow_rebase_merge`, commit message formatting). It omits:

- Feature toggles: `has_issues`, `has_projects`, `has_wiki`, `has_discussions`.
- Core repository metadata: `description`, `homepage`, `default_branch`.
- Branch behaviors: `allow_auto_merge`, `delete_branch_on_merge`, `allow_update_branch`.

If GEI fails to configure repository settings, running `repo-settings` must act as the authoritative manual and automated reconciliation mechanism to restore exact feature parity from the source repository.

## 2. Dependencies & Prerequisites

- [x] Existing `packages/migration/src/modules/repo-settings/` module.
- [x] Invariant: 4-stage lifecycle (`discover` -> `plan` -> `apply` -> `verify`).

## 3. Scope of Changes

Expected files or directories to modify:

- `packages/migration/src/modules/repo-settings/types.ts`:
  - Add feature toggles (`hasIssues`, `hasProjects`, `hasWiki`, `hasDiscussions`).
  - Add repository metadata fields (`description`, `homepage`, `defaultBranch`).
- `packages/migration/src/modules/repo-settings/pr-settings.ts`:
  - Rename / expand to `settings-reconciliation.ts` or add `diffRepositoryFeatures` to calculate diffs for all feature flags and metadata fields.
- `packages/migration/src/modules/repo-settings/module.ts`:
  - Update `discover` to capture full feature toggles and metadata from source and cached bundles.
  - Update `plan` to construct comprehensive `PATCH /repos/{owner}/{repo}` payload.
  - Update `apply` to execute `PATCH` mutations with full dry-run support.
  - Update `verify` to assert parity across all feature flags and settings.
- `packages/migration/tests/modules/repo-settings.test.ts`:
  - Add unit tests verifying discovery, planning, dry-run, application, and discrepancy verification for feature flags and metadata.

## 4. Implementation Checklist

- [x] **Step 1: Update Types & Contracts**
  - Define `RepositoryFeatures`:
    ```ts
    export interface RepositoryFeatures {
      readonly hasIssues?: boolean | undefined;
      readonly hasProjects?: boolean | undefined;
      readonly hasWiki?: boolean | undefined;
      readonly hasDiscussions?: boolean | undefined;
    }
    ```
  - Define `RepositoryCoreMetadata`:
    ```ts
    export interface RepositoryCoreMetadata {
      readonly description?: string | undefined;
      readonly homepage?: string | undefined;
      readonly defaultBranch?: string | undefined;
    }
    ```
  - Update `RepoSettingsData` to include features and metadata.
- [x] **Step 2: Update Settings Diff Logic**
  - Compare source features vs target features.
  - Include changed fields in `patchPayload`:
    - `has_issues`, `has_projects`, `has_wiki`, `has_discussions`
    - `description`, `homepage`
    - `default_branch` (if target default branch differs and ref exists)
- [x] **Step 3: Lifecycle Implementation**
  - In `discover`: Extract fields from GitHub API response (`raw.has_issues`, `raw.has_projects`, `raw.has_wiki`, `raw.has_discussions`, `raw.description`, `raw.homepage`, `raw.default_branch`).
  - In `plan`: Generate update operation with detailed reasons if any flags drift.
  - In `apply`: Issue `PATCH /repos/{owner}/{repo}` via `ctx.targetWriteClient` (or log in dry-run).
  - In `verify`: Inspect target repo, compare all flags, and report discrepancies for any mismatch.
- [x] **Step 4: Deterministic Offline Tests**
  - Add tests for feature flag drift (`has_issues: false -> true`).
  - Add tests for metadata drift (`description`, `homepage`).
  - Add tests for `dryRun === true` ensuring zero mutations.
- [x] **Step 5: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test packages/migration/tests/modules/repo-settings.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Extended `RepoSettingsData` and `RawGitHubRepositoryResponse` with `RepositoryFeatures` (`hasIssues`, `hasProjects`, `hasWiki`, `hasDiscussions`) and `RepositoryCoreMetadata` (`description`, `homepage`, `defaultBranch`).
  - Implemented `parseFeatureSettings`, `parseCoreMetadata`, and `diffRepositoryFeatures` in `pr-settings.ts` to calculate precise diffs and `PATCH` payloads for feature toggles and core metadata.
  - Updated `RepoSettingsMigrationModule` lifecycle:
    - `discover`: Extracts feature flags and core metadata from both live REST calls and cached discovery bundles.
    - `plan`: Reconciles visibility, merge settings, feature toggles, and metadata into unified update operations.
    - `apply`: Safely executes `PATCH /repos/{owner}/{repo}` with full dry-run protection.
    - `verify`: Detects discrepancies between source and target for all feature toggles, description, and homepage.
  - Added unit test suite for feature/metadata drift, dryRun guarantees, and verification discrepancies in `packages/migration/tests/modules/repo-settings.test.ts`.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/modules/repo-settings.test.ts`: 18/18 passing.
  - `npm run check`: 500/500 passing offline tests, 0 lint errors, 0 type errors.
