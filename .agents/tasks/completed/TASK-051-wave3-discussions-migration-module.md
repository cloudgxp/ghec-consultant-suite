---
id: TASK-051
title: 'Wave 3 Repository Discussions Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies:
  - TASK-027
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-051: Wave 3 Repository Discussions Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for Repository Discussions (`discussions`) conforming to `discussionsBlueprint` in `packages/migration/src/blueprints/wave3-collaboration.ts`.
This module handles repository-level discussion rehydration:

- Discussions are dropped by GEI during git migration and require GraphQL rehydration.
- Category reconciliation: mapping discussion categories (General, Q&A, Ideas, Show and tell).
- Discussion posts: title, body, category attribution, author annotations for EMU mannequin attribution preservation (`EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT`).
- Scope level: `'repository'`, dependencies: `['repo-settings']`.

Lifecycle stages:

- `discover`: query source GraphQL `repository.discussions` and `repository.discussionCategories`
- `plan`: diff against target repository discussions and categories, emit discrete `CREATE_DISCUSSION_CATEGORY` and `CREATE_DISCUSSION` operations with idempotent keys
- `apply`: execute mutations via `targetWriteClient` (GraphQL mutation `createDiscussion`), supporting dry-run
- `verify`: audit destination state against planned discussions and return structured discrepancies (MEDIUM severity)

## 2. Dependencies & Prerequisites

- [x] Wave 1 and Wave 2 modules completed and verified
- [x] Blueprint defined in `wave3-collaboration.ts`

## 3. Scope of Changes

- `packages/migration/src/modules/discussions/types.ts`
- `packages/migration/src/modules/discussions/module.ts`
- `packages/migration/src/modules/discussions/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/discussions.test.ts`
- `packages/contracts/src/gap-ledger/catalog.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `DiscussionCategory`, `DiscussionItem`, `DiscussionsData`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx)` querying repository discussions and categories.
  - Implement `plan(ctx, sourceData)` diffing discussions by title and category with author attribution.
  - Implement `apply(ctx, plan)` with dry-run support via `targetWriteClient`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult`.
- [x] **Step 3: Module registration & gap ledger catalog update**
  - Register `DiscussionsMigrationModule` in `ModuleRegistry` (`dependencies: ['repo-settings']`).
  - Update `catalog.ts` marking `discussions` as `implemented`.
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/discussions.test.ts` testing all 4 stages, dry-run, author annotation, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/discussions.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completed on 2026-10-12.
- Implemented `DiscussionsMigrationModule` implementing `discover`, `plan`, `apply`, and `verify` across repository discussions and discussion categories.
- Handled `EMU_MANNEQUIN_FAST_TRACK_CONSTRAINT` with clear original author attribution headers in discussion post bodies.
- Registered `DiscussionsMigrationModule` in `ModuleRegistry` (total 31 registered modules) with dependencies on `['repo-settings']`.
- Updated `catalog.ts` marking `discussions` as `implemented`.
- Verified 7 unit tests in `packages/migration/tests/modules/discussions.test.ts` and alignment in `packages/migration/tests/core/gap-registry-alignment.test.ts`.
