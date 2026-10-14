---
id: TASK-050
title: 'Wave 2 GitHub Apps Inventory Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies:
  - TASK-045
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-050: Wave 2 GitHub Apps Inventory Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for GitHub Apps & Integrations Inventory (`apps-inventory`) conforming to `appsInventoryBlueprint` in `packages/migration/src/blueprints/wave2-infrastructure.ts`.
This module handles organization-level third-party apps and integrations:

- Since third-party GitHub Apps cannot be programmatically installed across organizations via API (requiring OAuth or manual enterprise owner consent), this module operates in **operator advisory mode**.
- Query `GET /orgs/{org}/installations`.
- Compare installed apps by `app_slug`.
- Emit planned actions `EMIT_REINSTALLATION_ADVISORY` with detailed app metadata, installation URLs, permissions, and event subscriptions.
- Apply stage records advisory reports and summaries without executing unauthorized or impossible mutations.
- Verify stage audits whether target org has the expected apps installed and with matching permissions, reporting discrepancies (MEDIUM severity).

## 2. Dependencies & Prerequisites

- [x] Wave 1 modules completed and verified (specifically `org-settings`)
- [x] Blueprint defined in `wave2-infrastructure.ts`

## 3. Scope of Changes

- `packages/migration/src/modules/apps-inventory/types.ts`
- `packages/migration/src/modules/apps-inventory/module.ts`
- `packages/migration/src/modules/apps-inventory/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/apps-inventory.test.ts`
- `packages/contracts/src/gap-ledger/catalog.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `AppInstallationState`, `AppsInventoryData`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx)` querying `GET /orgs/{org}/installations`.
  - Implement `plan(ctx, sourceData)` diffing installed apps and generating advisories.
  - Implement `apply(ctx, plan)` with dry-run support in operator advisory mode.
  - Implement `verify(ctx, plan)` auditing target installations and permissions.
- [x] **Step 3: Module registration & gap ledger catalog update**
  - Register `AppsInventoryMigrationModule` in `ModuleRegistry` (`dependencies: ['org-settings']`).
  - Update `catalog.ts` marking `apps-inventory` as `implemented`.
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/apps-inventory.test.ts` testing all 4 stages, advisory emission, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/apps-inventory.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-12
- Execution Summary: Implemented 4-stage lifecycle `AppsInventoryMigrationModule` operating in operator advisory mode. Emits actionable reinstallation advisories, compares fine-grained app permissions, supports non-mutating apply runs in live and dry-run modes, and provides MEDIUM severity verification discrepancy auditing. Registered in `ModuleRegistry` (30th module) and cataloged as implemented in `GAP_LEDGER_CATALOG`.
- Verification Evidence: All 7 unit tests in `apps-inventory.test.ts` passed; `gap-registry-alignment.test.ts` passed with 30 registered modules.
