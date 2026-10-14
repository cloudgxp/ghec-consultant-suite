---
id: TASK-047
title: 'Wave 1 Repository Autolinks Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies: []
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-047: Wave 1 Repository Autolinks Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for Repository Autolinks (`autolinks`) conforming to `autolinksBlueprint` in `packages/migration/src/blueprints/wave1-governance.ts`.
This module handles repository-level external ticket/issue link references:

- `key_prefix`: string (e.g. `JIRA-`, `TICKET-`)
- `url_template`: string (e.g. `https://example.com/ticket/<num>`)
- `is_alphanumeric`: boolean (supports alphanumeric reference identifiers)

Lifecycle stages:

- `discover`: query source `GET /repos/{owner}/{repo}/autolinks`
- `plan`: diff against target `GET /repos/{owner}/{repo}/autolinks` by `key_prefix`, emit `CREATE_AUTOLINK` operations
- `apply`: execute mutations via `POST /repos/{owner}/{repo}/autolinks` using `targetWriteClient`, supporting dry-run
- `verify`: audit destination autolinks against planned definitions and return structured discrepancies

## 2. Dependencies & Prerequisites

- [x] Gap ledger manifest and wave 1 blueprints ratified (`wave1-governance.ts`)

## 3. Scope of Changes

- `packages/migration/src/modules/autolinks/types.ts`
- `packages/migration/src/modules/autolinks/module.ts`
- `packages/migration/src/modules/autolinks/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/autolinks.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `AutolinkState`, `AutolinksMigrationData`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx, cachedData?)` querying `GET /repos/{owner}/{repo}/autolinks`.
  - Implement `plan(ctx, sourceData)` diffing autolinks by key prefix.
  - Implement `apply(ctx, plan)` with dry-run support via `POST /repos/{owner}/{repo}/autolinks`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult`.
- [x] **Step 3: Module registration**
  - Register `AutolinksMigrationModule` in `ModuleRegistry` (`dependencies: ['repo-settings']`).
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/autolinks.test.ts` testing all 4 stages, dry-run, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/autolinks.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-12
- Execution Summary: Implemented 4-stage lifecycle `AutolinksMigrationModule` handling repository external issue autolinks via `GET /repos/{owner}/{repo}/autolinks` and `POST /repos/{owner}/{repo}/autolinks`. Registered in `ModuleRegistry` with dependency on `repo-settings` and cataloged as implemented.
- Verification Evidence: All 7 unit tests in `autolinks.test.ts` passed; `gap-registry-alignment.test.ts` passed with 27 registered modules.
