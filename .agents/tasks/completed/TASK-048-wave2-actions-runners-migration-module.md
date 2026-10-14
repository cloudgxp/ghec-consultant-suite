---
id: TASK-048
title: 'Wave 2 Actions Self-Hosted Runner Groups Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies:
  - TASK-046
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-048: Wave 2 Actions Self-Hosted Runner Groups Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for Actions Self-Hosted Runner Groups (`actions-runners`) conforming to `actionsRunnersBlueprint` in `packages/migration/src/blueprints/wave2-infrastructure.ts`.
This module handles organization-level self-hosted runner group infrastructure, including:

- `name`: Runner group name (including special handling for default runner group).
- `visibility`: 'all' | 'selected' repository access.
- `allows_public_repositories`: boolean (with EMU policy constraint awareness: disallow public or fallback safely).
- `restricted_to_workflows`: boolean workflow restrictions.
- `selected_workflows`: list of allowed workflow paths.

Lifecycle stages:

- `discover`: query source `GET /orgs/{org}/actions/runner-groups`
- `plan`: diff against target `GET /orgs/{org}/actions/runner-groups`, emit discrete `CREATE_RUNNER_GROUP` and `UPDATE_RUNNER_GROUP` operations with idempotent keys
- `apply`: execute mutations via `POST /orgs/{org}/actions/runner-groups` (or `PATCH` for existing/default groups) using `targetWriteClient`, supporting dry-run
- `verify`: audit destination state against planned runner groups and return structured discrepancies (HIGH severity)

## 2. Dependencies & Prerequisites

- [x] Wave 1 modules completed and verified (specifically `actions-policies`)
- [x] Blueprint defined in `wave2-infrastructure.ts`

## 3. Scope of Changes

- `packages/migration/src/modules/actions-runners/types.ts`
- `packages/migration/src/modules/actions-runners/module.ts`
- `packages/migration/src/modules/actions-runners/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/actions-runners.test.ts`
- `packages/contracts/src/gap-ledger/catalog.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `RunnerGroupDefinition`, `ActionsRunnersData`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx)` querying `GET /orgs/{org}/actions/runner-groups`.
  - Implement `plan(ctx, sourceData)` diffing runner groups with EMU visibility constraints.
  - Implement `apply(ctx, plan)` with dry-run support via `POST`/`PATCH /orgs/{org}/actions/runner-groups`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult`.
- [x] **Step 3: Module registration & gap ledger catalog update**
  - Register `ActionsRunnersMigrationModule` in `ModuleRegistry` (`dependencies: ['actions-policies']`).
  - Update `catalog.ts` marking `actions-runners` as `implemented`.
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/actions-runners.test.ts` testing all 4 stages, dry-run, EMU fallback, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/actions-runners.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-12
- Execution Summary: Implemented 4-stage lifecycle `ActionsRunnersMigrationModule` with EMU public repository creation restriction enforcement, discrete `POST`/`PATCH /orgs/{org}/actions/runner-groups` mutations, dry-run support, and post-migration discrepancy auditing. Registered in `ModuleRegistry` (28th module) and cataloged as implemented in `GAP_LEDGER_CATALOG`.
- Verification Evidence: All 7 unit tests in `actions-runners.test.ts` passed; `gap-registry-alignment.test.ts` passed with 28 registered modules.
