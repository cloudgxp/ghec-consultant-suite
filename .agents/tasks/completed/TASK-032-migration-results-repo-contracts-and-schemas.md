---
id: TASK-032
title: 'migration-results-repo-contracts-and-schemas'
status: completed
owner: agent
created_at: 2026-10-08
dependencies: []
packages_affected:
  - '@ghec/contracts'
---

# TASK-032: Migration Results Repo Contracts and Schemas

## 1. Objective & Context

When running full organization migrations using `gh gei migrate-org`, GitHub Enterprise Importer automatically generates an audit repository named `gei-migration-results` in the destination organization containing run logs, a `README.md` summary, a `/success/` folder for repositories migrated without issue, and a `/failure/` folder for repositories encountering blockers or errors.

To provide parity and an authoritative, centralized post-migration visibility experience for the `ghec-consultant-suite`, this task defines the formal data contracts, types, and Zod schemas in `@ghec/contracts` for generating, validating, and persisting the migration results repository manifest and file models.

This conforms to **DEC-004** (Zero-Exposure Secret Boundary) and **Invariant: Contracts, Schemas & Immutability** (`.agents/rules/contracts-and-schemas.md`).

## 2. Dependencies & Prerequisites

- [x] Repository quality gate passes cleanly (`npm run check`).
- [x] No secret or credential exposure in contracts or test fixtures.

## 3. Scope of Changes

- `packages/contracts/src/results/results-repo-manifest.ts`: Zod schema and TypeScript interfaces for the results repository manifest and per-repository status records.
- `packages/contracts/src/index.ts`: Re-export manifest schemas, types, and validator functions (`validateMigrationResultsManifest`).
- `packages/contracts/tests/results-repo-manifest.test.ts`: Offline deterministic unit tests validating compliant and non-compliant payloads.

## 4. Implementation Checklist

- [x] **Step 1: Interface & Schema definition**
  - Define `RepositoryMigrationRecordSchema` representing individual repository outcome:
    - `sourceRepo: string`
    - `targetRepo: string`
    - `status: z.enum(['succeeded', 'failed'])`
    - `relativeFilePath: string` (e.g., `success/<repo>.md` or `failure/<repo>.md`)
    - `durationMs: number`
    - `stagesRun: string[]`
    - `verified: boolean`
    - `discrepancyCount: number`
    - `failureReason?: string`
    - `failedStage?: string`
    - `failedMetadataCategories?: string[]`
    - `warnings: string[]`
    - `remediationCommands?: string[]`
  - Define `MigrationResultsManifestSchema`:
    - `schemaVersion: z.literal(MIGRATION_SCHEMA_VERSION)`
    - `runId: string`
    - `generatedAt: string`
    - `sourceOrg: string`
    - `targetOrg: string`
    - `targetResultsRepo: string` (default: `gei-migration-results`)
    - `executionMode: z.enum(['dry-run', 'live'])`
    - `summary`:
      - `totalRepositories: number`
      - `succeededCount: number`
      - `failedCount: number`
      - `successRatePercent: number`
      - `durationMs: number`
      - `orgModulesSummary`: Record of org-level modules with op counts and statuses
    - `repositories: RepositoryMigrationRecordSchema[]`
  - Enforce cross-field validation rules (e.g. `succeededCount + failedCount === totalRepositories`, relative file paths match status folder, failed repos require failure reasons).

- [x] **Step 2: Core Export & Validator Implementation**
  - Export `validateMigrationResultsManifest` in `packages/contracts/src/index.ts`.
  - Export all types: `MigrationResultsManifest`, `RepositoryMigrationRecord`, `MigrationResultsSummary`.

- [x] **Step 3: Deterministic Offline Unit Tests**
  - Author `packages/contracts/tests/results-repo-manifest.test.ts` using `node:test` and `node:assert/strict`.
  - Test valid manifest parsing and inference.
  - Test schema rejections: negative counts, count mismatches, invalid path schemes, and invalid status transitions.

- [x] **Step 4: Quality Gate Verification**
  - Validate with `npm run check`.

## 5. Verification Gate

```bash
# Full monorepo quality gate
npm run check

# Targeted contracts test suite
node --import tsx --test packages/contracts/tests/results-repo-manifest.test.ts
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-08
- Execution Summary:
  - Created `packages/contracts/src/results/results-repo-manifest.ts` defining `RepositoryMigrationRecordSchema`, `MigrationResultsSummarySchema`, `OrgModuleResultSummarySchema`, and `MigrationResultsManifestSchema` with strict cross-field validation rules (path conventions, status vs failure reason, discrepancy counts, repository count balances).
  - Exported schemas, types, and validator `validateMigrationResultsManifest` in `packages/contracts/src/index.ts`.
  - Implemented 9 deterministic offline unit tests in `packages/contracts/tests/results-repo-manifest.test.ts`.
- Verification Evidence:
  - `node --import tsx --test packages/contracts/tests/results-repo-manifest.test.ts`: 9 tests passed cleanly.
  - `npm test`: 525 tests passed cleanly across the monorepo.
  - `npm run lint && npm run typecheck`: Passed cleanly.
