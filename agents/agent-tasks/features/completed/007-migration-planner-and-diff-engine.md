# Task 007: Migration Planning & Diff Engine in `@ghec/migration`

## Status

complete

## Owner

Antigravity

## Objective

Implement the `MigrationPlanner` engine in `packages/migration/src/planner/`. Provide support for calculating migration diffs using either cached discovery bundles or live discovery, aggregating module plans into a validated `MigrationPlan` artifact.

## Background

Before making destructive or privileged API calls in production GHEC-EMU enterprises, operators require an exact dry-run plan. The planning engine coordinates module `plan()` calls and emits an immutable `migration-plan.json` conforming to `MigrationPlanSchema`.

## Dependencies

- Task 004: Migration Schemas & Validation in `@ghec/contracts`
- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`

## Files / Areas Expected to Change

- `packages/migration/src/planner/`
  - `planner.ts`
  - `diff.ts`
  - `index.ts`
- `packages/migration/tests/planner.test.ts`

## Requirements

1. Implement `MigrationPlanner`:
   - Accepts `MigrationScope`, `ModuleRegistry`, `SourceReadClient`, `TargetWriteClient`, and optional `DiscoveryBundle` (cached mode).
   - In cached mode: Validates `DiscoveryBundle` via `validateBundle()` and passes relevant entities to each module's `discover()` method without making source network requests.
   - In live mode: Invokes discovery collectors dynamically against `SourceReadClient`.
2. Iterate through resolved modules across scoped organizations and repositories:
   - Invokes `module.discover()`.
   - Invokes `module.plan()`.
   - Aggregates planned operations (`create`, `update`, `noop`, `skip`, `warn`).
3. Compute plan summary metrics: counts of each operation type.
4. Output strongly validated `MigrationPlan` object matching `MigrationPlanSchema`.
5. Provide helper to write atomic `migration-plan.json` to disk with non-clobber protection.
6. Write unit tests testing diff generation across various mock source/target scenarios (new variable, updated variable, unchanged variable).

## Acceptance Criteria

- `MigrationPlanner` outputs a valid `MigrationPlan` satisfying `validateMigrationPlan()`.
- Unit tests verify cached mode makes 0 network calls to source.
- Unit tests verify accurate computation of `create`, `update`, and `noop` operation counts.
- `npm run check` passes.

## Tests

- `packages/migration/tests/planner.test.ts`

## Documentation

- Update `packages/migration/README.md` with planning workflow instructions.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- Planning must be pure and read-only. It must **never** execute mutations against the target environment.

## Completion Notes

- Implemented `calculateEntityDiff` pure diff utility in `packages/migration/src/planner/diff.ts` with customizable equality and payload builders.
- Implemented `MigrationPlanner` engine in `packages/migration/src/planner/planner.ts` supporting both live discovery and cached discovery (`DiscoveryBundle` validation with 0 source network requests).
- Implemented `writeMigrationPlanFile` for atomic serialization with non-clobber protection.
- Re-exported planner and diff helpers in `packages/migration/src/index.ts`.
- Added unit tests in `packages/migration/tests/planner.test.ts` asserting diff calculation, live vs. cached planning, and atomic writing (7/7 tests passing).
- Verified full quality gate: `npm run check` passes 143/143 tests across all workspaces.
