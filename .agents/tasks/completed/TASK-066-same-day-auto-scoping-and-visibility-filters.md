---
id: TASK-066
title: 'Same-Day Zero-Discovery Scoping, Source Visibility Filtering (all/public/private/internal) & Auto Module Resolution'
status: completed
owner: agent
created_at: 2026-10-16
completed_at: 2026-10-16
dependencies:
  - TASK-065
packages_affected:
  - 'ghec-consultant-cli'
  - '@ghec/migration'
---

# TASK-066: Same-Day Zero-Discovery Scoping, Source Visibility Filtering (all/public/private/internal) & Auto Module Resolution

## 1. Objective & Context

Enable same-day scoping and migration without requiring a multi-hour upfront `discover.yml` scan:

1. **Source Repository Visibility & Fork Filtering (`--source-visibility` & `--exclude-forks`):**
   - Enhance `ghec-consultant-cli generate-scope` (`apps/cli/src/commands/generate-scope.ts`) to filter discovered organization repositories by source visibility (`all`, `public`, `private`, `internal`, or comma-separated combinations like `private,internal`) and fork status (`--exclude-forks`).
   - Support an injectable `repoFetcher` for 100% deterministic offline unit testing.
2. **Default Strategy-Aware Module Resolution (`auto`):**
   - Default `DEFAULT_ORG_MODULES` and `DEFAULT_REPO_MODULES` in `generate-scope` and `modules` in `migration-execute-wave.yml` to `'auto'` so same-day migrations automatically resolve all 15 organization modules and strategy-appropriate repository modules (GEI vs. `--skip-releases` vs. Git LFS vs. `mirror-push`) on the fly.
3. **1-Click Visibility Filtering in GitHub Actions Workflows:**
   - Add `source_visibility` (`all`, `public`, `private`, `internal`) to `generate-scope.yml`, `migration-execute-wave.yml`, and `migration-e2e-autonomous.yml` (and support `repositories: "public" | "private" | "internal"` shorthand).
4. **Operator's Manual Update (`docs/guides/consultant-operators-manual.md`):**
   - Lead with Same-Day Migration (Zero Discovery Required), explain how `auto` module selection works during execution, and document visibility-filtered waves (`all`, `public`, `private`, `internal`).

## 2. Dependencies & Prerequisites

- [x] `TASK-065` completed

## 3. Scope of Changes

- `apps/cli/src/commands/generate-scope.ts`
- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-execute-wave.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `docs/guides/consultant-operators-manual.md`
- `apps/cli/tests/generate-scope-cli.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Add `--source-visibility`, `--exclude-forks`, and `auto` default modules to `generate-scope.ts`**
- [x] **Step 2: Add `source_visibility` inputs and `auto` defaults to workflows**
- [x] **Step 3: Update `docs/guides/consultant-operators-manual.md` for Same-Day Zero-Discovery & Visibility Waves**
- [x] **Step 4: Add offline unit tests in `apps/cli/tests/generate-scope-cli.test.ts` and pass `npm run check`**

## 5. Verification Gate

```bash
node --import tsx --test apps/cli/tests/generate-scope-cli.test.ts
npm run build:release-kit
npm run check
```

## 6. Completion Summary & Evidence

- **Completed Date:** 2026-10-16
- **Verification Output:**
  - `node --import tsx --test apps/cli/tests/generate-scope-cli.test.ts`: 5/5 unit tests passed (including `source-visibility` filtering across `all`, `public`, `private`, `internal`, `private,internal`, `--exclude-forks`, and `auto` module resolution).
  - `npm run build:release-kit`: Built standalone Customer Migration Release Kit (`dist/ghec-migration-kit-v0.1.0.tar.gz`) with updated CLI and manuals.
  - `npm run check`: Passed `lint`, `typecheck`, `build`, and all 762 unit tests across 131 suites (`0 fail`).
