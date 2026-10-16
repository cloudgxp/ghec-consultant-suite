---
trigger: always_on
description: 'Enforces @ghec/contracts schemas, Zod validation, MIGRATION_SCHEMA_VERSION conformance, and immutable JSON outputs.'
---

# Invariant: Contracts, Schemas & Immutability

## 1. Single Source of Truth

- All data shapes crossing package or process boundaries—including migration scopes, execution plans, verification reports, resumption checkpoints, and discovery evidence bundles—must originate from `@ghec/contracts`.
- Never define duplicate ad-hoc interfaces for resources governed by `@ghec/contracts`.

## 2. Strict Schema Validation

- All inbound and outbound JSON artifacts must be validated against their corresponding Zod schema before consumption or persistence:

  ```ts
  import {
    validateMigrationScope,
    validateVerificationReport,
  } from '@ghec/contracts';

  const validatedScope = validateMigrationScope(rawJson);
  ```

- Every generated manifest and report must include `schemaVersion: MIGRATION_SCHEMA_VERSION` (or matching contract version).

## 3. Immutability & Persistence

- Discovery evidence bundles and migration execution records are immutable audit logs. Once written, they must not be mutated in-place.
- Checkpoint updates write atomic state transitions (`packages/migration/src/checkpoint/`).
- Discrepancy logs in `VerificationReport` must provide precise, diffable `expected` vs `actual` representations.
