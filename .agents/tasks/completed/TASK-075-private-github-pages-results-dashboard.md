---
id: TASK-075
title: 'Private GitHub Pages Results Dashboard'
status: completed
owner: agent
created_at: 2026-10-18
dependencies: []
packages_affected:
  - '@ghec/dashboard'
  - '@ghec/migration'
  - 'ghec-consultant-cli'
---

# TASK-075: Private GitHub Pages Results Dashboard

## 1. Objective & Context

Whenever `publish-results` creates or updates the results repository (`migration-audit-results`) after a discovery scan, dry-run plan, or live migration wave, bundle the static `@ghec/dashboard` (`index.html`, `assets/*`, and `.nojekyll`) alongside `evidence/*.json` on `main`, and automatically configure and build a **Private GitHub Pages** site (`build_type: "legacy"`, `public: false`) using the existing Classic PAT (`repo` scope).

When an authenticated organization member opens the Private GitHub Pages URL, the dashboard automatically hydrates from `./evidence/discovery-bundle.json` and `./evidence/verification-report.json` over their session cookie without requiring local setup (`npm run dev`), manual file uploads, or client-side tokens (preserving DEC-004 Zero-Exposure Secret Boundary).

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-064`, `TASK-065`)
- [x] `@ghec/dashboard` builds static assets into `apps/dashboard/dist`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `apps/dashboard/vite.config.ts`
- `apps/dashboard/scripts/check-bundle-size.mjs`
- `apps/dashboard/src/lib/importer.ts`
- `apps/dashboard/src/main.tsx`
- `apps/dashboard/src/features/VerificationTab.tsx`
- `apps/dashboard/src/components/VerificationDiffInspector.tsx`
- `apps/dashboard/tests/hosted-evidence.test.ts`
- `packages/migration/src/reporting/results-repo-publisher.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/src/reporting/results-markdown-formatter.ts`
- `packages/migration/tests/reporting/results-repo-publisher.test.ts`
- `apps/cli/src/commands/publish-results.ts`
- `apps/cli/tests/publish-results.test.ts`
- `scripts/build-release-kit.mjs`
- `package.json`

## 4. Implementation Checklist

- [x] **Step 1: Relative asset paths & auto-hydration in `@ghec/dashboard`**
  - Set `base: './'` in `apps/dashboard/vite.config.ts` and update `apps/dashboard/scripts/check-bundle-size.mjs` to match relative `./assets/` paths.
  - Add startup auto-hydration in `apps/dashboard/src/lib/importer.ts` (`probeHostedEvidence`) and `apps/dashboard/src/main.tsx` to fetch `./evidence/discovery-bundle.json` and `./evidence/verification-report.json` when available, passing `initialReport` to `VerificationTab` and falling back cleanly to `FileUpload` on 404.
- [x] **Step 2: Private GitHub Pages provisioning in `@ghec/migration`**
  - Add `ensurePagesSite()` to `MigrationResultsRepoPublisher` (`GET /repos/{owner}/{repo}/pages`, `POST /repos/{owner}/{repo}/pages` with `build_type: 'legacy'`, `PUT /repos/{owner}/{repo}/pages` with `public: false, https_enforced: true`, and `POST /repos/{owner}/{repo}/pages/builds`).
  - Surface `pagesUrl` in `PublishCommitResult`, `README.md`, `evidence/README.md`, and `$GITHUB_STEP_SUMMARY`.
- [x] **Step 3: Bundle dashboard static assets in `publish-results` & Release Kit**
  - Collect compiled `@ghec/dashboard/dist` files (`index.html`, `assets/*`, and `.nojekyll`) in `apps/cli/src/commands/publish-results.ts` (with `--no-pages` / `--dashboard-dir` options).
  - Include `apps/dashboard/dist` in `scripts/build-release-kit.mjs` and root `build:release-kit` script.
- [x] **Step 4: Deterministic offline tests & quality gate verification**
  - Add unit tests in `packages/migration/tests/reporting/results-repo-publisher.test.ts`, `apps/cli/tests/publish-results.test.ts`, and `apps/dashboard/tests/hosted-evidence.test.ts`.
  - Pass `npm run check`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Task-specific test commands
node --import tsx --test packages/migration/tests/reporting/results-repo-publisher.test.ts
node --import tsx --test apps/cli/tests/publish-results.test.ts
node --import tsx --test apps/dashboard/tests/hosted-evidence.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-18
- **Execution Summary:**
  - Configured `@ghec/dashboard` (`vite.config.ts`) to build relative asset URLs (`base: './'`) and added `probeHostedEvidence()` in `apps/dashboard/src/lib/importer.ts` so the dashboard automatically loads `./evidence/discovery-bundle.json` and `./evidence/verification-report.json` on startup when served from GitHub Pages, while falling back cleanly to manual drag-and-drop on `localhost`.
  - Extended `MigrationResultsRepoPublisher` (`packages/migration/src/reporting/results-repo-publisher.ts`) with `ensurePagesSite()` to create and update Private GitHub Pages sites (`build_type: 'legacy'`, `source: { branch: 'main', path: '/' }`, `public: false`, `https_enforced: true`) and trigger builds (`POST /repos/{owner}/{repo}/pages/builds`) using the existing Classic PAT (`repo` scope), with non-fatal degradation when Pages is disabled by organization policy or when GHEC-EMU enforces private visibility by default (`422`).
  - Updated `generateMigrationResults`, `formatResultsReadmeMarkdown`, and `publish-results` CLI command (`--dashboard-dir`, `--no-pages`) to bundle `.nojekyll`, `index.html`, and `assets/*` into the atomic Git Data API commit on `main` and surface the Private GitHub Pages URL in `README.md`, `evidence/README.md`, and `$GITHUB_STEP_SUMMARY`.
  - Updated `scripts/build-release-kit.mjs` and `package.json` so the portable Release Kit bundles `apps/dashboard/dist`.
- **Verification Evidence:**
  - `npm run check` passed cleanly: ESLint (`0 warnings/errors`), Prettier formatting, TypeScript typecheck across all workspaces, production build + bundle size budget check (`111.78 KB gzipped <= 200 KB`), and 794/794 unit tests passing across 134 suites (`0 failed`).
