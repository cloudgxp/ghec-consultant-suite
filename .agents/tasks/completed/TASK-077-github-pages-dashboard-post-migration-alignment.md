---
id: TASK-077
title: 'GitHub Pages Dashboard Post-Migration & Dry-Run Reporting Alignment'
status: completed
owner: agent
created_at: 2026-10-19
dependencies:
  - TASK-075
packages_affected:
  - '@ghec/migration'
  - '@ghec/dashboard'
---

# TASK-077: GitHub Pages Dashboard Post-Migration & Dry-Run Reporting Alignment

## 1. Objective & Context

Align `@ghec/dashboard` with the 3-tier post-migration and dry-run reports (`README.md`, `POST-CARE-CHECKLIST.md`, `organization/*.md`, `success/*.md`, `failure/*.md`, `repositories/*/*.md`, and `exports/*.csv`) so the Private GitHub Pages dashboard serves as the fast, virtualized single pane of glass for discovery, dry-run, and live migration reporting.

Specifically:

1. Emit a unified `./evidence/results-hydration.json` payload in `generateMigrationResults()` (`@ghec/migration`) and hydrate `@ghec/dashboard` from it in `probeHostedEvidence()`, preserving real operational modes (`discovery` vs `dry-run` vs `live`), manifest metrics, post-care items, operation rows, and transfer strategies without injecting misleading placeholder values.
2. Add an interactive, virtualized **Post-Care Checklist** tab (`PostCareChecklistTab.tsx`) with 6 category tabs, priority/scope filters, persistent `localStorage` checkboxes, clickable target GitHub Settings deep links (`settingsUrl`, `secondaryUrl`), and 1-click `cliCommand` copy buttons.
3. Make **Executive Overview** (`OverviewTab.tsx`) and **Repositories** (`RepositoriesTab.tsx`) mode-adaptive with Executive Metrics, Transfer Strategies, the 15 Organization-Level Modules inspector drawer, per-repo migration status/strategy badges, skipped archived repository visibility, and a 19-module Repository Detail Drawer.
4. Enhance **Verification & Audit** (`VerificationTab.tsx`, `VerificationDiffInspector.tsx`) and **Export Center** (`ExportCenterTab.tsx`) to show all 34 verified modules when `0` discrepancies exist, eliminate fake sample drift fallbacks in hosted mode, and expose all Post-Care and Operations CSV exports.
5. Remove local-CLI-only dashboard tabs and action triggers (`MigrationControlPlaneTab`, `LiveConsoleTab`, `ModuleTriggerModal`, `ScopeBuilderModal` local execution triggers) so the dashboard is purpose-built for GitHub Pages compatibility.

## 2. Dependencies & Prerequisites

- [x] `TASK-075` completed (Private GitHub Pages dashboard bundling and relative asset paths)
- [x] Existing reporting pipeline in `packages/migration/src/reporting/`

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/migration/src/reporting/post-care-generator.ts`
- `packages/migration/src/reporting/results-generator.ts`
- `packages/migration/tests/reporting/results-generator.test.ts`
- `apps/dashboard/src/lib/importer.ts`
- `apps/dashboard/src/navigation.ts`
- `apps/dashboard/src/main.tsx`
- `apps/dashboard/src/components/TopAppBar.tsx`
- `apps/dashboard/src/components/AppShell.tsx`
- `apps/dashboard/src/components/FileUpload.tsx`
- `apps/dashboard/src/components/VerificationDiffInspector.tsx`
- `apps/dashboard/src/features/PostCareChecklistTab.tsx`
- `apps/dashboard/src/features/OverviewTab.tsx`
- `apps/dashboard/src/features/RepositoriesTab.tsx`
- `apps/dashboard/src/features/VerificationTab.tsx`
- `apps/dashboard/src/features/ExportCenterTab.tsx`
- `apps/dashboard/src/features/CollectorHealthTab.tsx`
- `apps/dashboard/src/features/SecretsAndVariablesTab.tsx`
- `apps/dashboard/src/features/SecurityAndPoliciesTab.tsx`
- `apps/dashboard/src/features/VirtualizedTeamsAndIdentitiesTab.tsx`
- `apps/dashboard/src/features/ReleasesAndAssetsTab.tsx`
- `apps/dashboard/src/features/PackagesTab.tsx`
- `apps/dashboard/tests/hosted-evidence.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Emit `evidence/results-hydration.json` & Upgrade Dashboard Importer**
  - Define and emit `evidence/results-hydration.json` in `generateMigrationResults()` (`packages/migration/src/reporting/results-generator.ts`) containing `manifest`, `operationalMode`, `postCare` (`items`, `operationRows`, `skippedArchivedRows`), `operationTotals`, and `transferStrategies`.
  - Clean up synthetic `DiscoveryBundle` generation so missing discovery fields are not populated with fake `TypeScript` / `512 KiB` / `ci.yml` values.
  - Extend `probeHostedEvidence()` in `apps/dashboard/src/lib/importer.ts` to fetch `./evidence/results-hydration.json` (plus fallback to `./manifest.json`) and return full `HostedEvidenceResult`.
