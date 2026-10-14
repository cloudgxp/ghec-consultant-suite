---
id: TASK-046
title: 'Wave 1 Actions Policies & Permissions Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies:
  - TASK-045
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-046: Wave 1 Actions Policies & Permissions Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for Actions Policies & Permissions (`actions-policies`) conforming to `actionsPoliciesBlueprint` in `packages/migration/src/blueprints/wave1-governance.ts`.
This module handles organization-level GitHub Actions execution permissions:

- `enabled_repositories` ('all' | 'none' | 'selected')
- `allowed_actions` ('all' | 'local_only' | 'selected')
- If `allowed_actions === 'selected'`: `github_owned_allowed`, `verified_allowed`, `patterns_allowed`

Lifecycle stages:

- `discover`: query source `GET /orgs/{org}/actions/permissions` (and `/selected-actions` if selected)
- `plan`: diff against target `GET /orgs/{org}/actions/permissions`, emit `SET_ACTIONS_ENABLED_REPOS` and `SET_ALLOWED_ACTIONS` operations
- `apply`: execute mutations via `PUT /orgs/{org}/actions/permissions` (and `PUT /selected-actions` if applicable) using `targetWriteClient`, supporting dry-run
- `verify`: audit destination state against planned permissions and return structured discrepancies

## 2. Dependencies & Prerequisites

- [x] TASK-045 (`org-settings` module foundation)
- [x] Gap ledger manifest and wave 1 blueprints ratified (`wave1-governance.ts`)

## 3. Scope of Changes

- `packages/migration/src/modules/actions-policies/types.ts`
- `packages/migration/src/modules/actions-policies/module.ts`
- `packages/migration/src/modules/actions-policies/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/actions-policies.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `ActionsPoliciesData`, `ActionsPermissionsState`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx, cachedData?)` querying `GET /orgs/{org}/actions/permissions`.
  - Implement `plan(ctx, sourceData)` diffing permission configuration.
  - Implement `apply(ctx, plan)` with dry-run support via `PUT /orgs/{org}/actions/permissions`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult`.
- [x] **Step 3: Module registration**
  - Register `ActionsPoliciesMigrationModule` in `ModuleRegistry` (`dependencies: ['org-settings']`).
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/actions-policies.test.ts` testing all 4 stages, dry-run, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/actions-policies.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-12
- Execution Summary: Implemented 4-stage lifecycle `ActionsPoliciesMigrationModule` handling general actions permissions (`enabled_repositories`, `allowed_actions`) and selected-actions allowlists (`github_owned_allowed`, `verified_allowed`, `patterns_allowed`). Registered in `ModuleRegistry` with dependency on `org-settings` and cataloged as implemented.
- Verification Evidence: All 7 unit tests in `actions-policies.test.ts` passed; `gap-registry-alignment.test.ts` passed with 26 registered modules.
