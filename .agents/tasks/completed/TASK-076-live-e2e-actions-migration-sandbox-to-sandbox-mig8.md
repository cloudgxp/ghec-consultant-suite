---
id: TASK-076
title: 'Live End-to-End GitHub Actions Migration: sandbox-org to sandbox-mig8 (All 35 Repos Including Archived) & Full Reporting Audit'
status: completed
owner: copilot
created_at: 2026-10-18
completed_at: 2026-10-19
dependencies: [TASK-074, TASK-075]
packages_affected:
  [
    '@ghec/cli',
    '@ghec/migration',
    '@ghec/discovery',
    '@ghec/contracts',
    '@ghec/github-client',
    '@ghec/dashboard',
  ]
---

# TASK-076: Live End-to-End GitHub Actions Migration: sandbox-org to sandbox-mig8 (All 35 Repos Including Archived) & Full Reporting Audit

## 1. Objective & Context

Execute a complete, live end-to-end migration from `sandbox-org` to `sandbox-mig8` (`target_type: ghec`) using only GitHub Actions workflows (`generate-scope.yml` and `migration-e2e-autonomous.yml`), including **all 35 repositories** (the 24 active repositories plus all 11 archived repositories: `WebKit`, `linux`, `llvm-project`, `nixpkgs`, `next.js`, `TypeScript`, `grafana`, `node`, `kubernetes`, `rust`, `runner`), **all organization items**, and **all 34 modules** (15 organization + 19 repository).

Ensure archived repositories are unarchived/deferred during migration so downstream write modules do not fail with `403 Repository was archived so is read-only`, and restored to `archived: true` as the final step and verified cleanly. Also add CSV reporting support (`exports/archived-repositories-skipped.csv`) when archived repositories are excluded from scope (`include_archived: false`) and reflect archived status in repository reports/CSV exports when `include_archived: true`.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed (`TASK-074`, `TASK-075`)
- [x] Target organization `sandbox-mig8` accessible and verified ready for migration from `sandbox-org`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `.github/workflows/migration-execute-wave.yml`
- `apps/cli/src/commands/*`
- `packages/migration/src/orchestrator/*`
- `packages/migration/src/modules/repo-settings/*`
- `packages/migration/src/strategies/*`
- `packages/migration/src/reporting/*`
- `packages/migration/tests/**/*`

## 4. Implementation Checklist

- [x] **Phase 1: Pre-Flight Code Audit & Enhancements (Archived Lifecycle, CSV Reporting & Pages)**
  - Ensure archived repository lifecycle defers `archived: true` or unarchives target repositories until all downstream repository modules complete, then restores `archived: true` at the end and verifies cleanly.
  - Check timeout, disk space, and `mirror-push` (`fast-snapshot`) handling for massive formerly-archived repos (`WebKit`, `linux`, `llvm-project`, `nixpkgs`, `next.js`, `TypeScript`, etc.).
  - Add CSV reporting support (`exports/archived-repositories-skipped.csv`) when `include_archived: false` skips archived source repos, and reflect archived status in repository reports/CSV exports when `include_archived: true`.
  - Add deterministic unit tests, pass `npm run check`, and merge to `main` (including `TASK-075` Private GitHub Pages dashboard changes).
- [x] **Phase 2: Generate Scope via GitHub Actions (`generate-scope.yml`)**
  - Trigger `generate-scope.yml` with `source_org="sandbox-org"`, `target_org="sandbox-mig8"`, `target_type="ghec"`, `scope_type="all_repositories"`, `source_visibility="all"`, `include_archived="true"`, `include_org_resources="true"`, `org_items_mode="all"`.
  - Download and verify `generated-scopes/sandbox-to-sandbox-mig8-all.json` has all **35/35** repositories, `modules: ["auto"]`, and `orgItemsMode: "all"`.
- [x] **Phase 3: Execute Live E2E Migration (`migration-e2e-autonomous.yml`)**
  - Trigger `migration-e2e-autonomous.yml` with `scope_run_id="latest"`, `target_type="ghec"`, `modules="auto"`, `dry_run="false"`.
  - Monitor slicer, parallel cohort workers (`cohort-massive-*` and `cohort-standard-*`), post-cohort reconciliation, verification, and self-healing remediation.
  - Fix any discovered execution, verification, or reporting bugs in closed loop with unit tests, pass `npm run check`, push to `main`, and re-run until 100% clean.
