---
id: TASK-063
title: 'GitHub Apps Manifest & URL Parameter Recreation Strategy'
status: completed
owner: agent
created_at: 2026-10-16
completed_at: 2026-10-16
dependencies:
  - TASK-050
packages_affected:
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-063: GitHub Apps Manifest & URL Parameter Recreation Strategy

## 1. Objective & Context

Extend the GitHub Apps migration and advisory subsystems (`AppsInventoryMigrationModule`, `GitHubAppsAdvisoryPlanner`, and `scripts/register-app.mjs`) to support automated custom GitHub App recreation using both the **GitHub App Manifest flow** (`references/github-docs/content/apps/sharing-github-apps/registering-a-github-app-from-a-manifest.md`) and **URL Query Parameters** (`references/github-docs/content/apps/sharing-github-apps/registering-a-github-app-using-url-parameters.md`), while maintaining 100% compatibility with Classic PAT migration workflows and the Zero-Exposure Secret Boundary (`DEC-004`).

Specifically:

1. Synchronize missing `content/apps/sharing-github-apps`, `content/apps/creating-github-apps/writing-code-for-a-github-app`, `content/apps/oauth-apps`, and `content/apps/github-authentication-discovery-endpoints.md` into `references/github-docs/`.
2. Auto-classify discovered GitHub Apps (`third_party`, `custom_private`, `custom_public`) by probing `GET /apps/{app_slug}` alongside `GET /orgs/{org}/installations`.
3. Emit both the **Direct Installation URL** and the **Custom App Recreation artifacts** (1-click URL Query Parameter registration link + pre-populated GitHub App Manifest JSON payload with collision-safe 34-char target app naming) in `AppsInventoryMigrationModule` and `GitHubAppsAdvisoryPlanner`.
4. Support dual-slug matching in `AppsInventoryMigrationModule.plan()` and `verify()` so custom apps recreated on `targetOrg` under their target-suffixed slug (`{app_slug}-{targetOrg}`) pass verification and permission parity checks.
5. Extend `scripts/register-app.mjs` with `--manifest-file` and `--app` options to load a planned/advisory app manifest and execute the 3-step Manifest handshake without persisting plaintext keys to disk.

## 2. Dependencies & Prerequisites

- [x] `TASK-050` (`AppsInventoryMigrationModule` base implementation) completed
- [x] Local GitHub Apps sharing & manifest documentation synchronized in `references/github-docs/content/apps/sharing-github-apps/`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `scripts/sync-github-docs.mjs`
- `references/github-docs/content/apps/`
- `packages/migration/src/modules/apps-inventory/types.ts`
- `packages/migration/src/modules/apps-inventory/manifest.ts`
- `packages/migration/src/modules/apps-inventory/module.ts`
- `packages/migration/src/modules/apps-inventory/index.ts`
- `packages/migration/src/advisory/types.ts`
- `packages/migration/src/advisory/apps-matrix.ts`
- `packages/migration/src/advisory/README.md`
- `scripts/register-app.mjs`
- `packages/migration/tests/modules/apps-inventory.test.ts`
- `packages/migration/tests/advisory/planner.test.ts`
- `apps/cli/tests/register-app.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Synchronize local GitHub Apps documentation**
  - Update `ALLOWLIST` in `scripts/sync-github-docs.mjs` and sync missing `content/apps/` guides.
- [x] **Step 2: Define Manifest & URL Parameter builders and classification types**
  - Create `packages/migration/src/modules/apps-inventory/manifest.ts` with `buildRecreatedAppSlug`, `buildGitHubAppManifest`, and `buildGitHubAppUrlParametersLink`.
  - Update `packages/migration/src/modules/apps-inventory/types.ts` and `packages/migration/src/advisory/types.ts`.
- [x] **Step 3: Enhance `AppsInventoryMigrationModule` (`discover`, `plan`, `verify`) and `GitHubAppsAdvisoryPlanner`**
  - Probe `GET /apps/{app_slug}` during discovery to classify `third_party`, `custom_private`, and `custom_public` apps.
  - Emit both Direct Install URLs and Recreate App URLs + Manifest JSON payloads in plans and CSV/Markdown advisory artifacts.
  - Match either original `app_slug` or recreated `{app_slug}-{targetOrg}` slug in `plan()` and `verify()`.
- [x] **Step 4: Extend `scripts/register-app.mjs` for custom app manifest loading**
  - Add `--manifest-file` and `--app` CLI argument parsing and manifest extraction from plan/advisory JSON files.
- [x] **Step 5: Deterministic offline unit tests & quality gate verification**
  - Add comprehensive unit tests in `apps-inventory.test.ts`, `planner.test.ts`, and `register-app.test.ts`.
  - Pass `npm run check`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
node --import tsx --test packages/migration/tests/modules/apps-inventory.test.ts
node --import tsx --test packages/migration/tests/advisory/planner.test.ts
node --import tsx --test apps/cli/tests/register-app.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- **Completed At:** 2026-10-16
- **Summary:**
  - Synchronized 36 missing GitHub Apps documentation files into `references/github-docs/content/apps/`.
  - Implemented `packages/migration/src/modules/apps-inventory/manifest.ts` with `buildRecreatedAppSlug` (enforcing the 34-char GitHub App name limit), `classifyGitHubApp`, `buildGitHubAppManifest`, and `buildGitHubAppUrlParametersLink`.
  - Updated `AppsInventoryMigrationModule` and `GitHubAppsAdvisoryPlanner` to auto-classify apps (`third_party`, `custom_public`, `custom_private`), emit both Direct Installation URLs and Custom App Recreation artifacts (URL parameters + Manifest JSON), and verify target installations against either the original `app_slug` or recreated `{app_slug}-{targetOrg}` slug.
  - Extended `scripts/register-app.mjs` with `--manifest-file` and `--app` flags and `DEC-004`-compliant secret storage (`GHEC_APP_<SLUG>_ID` and `GHEC_APP_<SLUG>_PRIVATE_KEY`).
- **Verification Output:**
  - `npm run check` passed cleanly (`eslint`, `prettier`, `tsc --noEmit`, `build:apps`, and 751 unit tests passing across 130 suites).
