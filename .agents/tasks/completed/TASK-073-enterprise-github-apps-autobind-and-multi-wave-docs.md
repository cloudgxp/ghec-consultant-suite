---
id: TASK-073
title: 'Enterprise GitHub Apps Slug Matching, Post-Repo Auto-Binding Reconciliation & Multi-Wave Enterprise Documentation'
status: completed
owner: copilot
created_at: 2026-10-18
dependencies: [TASK-072]
packages_affected: ['@ghec/migration']
---

# TASK-073: Enterprise GitHub Apps Slug Matching, Post-Repo Auto-Binding Reconciliation & Multi-Wave Enterprise Documentation

## 1. Objective & Context

Enhance `apps-inventory`, `MigrationOrchestrator`, `migration-execute-wave.yml`, `POST-CARE-CHECKLIST.md`, and the user-facing guides in `docs/guides/` to support multi-organization Enterprise-to-Enterprise (GHEC $\rightarrow$ GHEC-EMU) migrations and deterministic GitHub App repository auto-binding:

1. **Enterprise-Created App Slug Matching & Enterprise URL Helper (`apps-inventory`):**
   - Add `getCandidateTargetAppSlugs(sourceSlug, targetOrg, emuSuffix)` and `buildEnterpriseGitHubAppUrlParametersLink(app, targetEnterprise, baseWebUrl)` in `packages/migration/src/modules/apps-inventory/manifest.ts`.
   - Teach `AppsInventoryMigrationModule.plan()` and `verify()` to match not only `{app_slug}` and `{app_slug}-{targetOrg}`, but also Enterprise-level recreated slugs `{app_slug}-emu`, `{app_slug}-{emuShortcode}`, and `{app_slug}-{emuShortcode}-emu` so an Enterprise-owned app recreated once at the target Enterprise level matches and auto-binds repositories across every organization wave.
2. **Post-Repository Auto-Binding Reconciliation (`MigrationOrchestrator` & `migration-execute-wave.yml`):**
   - In `MigrationOrchestrator.run()`, if `apps-inventory` has `github_app_repository_binding` operations and repositories are freshly migrated in the same wave (`freshlyMigratedTargets.size > 0`), re-apply `apps-inventory` repository bindings after repository creation completes so `PUT /user/installations/{installation_id}/repositories/{repository_id}` finds the newly created repositories even in a single-pass `migrate` execution.
   - In `.github/workflows/migration-execute-wave.yml`, add a post-cohort `apps-inventory` reconciliation step in `aggregate-and-verify` (matching `migration-e2e-autonomous.yml`) before running `verify`.
3. **Actionable Auto-Bind Command & Enterprise App Guidance in `POST-CARE-CHECKLIST.md` (`post-care-generator.ts`):**
   - Update `resolveTargetSettingsLinks()` for `apps-inventory` so `cliCommand` provides the copy-pasteable `gh workflow run migration-execute-wave.yml ... -f repositories=org_only -f modules=apps-inventory -f dry_run=false` command.
   - Update Section 2 of `POST-CARE-CHECKLIST.md` (`## 2. GitHub Apps Requiring Installation or Recreation`) with explicit guidance on (a) recreating shared Enterprise-owned apps once at `https://github.com/enterprises/<enterprise>/settings/apps/new?...` (`{app_slug}-emu`) and (b) running the 15-second `modules="apps-inventory"` workflow after clicking the 1-click links to automatically bind all `selected` repositories.
4. **Update User Guides (`docs/guides/`):**
   - Update `docs/guides/consultant-operators-manual.md`, `docs/guides/customer-migration-handbook.md`, and `docs/guides/github-actions-migration.md` (following `consultant-style-docs` plain-English standards) with sections on recreating GitHub Apps, automatic repository binding, Enterprise-level readiness, and planning multi-wave Enterprise migrations.

## 2. Dependencies & Prerequisites

- [x] `TASK-072` completed

## 3. Scope of Changes

- `packages/migration/src/modules/apps-inventory/manifest.ts`
- `packages/migration/src/modules/apps-inventory/module.ts`
- `packages/migration/src/orchestrator/migration-orchestrator.ts`
- `packages/migration/src/reporting/post-care-generator.ts`
- `.github/workflows/migration-execute-wave.yml`
- `packages/migration/tests/modules/apps-inventory.test.ts`
- `docs/guides/consultant-operators-manual.md`
- `docs/guides/customer-migration-handbook.md`
- `docs/guides/github-actions-migration.md`

## 4. Implementation Checklist

- [x] Part 1: Implement `getCandidateTargetAppSlugs` and `buildEnterpriseGitHubAppUrlParametersLink` in `manifest.ts` and integrate candidate slug matching in `AppsInventoryMigrationModule.plan()` and `verify()`.
- [x] Part 2: Add post-repository `apps-inventory` auto-binding reconciliation to `MigrationOrchestrator.run()` and `.github/workflows/migration-execute-wave.yml`.
- [x] Part 3: Update `post-care-generator.ts` with the copy-pasteable `apps-inventory` auto-bind workflow command and Enterprise-owned app recreation guidance.
- [x] Part 4: Update `docs/guides/consultant-operators-manual.md`, `docs/guides/customer-migration-handbook.md`, and `docs/guides/github-actions-migration.md` adhering to `consultant-style-docs`.
- [x] Part 5: Add unit tests for Enterprise slug matching, Enterprise URL parameters link builder, and post-repo auto-binding reconciliation, and verify `npm run check` passes.

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completed on `2026-10-18`.
- Added `getCandidateTargetAppSlugs` and `buildEnterpriseGitHubAppUrlParametersLink` in `packages/migration/src/modules/apps-inventory/manifest.ts` and updated `AppsInventoryMigrationModule.plan()` and `verify()` in `packages/migration/src/modules/apps-inventory/module.ts` to match Enterprise-recreated slugs (`{app_slug}-emu`, `{app_slug}-{shortcode}`, `{app_slug}-{shortcode}-emu`) in addition to `{app_slug}` and `{app_slug}-{targetOrg}`.
- Fixed `AppsInventoryMigrationModule.apply()` to emit `reason` instead of `error` when `github_app_repository_binding` is `skipped` prior to repository creation, and added automatic post-repository `apps-inventory` reconciliation in `MigrationOrchestrator.run()` (`packages/migration/src/orchestrator/migration-orchestrator.ts`) as well as `aggregate-and-verify` in `.github/workflows/migration-execute-wave.yml`.
- Updated `POST-CARE-CHECKLIST.md` generation in `packages/migration/src/reporting/post-care-generator.ts` and updated `docs/guides/consultant-operators-manual.md`, `docs/guides/customer-migration-handbook.md`, and `docs/guides/github-actions-migration.md`.
- Verified `npm run check` passes cleanly (`788` tests, `133` suites, `0` failures).
