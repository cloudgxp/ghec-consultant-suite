# Task 004: Migration Schemas & Validation in `@ghec/contracts`

## Status

not-started

## Owner

Codex

## Objective

Extend `packages/contracts` with versioned Zod schemas and validation functions for migration artifacts: `MigrationScopeSchema`, `MigrationPlanSchema`, `PlannedOperationSchema`, `ModuleExecutionResultSchema`, and `VerificationReportSchema`.

## Background

High-stakes enterprise migrations require strict data contracts. Migration scope files define which orgs/repos to move, migration plans define the exact diff before application, and verification reports assert destination state compliance. All must be strongly typed and strictly validated using Zod in `@ghec/contracts`.

## Dependencies

None. (Can start immediately in parallel with Phase 1 tasks).

## Files / Areas Expected to Change

- `packages/contracts/src/`
  - `scope/` (new: `migration-scope.ts`)
  - `plan/` (new: `migration-plan.ts`)
  - `results/` (new: `execution-result.ts`)
  - `verification/` (new: `verification-report.ts`)
  - `index.ts` (re-export new schemas and validation helpers)
- `packages/contracts/tests/` (new schema unit tests)
  - `migration-scope.test.ts`
  - `migration-plan.test.ts`
  - `verification-report.test.ts`

## Requirements

1. Implement `MigrationScopeSchema`:
   - `version: '1.0.0'`
   - `name`: string
   - `enterprise`: optional source and target slugs
   - `organizations`: array of `{ source, target, modules? }`
   - `repositories`: array of `{ sourceOrg, sourceRepo, targetOrg, targetRepo, useGei, modules? }`
   - `identityMapping`: strategy (`'emu-saml'`, `'manual'`, `'pass-through'`), suffix, custom mappings
   - Export `validateMigrationScope(input: unknown)`
2. Implement `MigrationPlanSchema`:
   - `schemaVersion: '1.0.0'`
   - `planId`: string
   - `createdAt`: ISO 8601 timestamp
   - `scopeName`: string
   - `summary`: counts of `create`, `update`, `noop`, `skip`, `warn`
   - `modules`: array of module plans with `PlannedOperationSchema`
   - Export `validateMigrationPlan(input: unknown)`
3. Implement `ModuleExecutionResultSchema` and `VerificationReportSchema`.
4. Ensure all schemas use `.strict()` to reject unknown fields.
5. Create synthetic test fixtures validating conforming payloads and asserting that malformed or cross-tenant mismatched items fail validation.

## Acceptance Criteria

- `npm run build -w @ghec/contracts` succeeds with generated TypeScript declarations.
- New unit tests in `packages/contracts/tests/` pass 100%.
- Existing `DiscoveryBundleSchema` and `validateBundle()` remain unchanged and passing.

## Tests

- `packages/contracts/tests/migration-scope.test.ts`
- `packages/contracts/tests/migration-plan.test.ts`
- `packages/contracts/tests/verification-report.test.ts`

## Documentation

- Document the new schemas in `packages/contracts/README.md`.
- Record handoff in `agent-communications/handoffs.md` upon completion.

## Risks / Notes

- **Version Invariants (ADR 0002):** Schema version must be exact (`1.0.0`). Do not accept arbitrary strings.

## Completion Notes

_To be filled by Codex upon task completion._
