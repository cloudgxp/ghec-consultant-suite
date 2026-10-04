# Task 005: Migration Core Framework & Module Registry in `@ghec/migration`

## Status

not-started

## Owner

Antigravity

## Objective

Initialize the `packages/migration` workspace package. Implement the authoritative `MigrationModule` lifecycle contract (`discover`, `plan`, `apply`, `verify`), the `ModuleRegistry`, and topological dependency resolution for migration DAGs.

## Background

To prevent migration modules from coupling tightly to CLI argument parsing, a centralized core framework and registry must manage module lifecycles, execution ordering, and dependency validation.

## Dependencies

- Task 003: Extract `@ghec/discovery` Headless Package
- Task 004: Migration Schemas & Validation in `@ghec/contracts`

## Files / Areas Expected to Change

- `package.json` (workspaces registration)
- `packages/migration/` (new package)
  - `package.json`
  - `tsconfig.json`
  - `src/index.ts`
  - `src/core/`
    - `types.ts`
    - `module.ts`
    - `registry.ts`
    - `dag.ts`
  - `tests/`
    - `registry.test.ts`
    - `dag.test.ts`

## Requirements

1. Initialize `packages/migration` package with ESM and TypeScript configuration.
2. Implement core TypeScript types in `src/core/types.ts`:
   - `MigrationContext`, `ModulePlan`, `PlannedOperation`, `OperationResult`, `ModuleExecutionResult`, `VerificationResult`.
3. Implement `MigrationModule<TDiscovered>` base interface enforcing the 4-stage lifecycle:
   - `discover(ctx, cachedData?)`
   - `plan(ctx, sourceData)`
   - `apply(ctx, plan)`
   - `verify(ctx, plan)`
4. Implement `ModuleRegistry` in `src/core/registry.ts`:
   - Registration and retrieval of modules by ID.
   - Validation that module IDs are unique.
5. Implement topological dependency sorting in `src/core/dag.ts`:
   - Resolves dependencies (e.g. if `rulesets` depends on `gei-repo`, ensures `gei-repo` executes first).
   - Detects circular dependencies and throws clear errors.
6. Write unit tests verifying registration and topological execution ordering with mock modules.

## Acceptance Criteria

- `npm run build -w @ghec/migration` compiles without errors.
- Unit tests in `packages/migration/tests/` verify DAG resolution and error detection for missing or cyclic dependencies.
- Full monorepo check `npm run check` passes.

## Tests

- `packages/migration/tests/registry.test.ts`
- `packages/migration/tests/dag.test.ts`

## Documentation

- Create `packages/migration/README.md` documenting module contracts and registry usage.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- Ensure `packages/migration` does not import `apps/cli`. Keep it completely headless.

## Completion Notes

_To be filled by Antigravity upon task completion._
