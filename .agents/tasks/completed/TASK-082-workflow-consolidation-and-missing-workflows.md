---
id: TASK-082
title: 'GitHub Actions Workflow Consolidation, Missing Workflows & Polish'
status: completed
owner: agent
created_at: 2026-10-20
dependencies:
  - TASK-081
packages_affected:
  - apps/cli
  - apps/dashboard
  - packages/github-client
  - packages/migration
---

# TASK-082: GitHub Actions Workflow Consolidation, Missing Workflows & Polish

## 1. Objective & Context

Consolidate redundant GitHub Actions workflows, standardize all wave execution and Dashboard Web UI dispatch on `migration-e2e-autonomous.yml`, add missing operational workflows (`migration-verify.yml` and `deploy-dashboard-pages.yml` + EMU mannequin reclamation in `post-migration-cutover.yml`), and fix workflow bugs identified in the workflow audit.

## 2. Dependencies & Prerequisites

- [x] `TASK-081` completed
- [x] GitHub Actions Workflows Audit Report reviewed and approved by user

## 3. Scope of Changes

- Remove redundant files:
  - `.github/workflows/seed-dummy-resources.yml`
  - `scripts/seed-dummy-resources.mjs`
  - `.github/workflows/migration-execute-wave.yml`
- Enhance primary wave workflow:
  - `.github/workflows/migration-e2e-autonomous.yml` (add optional `discovery_run_id`, `cached_bundle`, and inline JSON `scope` support)
- Update existing workflows:
  - `.github/workflows/combine-dependabot-prs.yml` (fix `if:` condition on `schedule` trigger)
  - `.github/workflows/discovery-scan.yml` (remove `npm run dev` from step summary)
  - `.github/workflows/generate-scope.yml` (point Next Step summary to `migration-e2e-autonomous.yml`)
  - `.github/workflows/migration-plan-pr.yml` (keep `workflow_dispatch` only, add `scope_run_id` artifact support)
  - `.github/workflows/migration-resume.yml` (resolve latest run from `migration-e2e-autonomous.yml`)
  - `.github/workflows/migration-apply-remediation.yml` (resolve latest run from `migration-e2e-autonomous.yml`, bind `target_environment`, and refresh `migration-audit-results` via `publish-results`)
  - `.github/workflows/post-migration-cutover.yml` (add optional EMU mannequin reclamation via `gh gei reclaim-mannequin` and `scope_run_id` support)
- Add missing workflows:
  - `.github/workflows/migration-verify.yml` (standalone target verification, agentic review, and `migration-audit-results` refresh)
  - `.github/workflows/deploy-dashboard-pages.yml` (deploy Assessment & Operations Web UI + latest discovery/audit evidence to GitHub Pages)
- Update Dashboard Web UI, Release Kit Builder, Tests & Guides:
  - `apps/dashboard/src/features/MigrationControlPlaneTab.tsx`
  - `apps/dashboard/src/features/LiveConsoleTab.tsx`
  - `apps/dashboard/src/components/ModuleTriggerModal.tsx`
  - `apps/dashboard/src/components/ScopeBuilderModal.tsx`
  - `packages/github-client/src/actions/service.ts`
  - `packages/migration/src/reporting/post-care-generator.ts`
  - `scripts/build-release-kit.mjs`
  - `apps/cli/tests/workflow-gates.test.ts`
  - `docs/guides/operators/*.md` and `docs/guides/developers/*.md`

## 4. Implementation Checklist

- [x] **Step 1: Remove Redundant Workflows & Scripts**
  - Remove `.github/workflows/seed-dummy-resources.yml`, `scripts/seed-dummy-resources.mjs`, and `.github/workflows/migration-execute-wave.yml`.
- [x] **Step 2: Enhance `migration-e2e-autonomous.yml` & Existing Workflows**
  - Add `discovery_run_id`, `cached_bundle`, and inline JSON `scope` support to `migration-e2e-autonomous.yml`.
  - Fix `combine-dependabot-prs.yml`, `discovery-scan.yml`, `generate-scope.yml`, `migration-plan-pr.yml`, `migration-resume.yml`, `migration-apply-remediation.yml`, and `post-migration-cutover.yml` (including EMU mannequin reclamation).
- [x] **Step 3: Author Missing Workflows (`migration-verify.yml` & `deploy-dashboard-pages.yml`)**
  - Create `.github/workflows/migration-verify.yml` for standalone verification and `migration-audit-results` refresh.
  - Create `.github/workflows/deploy-dashboard-pages.yml` for deploying the Assessment & Operations Web UI to GitHub Pages.
- [x] **Step 4: Update Dashboard Web UI, Release Kit Builder, Tests & Documentation**
  - Point Dashboard Web UI components and `GitHubActionsService` to `migration-e2e-autonomous.yml`.
  - Update `scripts/build-release-kit.mjs` `OPERATIONAL_WORKFLOWS` list.
  - Update `apps/cli/tests/workflow-gates.test.ts` and operator/developer guides.
- [x] **Step 5: Verification & PR Update**
  - Run `npm run check`, `npm run build:release-kit`, and `node --import tsx scripts/verify-doc-references.ts`, then commit, push, and watch PR #143 checks.

## 5. Verification Gate

```bash
npm run check
npm run build:release-kit
node --import tsx scripts/verify-doc-references.ts
```

## 6. Completion Summary & Evidence

- **Completed At:** 2026-10-20
- **Verification Results:**
  - `node --import tsx scripts/verify-doc-references.ts` passed with 0 broken links across all markdown documents.
  - `npm run build:release-kit` packaged all 9 operational workflows (`discovery-scan.yml`, `deploy-dashboard-pages.yml`, `generate-scope.yml`, `migration-plan-pr.yml`, `migration-e2e-autonomous.yml`, `migration-verify.yml`, `migration-resume.yml`, `migration-apply-remediation.yml`, `post-migration-cutover.yml`, `seed-demo-content.yml`, `teardown-target-sandbox.yml` — 11 total workflow files) into the zero-source Customer Migration Release Kit.
  - `npm run check` passed cleanly (ESLint, Prettier, TypeScript typecheck, and 810 unit tests across 134 suites with 0 failures).
