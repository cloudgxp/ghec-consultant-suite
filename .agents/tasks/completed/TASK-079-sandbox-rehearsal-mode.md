---
id: TASK-079
title: 'Implement --sandbox-rehearsal mode for live test migrations into sandbox organizations'
status: completed
owner: agent
created_at: 2026-10-19
dependencies: []
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - '@ghec/cli'
---

# TASK-079: Implement `--sandbox-rehearsal` mode for live test migrations into sandbox organizations

## 1. Objective & Context

Allow operators and consultants to perform a real end-to-end data migration into a dummy/sandbox target organization (`--sandbox-rehearsal` / `sandboxRehearsal: true` / `sandbox_rehearsal: true`) without modifying or locking the source organization, while keeping all Webhooks and GitHub Actions disabled on the target organization and target repositories so no external webhooks fire and no CI/CD workflows execute in the sandbox environment.

## 2. Dependencies & Prerequisites

- [x] Upstream tasks completed or prerequisite PRs merged
- [x] Required tools, fixtures, or environment settings in place

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/contracts/src/scope/migration-scope.ts`
- `packages/contracts/src/plan/migration-plan.ts`
- `packages/migration/src/core/types.ts`
- `packages/migration/src/core/org-item-filter.ts`
- `packages/migration/src/modules/webhooks/reconciler.ts`
- `packages/migration/src/modules/webhooks/module.ts`
- `packages/migration/src/modules/actions-policies/module.ts`
- `packages/migration/src/modules/gei-repo/module.ts`
- `packages/migration/src/strategies/mirror-push/types.ts`
- `packages/migration/src/strategies/mirror-push/executor.ts`
- `packages/migration/src/planner/planner.ts`
- `packages/migration/src/orchestrator/types.ts`
- `packages/migration/src/orchestrator/pipeline.ts`
- `packages/migration/src/orchestrator/migration-orchestrator.ts`
- `packages/migration/src/orchestrator/verification-orchestrator.ts`
- `apps/cli/src/commands/generate-scope.ts`
- `apps/cli/src/commands/plan.ts`
- `apps/cli/src/commands/migrate.ts`
- `apps/cli/src/commands/verify.ts`
- `apps/cli/src/index.ts`
- `.github/workflows/generate-scope.yml`
- `.github/workflows/migration-execute-wave.yml`
- `.github/workflows/migration-e2e-autonomous.yml`
- `docs/guides/consultant-operators-manual.md`
- `docs/guides/ghec-to-emu-test-migration-setup.md`
- `packages/migration/tests/`
- `apps/cli/tests/`

## 4. Implementation Checklist

- [x] **Step 1: Interface / Schema definition**
  - Add `sandboxRehearsal: z.boolean().optional()` to `MigrationScopeSchema`, `OrganizationMappingSchema`, `RepositoryMappingSchema`, `RepositoryOptionsSchema`, and `MigrationPlanSchema` in `@ghec/contracts`.
- [x] **Step 2: Core implementation**
  - Propagate `sandboxRehearsal` through `MigrationScopeTarget`, `MigrationContext`, `MigrationPlanner`, `MigrationOrchestrator`, `RepositoryMigrationPipeline`, and `VerificationOrchestrator`.
  - Force target repository and organization webhooks to `active: false` in `plan`, `apply`, and `verify` when `sandboxRehearsal` is enabled.
  - Force organization Actions permissions (`enabled_repositories: 'none'`) in `ActionsPoliciesMigrationModule` and disable repository Actions (`PUT /repos/{owner}/{repo}/actions/permissions` with `{ enabled: false }`) after repo creation/import when `sandboxRehearsal` is enabled.
  - Expose `--sandbox-rehearsal` on `generate-scope`, `validate-scope`, `plan`, `migrate`, and `verify` CLI commands and `sandbox_rehearsal` in GitHub Actions workflows.
  - Document `--sandbox-rehearsal` in user guides following `consultant-style-docs`.
- [x] **Step 3: Deterministic offline tests**
  - Add unit tests in `packages/migration/tests/` and `apps/cli/tests/` covering `sandboxRehearsal` behavior across webhooks, actions-policies, gei-repo, and CLI commands.
- [x] **Step 4: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps via `npm run check`.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- **Completion Date:** 2026-10-19
- **Execution Summary:**
  - Added `sandboxRehearsal` schema fields to `@ghec/contracts` (`MigrationScopeSchema`, `OrganizationMappingSchema`, `RepositoryMappingSchema`, `RepositoryOptionsSchema`, and `MigrationPlanSchema`).
  - Added `isSandboxRehearsal(ctx)` helper and propagated `sandboxRehearsal` across `MigrationPlanner`, `MigrationOrchestrator`, `RepositoryMigrationPipeline`, and `VerificationOrchestrator`.
  - Updated `WebhooksMigrationModule` (`webhooks` & `org-webhooks`), `ActionsPoliciesMigrationModule`, `GeiRepoMigrationModule`, and `MirrorPushExecutor` so that sandbox rehearsal migrations keep all target webhooks (`active: false`) and GitHub Actions (`enabled_repositories: 'none'` on the org and `enabled: false` per repository) disabled and verify that disabled state during `verify()`.
  - Added `--sandbox-rehearsal` to `generate-scope`, `validate-scope`, `plan`, `migrate`, and `verify` CLI commands, and added `sandbox_rehearsal` workflow inputs to `generate-scope.yml`, `migration-execute-wave.yml`, and `migration-e2e-autonomous.yml`.
  - Documented `--sandbox-rehearsal` in `docs/guides/consultant-operators-manual.md` and `docs/guides/ghec-to-emu-test-migration-setup.md` and added unit test coverage across `@ghec/migration` and `apps/cli`.
- **Verification Evidence:**
  - `npm run check` passed cleanly (ESLint, Prettier, TypeScript build & typecheck, and 806/806 unit tests across 134 suites).
