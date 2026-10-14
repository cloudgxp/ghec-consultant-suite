---
id: TASK-052
title: 'Wave 3 Projects v2 (Memex) Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies:
  - TASK-045
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-052: Wave 3 Projects v2 (Memex) Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for Projects v2 / Memex (`projects-v2`) conforming to `projectsV2Blueprint` in `packages/migration/src/blueprints/wave3-collaboration.ts`.
This module handles organization-level Projects v2 boards and custom fields:

- Projects v2 are dropped by GEI during enterprise migrations and require GraphQL rehydration.
- Project creation: title, short description, public/closed state.
- Custom field rehydration: single select, text, number, date, iteration fields.
- Scope level: `'organization'`, dependencies: `['org-settings']`.

Lifecycle stages:

- `discover`: query source GraphQL `organization.projectsV2` with custom fields
- `plan`: diff against target organization Projects v2, emit discrete `CREATE_PROJECT_V2` and `CREATE_PROJECT_FIELD` operations with idempotent keys
- `apply`: execute mutations via `targetWriteClient` (GraphQL mutations `createProjectV2`, `createProjectV2Field`), supporting dry-run
- `verify`: audit destination state against planned projects and custom fields, returning structured discrepancies (HIGH severity)

## 2. Dependencies & Prerequisites

- [x] Wave 1 and Wave 2 modules completed and verified
- [x] Blueprint defined in `wave3-collaboration.ts`

## 3. Scope of Changes

- `packages/migration/src/modules/projects-v2/types.ts`
- `packages/migration/src/modules/projects-v2/module.ts`
- `packages/migration/src/modules/projects-v2/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/projects-v2.test.ts`
- `packages/contracts/src/gap-ledger/catalog.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `ProjectV2FieldDefinition`, `ProjectV2State`, `ProjectsV2Data`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx)` querying organization Projects v2 and custom fields.
  - Implement `plan(ctx, sourceData)` diffing projects by title and custom fields.
  - Implement `apply(ctx, plan)` with dry-run support via `targetWriteClient`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult`.
- [x] **Step 3: Module registration & gap ledger catalog update**
  - Register `ProjectsV2MigrationModule` in `ModuleRegistry` (`dependencies: ['org-settings']`).
  - Update `catalog.ts` marking `projects-v2` as `implemented`.
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/projects-v2.test.ts` testing all 4 stages, dry-run, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/projects-v2.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completed on 2026-10-12.
- Implemented `ProjectsV2MigrationModule` implementing `discover`, `plan`, `apply`, and `verify` across organization Projects v2 and custom fields.
- Automated board reconstruction and field reconciliation (`SINGLE_SELECT`, `DATE`, `NUMBER`, `TEXT`, `ITERATION`) with built-in field filtering.
- Registered `ProjectsV2MigrationModule` in `ModuleRegistry` (total 32 registered modules) with dependencies on `['org-settings']`.
- Updated `catalog.ts` marking `projects-v2` as `implemented`.
- Verified 9 unit tests in `packages/migration/tests/modules/projects-v2.test.ts`, registry alignment in `packages/migration/tests/core/gap-registry-alignment.test.ts`, and DAG ordering in `packages/migration/tests/core/roadmap-dag.test.ts`.
