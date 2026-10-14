---
id: TASK-049
title: 'Wave 2 IP Allow Lists Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies:
  - TASK-045
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-049: Wave 2 IP Allow Lists Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for IP Allow Lists & CIDR Restrictions (`ip-allow-lists`) conforming to `ipAllowListsBlueprint` in `packages/migration/src/blueprints/wave2-infrastructure.ts`.
This module handles organization-level network security controls:

- IP Allow List entries: `cidr`, `name`, `isActive`.
- Diff entries by CIDR block.
- Idempotency key: `ip-allow-{cidr}`.
- Rate limit bucket: `graphql`.
- Verification severity: `CRITICAL`.

Lifecycle stages:

- `discover`: query source GraphQL `organization.ipAllowListEntries` (or REST fallback)
- `plan`: diff against target IP allow list entries, emit discrete `CREATE_IP_ALLOW_LIST_ENTRY` / `UPDATE_IP_ALLOW_LIST_ENTRY` operations with idempotent keys
- `apply`: execute mutations via `targetWriteClient` (GraphQL mutation or REST endpoint), supporting dry-run
- `verify`: audit destination state against planned entries and return structured discrepancies (CRITICAL severity)

## 2. Dependencies & Prerequisites

- [x] Wave 1 modules completed and verified (specifically `org-settings`)
- [x] Blueprint defined in `wave2-infrastructure.ts`

## 3. Scope of Changes

- `packages/migration/src/modules/ip-allow-lists/types.ts`
- `packages/migration/src/modules/ip-allow-lists/module.ts`
- `packages/migration/src/modules/ip-allow-lists/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/ip-allow-lists.test.ts`
- `packages/contracts/src/gap-ledger/catalog.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `IpAllowListEntry`, `IpAllowListsData`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx)` querying organization IP allow list entries.
  - Implement `plan(ctx, sourceData)` diffing entries by CIDR.
  - Implement `apply(ctx, plan)` with dry-run support via `targetWriteClient`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult` with CRITICAL severity on mismatch.
- [x] **Step 3: Module registration & gap ledger catalog update**
  - Register `IpAllowListsMigrationModule` in `ModuleRegistry` (`dependencies: ['org-settings']`).
  - Update `catalog.ts` marking `ip-allow-lists` as `implemented`.
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/ip-allow-lists.test.ts` testing all 4 stages, dry-run, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/ip-allow-lists.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-12
- Execution Summary: Implemented 4-stage lifecycle `IpAllowListsMigrationModule` using typed GraphQL queries and mutations (`createIpAllowListEntry`, `updateIpAllowListEntry`), CIDR-based diffing, migration IP allow list advisories, dry-run support, and CRITICAL severity verification discrepancy reporting. Registered in `ModuleRegistry` (29th module) and cataloged as implemented in `GAP_LEDGER_CATALOG`.
- Verification Evidence: All 7 unit tests in `ip-allow-lists.test.ts` passed; `gap-registry-alignment.test.ts` passed with 29 registered modules.