- [x] **Step 2: Remove Local-CLI-Only Features & Update Navigation**
  - Remove `control-plane` (`MigrationControlPlaneTab`) and `live-console` (`LiveConsoleTab`) from dashboard navigation and remove local CLI execution modals/buttons (`ModuleTriggerModal`, `ScopeBuilderModal` dispatch, `DiscoveryScanTrigger`) across feature tabs.
  - Add `post-care` (`Post-Care Checklist`) to `navigation.ts` and surface the operational mode badge (`Discovery Assessment`, `Dry-Run Plan Report`, `Live Migration Report`) and `sourceOrg ➔ targetOrg` in `TopAppBar.tsx`.
- [x] **Step 3: Build Interactive `PostCareChecklistTab`**
  - Create `apps/dashboard/src/features/PostCareChecklistTab.tsx` using `VirtualizedTable` with 6 category pills, priority/scope/search filters, persistent `localStorage` completion checkboxes, clickable `settingsUrl` & `secondaryUrl` deep links, and 1-click `cliCommand` copy buttons.
- [x] **Step 4: Mode-Adaptive `OverviewTab` & `RepositoriesTab` 3-Tier Drill-Down**
  - Update `OverviewTab.tsx` to render Executive Migration / Dry-Run Summary cards, Transfer Strategies breakdown, and the 15 Organization-Level Modules table with a slide-over inspector drawer showing granular `operationRows`.
  - Update `RepositoriesTab.tsx` to display migration status (`Succeeded`/`Failed`/`Skipped Archived`), strategy badges (`archived`, `mirror-push`, `--skip-releases`, `lfs`), duration, and a slide-over Repository Detail Drawer showing all 19 repo modules and granular items.
- [x] **Step 5: Align `VerificationTab` & `ExportCenterTab` + Offline Tests**
  - Update `VerificationTab.tsx` and `VerificationDiffInspector.tsx` to show all 34 verified modules when `discrepancyCount === 0` and remove fake drift sample fallbacks when hydrated.
  - Add Post-Care CSVs (`post-care-items.csv`, category CSVs, `migration-operations-full.csv`, `archived-repositories-skipped.csv`) to `ExportCenterTab.tsx`.
  - Add/update deterministic offline tests and pass `npm run check`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Task-specific test commands
node --import tsx --test packages/migration/tests/reporting/results-generator.test.ts
node --import tsx --test apps/dashboard/tests/hosted-evidence.test.ts
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-19
- **Execution Summary:**
  - Extended `generateMigrationResults()` in `@ghec/migration` to emit `evidence/results-hydration.json` (`ResultsHydrationPayload`) containing the full `MigrationResultsManifest`, operational mode (`discovery` | `dry-run` | `live`), operation totals, transfer strategy breakdown, per-repository strategy badges, and full post-care deliverables (`items`, `operationRows`, `skippedArchivedRows`).
  - Removed misleading placeholder values (`TypeScript`, `512 KiB`, `ci.yml`) when synthesizing `evidence/discovery-bundle.json` and fallback bundles from migration manifests.
  - Updated `@ghec/dashboard` navigation and components to remove local-CLI-only tabs (`control-plane`, `console`) and action triggers (`DiscoveryScanTrigger`, `ModuleTriggerModal`, `ScopeBuilderModal` dispatch) for 100% static GitHub Pages compatibility.
  - Added the interactive, virtualized `PostCareChecklistTab` with 6 category tabs, browser-persisted `localStorage` completion tracking, contextual operator runbook callouts, slide-over item detail drawer, direct GitHub Settings links, and 1-click CLI command copy.
  - Upgraded `OverviewTab` and `RepositoriesTab` with 3-tier drill-down slide-over drawers for all 15 organization modules and 19 repository modules, plus transfer strategy badges and skipped archived repositories visibility.
  - Updated `VerificationTab`, `VerificationDiffInspector`, and `ExportCenterTab` to display all 34 verified modules when 0 discrepancies exist and expose all 9 Post-Migration & Post-Care CSV deliverables.
- **Verification Evidence:**
  - `npm run format && npm run check` passed with 0 lint/typecheck errors, passing bundle size budget, and 802 / 802 unit tests passing across 134 suites.