- [x] **Phase 4: Deep Audit of `sandbox-mig8/migration-audit-results`**
  - Download final workflow artifacts and clone `sandbox-mig8/migration-audit-results`.
  - Audit `$GITHUB_STEP_SUMMARY`, `README.md` (`35/35` repos, `34/34` modules, `0` failed operations, `0` discrepancies, Private GitHub Pages link), `POST-CARE-CHECKLIST.md`, `exports/**/*.csv`, `organization/*.md`, `repositories/<repo>/<module>.md`, `success/*.md`, `failure/*.md`, `manifest.json`, and `evidence/*`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-19
- **Execution Summary:**
  - Implemented archived repository lifecycle deferral across `GeiRepoMigrationModule`, `RepoSettingsMigrationModule`, `MigrationOrchestrator`, and `RepositoryMigrationPipeline` so archived source repositories remain unarchived (and have `has_issues: true`) while downstream repository modules (`repo-secrets`, `repo-variables`, `environments`, `webhooks`, `rulesets`, `branch-protection`, `pull-requests`, `issues`, `post-migration-codeowners`, `security`, etc.) apply, then finalize `has_issues: false` (if applicable) and `archived: true` at completion and verify cleanly.
  - Updated `classifyRepository` in `slicer.ts` and `migration-e2e-autonomous.yml` to honor `mirrorPushMode: 'fast-snapshot'` with a `2 GiB` threshold so all 7 repositories `> 2 GiB` (`chromium`, `WebKit`, `linux`, `llvm-project`, `nixpkgs`, `next.js`, `TypeScript`) route to dedicated `cohort-massive-*` workers.
  - Added `SkippedArchivedRepositorySchema`, `partitionDiscoveredRepositories`, `exports/archived-repositories-skipped.csv`, and archived repository badges/headers across `README.md`, `success/<repo>.md`, and `exports/migration-operations-full.csv`.
  - Triggered `generate-scope.yml` (Run `39184096451`) and verified `generated-scopes/sandbox-to-sandbox-mig8-all.json` included all `35/35` repositories (`24` active + `11` archived) and `orgItemsMode: "all"`.
  - Triggered `migration-e2e-autonomous.yml` (Run `39184202225`, `runId: migrate-1792372374870-b42f9c2c`) and verified `sandbox-mig8` and `sandbox-mig8/migration-audit-results` achieved `35/35` repositories migrated (`100%`), `34/34` modules verified, `0` failed operations (`615` total operations: `614` succeeded, `1` skipped, `0` failed), `0` discrepancies, `0` broken relative links across `718` Markdown files (`804` total repository files), all `11` archived repositories restored to `archived: true` on `sandbox-mig8`, and live Private GitHub Pages provisioned at `https://silver-doodle-w9j8wok.pages.github.io/`.
  - Fixed Private GitHub Pages dashboard auto-hydration and CSS styling in `@ghec/dashboard` and `@ghec/migration`:
    - `generateMigrationResults` (`results-generator.ts`) now automatically synthesizes a schema-valid `evidence/discovery-bundle.json` from migration results whenever `--discovery-bundle` is omitted, and `probeHostedEvidence` (`importer.ts`) also synthesizes from `./manifest.json` + `./evidence/migration-scope.json` + `./evidence/verification-report.json` as a fallback so hosted GitHub Pages sites open directly into the Overview / Verification views (`isProbingHosted` / `isHostedMode`) without landing on `<FileUpload />`.
    - Added `data-color-mode="auto" data-light-theme="light" data-dark-theme="dark"` and `<meta name="color-scheme" content="light dark" />` to `apps/dashboard/index.html`, `:root { color-scheme: light dark; }` and `html, body, #root` background/foreground colors to `apps/dashboard/src/styles/index.css`, and compiled all 154+ Primer semantic token utility classes (`.bg-[var(--*)]`, `.text-[var(--*)]`, `.border-[var(--*)]`, `.grid-cols-3`, etc.) with an automated CSS coverage unit test in `apps/dashboard/tests/hosted-evidence.test.ts`.
- **Verification Evidence:**
  - `npm run check`: `tests 799, suites 134, pass 799, fail 0`.
  - GitHub Actions runs: `generate-scope.yml` (`39184096451`) and `migration-e2e-autonomous.yml` (`39184202225`) completed with `success`.
  - GitHub Pages (`sandbox-mig8/migration-audit-results`): updated to commit `9aec68a` with `evidence/discovery-bundle.json` and full Primer CSS bundle.
