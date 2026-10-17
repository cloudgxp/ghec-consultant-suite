---
id: TASK-067
title: Repository-Associated Organization Items Filtering & Multi-Org Consolidation
status: completed
owner: agent
created: 2026-10-16
updated: 2026-10-16
packages:
  - '@ghec/contracts'
  - '@ghec/migration'
  - '@ghec/cli'
dependencies:
  - TASK-065
  - TASK-066
---

# TASK-067: Repository-Associated Organization Items Filtering & Multi-Org Consolidation

## 1. Objective

Enable selective and multi-organization consolidation workflows (such as migrating all `public` repositories from several source organizations into a single dedicated public target organization) while migrating **only** the organization-level items associated with the in-scope repositories and preventing global singleton settings from overwriting the consolidated target organization.

## 2. Scope & Affected Packages

- `packages/contracts`:
  - Add `OrgItemsModeSchema` (`'all' | 'associated-only' | 'none'`) to `MigrationScopeSchema` and `OrganizationMappingSchema`.
  - Add optional `sourceIdentifier` to `ModulePlanSchema` and relax `MigrationScopeSchema` so multiple distinct source organizations can map to a shared target organization (`N -> 1` consolidation).
- `packages/migration`:
  - Extend `MigrationScopeTarget` with `orgItemsMode`, `scopedRepositories`, and `isMultiOrgConsolidation`.
  - Add `GLOBAL_SINGLETON_ORGANIZATION_MODULES` (`org-settings`, `actions-policies`, `ip-allow-lists`, `org-webhooks`) and `REPO_ASSOCIATED_ORGANIZATION_MODULES` to `module-resolver.ts`, auto-excluding global singletons when `orgItemsMode === 'associated-only'`.
  - Create `packages/migration/src/core/org-item-filter.ts` and integrate repository-association filtering across Bucket A organization modules (`teams`, `org-variables`, `org-secrets`, `actions-runners`, `org-rulesets`, `org-custom-properties`, `custom-roles`, `packages`, `projects-v2`, `apps-inventory`).
  - Support multi-org `N -> 1` planning, operation ID disambiguation, and live target re-planning in `MigrationPlanner`, `MigrationOrchestrator`, and `VerificationOrchestrator`.
- `apps/cli` & `.github/workflows`:
  - Support comma-separated multi-org `--source org-a,org-b,org-c`, multi-org `--file` repository lists, cross-org repository name collision handling, and `--org-items <all|associated-only|none>` in `generate-scope` and `validate-scope`.
  - Expose `org_items_mode` (`auto`, `associated-only`, `all`, `none`) in `.github/workflows/generate-scope.yml`, `.github/workflows/migration-execute-wave.yml`, and `.github/workflows/migration-e2e-autonomous.yml`.
  - Update operator and customer guides and rebuild the release kit.

## 3. Implementation Checklist

- [x] Update `@ghec/contracts` (`migration-scope.ts`, `migration-plan.ts`, `index.ts`) for `OrgItemsModeSchema`, `N -> 1` org mappings, and `ModulePlan.sourceIdentifier`.
- [x] Add `packages/migration/src/core/org-item-filter.ts` and update `MigrationScopeTarget`, `module-resolver.ts`, `planner.ts`, `migration-orchestrator.ts`, and `verification-orchestrator.ts`.
- [x] Implement `associated-only` filtering and `N -> 1` safety in `teams`, `org-variables`, `org-secrets`, `actions-runners`, `org-rulesets`, `org-custom-properties`, `custom-roles`, `packages`, `projects-v2`, and `apps-inventory`.
- [x] Update `apps/cli/src/commands/generate-scope.ts` for `--org-items <all|associated-only|none>` and multi-source organization consolidation (`--source org-a,org-b` and multi-org `--file`).
- [x] Update GitHub Actions workflows, operator/customer guides, and release kit.
- [x] Add unit and integration tests for `associated-only` org item filtering and multi-org consolidation across `@ghec/contracts`, `@ghec/migration`, and `@ghec/cli`.

## 4. Verification Plan

```bash
npm run check
```

## 5. Architectural Invariants

- Adheres to Zero-Plaintext Local Secrets (DEC-004)
- Strict `@ghec/contracts` Zod validation
- 100% offline deterministic unit tests

## 6. Completion Summary & Evidence

- **Completed:** 2026-10-16
- **Summary:**
  - Extended `@ghec/contracts` (`MigrationScopeSchema`, `OrganizationMappingSchema`, `ModulePlanSchema`) with `OrgItemsModeSchema` (`'all' | 'associated-only' | 'none'`), $N \rightarrow 1$ organization consolidation support, and `sourceIdentifier` on `ModulePlan`.
  - Implemented `packages/migration/src/core/org-item-filter.ts` (`buildOrganizationScopeTarget`, `isAssociatedOnlyOrgMode`, `getScopedSourceRepoNames`, `getScopedTargetRepoNames`, `getScopedTargetRepoName`, `isPublicOnlyTargetScope`, `matchesRulesetRepoNameCondition`) and integrated `associated-only` filtering and additive $N \rightarrow 1$ safety across `module-resolver.ts`, `planner.ts`, `migration-orchestrator.ts`, `verification-orchestrator.ts`, `teams`, `org-variables`, `org-secrets`, `actions-runners`, `org-rulesets`, `org-custom-properties`, `custom-roles`, and `packages`.
  - Updated `generate-scope` and `validate-scope` CLI commands, GitHub Actions workflows (`generate-scope.yml`, `migration-execute-wave.yml`, `migration-e2e-autonomous.yml`), and operator/customer guides (`docs/guides/consultant-operators-manual.md`, `docs/guides/customer-migration-handbook.md`).
- **Verification Output:**
  - `npm run check` passed cleanly (ESLint, Prettier, TypeScript, CLI & Dashboard builds, and 768 passing tests across 132 suites).
  - `npm run build:release-kit` generated updated `dist/ghec-migration-kit-v0.1.0.tar.gz`.
