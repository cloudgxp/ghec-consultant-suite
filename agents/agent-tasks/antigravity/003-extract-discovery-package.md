# Task 003: Extract `@ghec/discovery` Headless Package

## Status

complete

## Owner

Antigravity

## Objective

Extract the discovery collectors, aggregators, checkpoint manager, permission checker, and orchestrator from `apps/cli/src/` into a dedicated workspace package: `packages/discovery`. Rewire `apps/cli` to become a thin consumer of `@ghec/discovery`, ensuring the discovery logic can be cleanly imported by the future `@ghec/migration` package.

## Background

Currently, the 11 baseline collectors and `DiscoveryOrchestrator` reside inside `apps/cli`. In the migration architecture, both `ghec-consultant-cli discover` and `ghec-consultant-cli migrate` (in live discovery mode) need to execute discovery. Moving discovery logic into a reusable package avoids duplicating collector code.

## Dependencies

- Task 001: Extract `@ghec/github-client` Shared Package

## Files / Areas Expected to Change

- `package.json` (workspaces registration)
- `packages/discovery/` (new package)
  - `package.json`
  - `tsconfig.json`
  - `src/index.ts`
  - `src/collectors/` (move from `apps/cli/src/collectors/`)
  - `src/engine/` (move `orchestrator.ts`, `checkpoint.ts` from `apps/cli/src/engine/`)
  - `src/permissions/` (move `checker.ts`, `matrix.ts` from `apps/cli/src/permissions/`)
  - `src/output/` (move `publisher.ts`, `sanitizer.ts` from `apps/cli/src/output/`)
- `apps/cli/` (refactor `src/commands/discover.ts` and `src/index.ts` to import from `@ghec/discovery`)

## Requirements

1. Initialize `packages/discovery` with ESM configuration, TypeScript build, and exports map.
2. Transfer collectors, aggregators, permissions, and discovery orchestration into `packages/discovery`.
3. Update all imports within `packages/discovery` to use `@ghec/contracts` and `@ghec/github-client`.
4. Export the public API from `packages/discovery/src/index.ts`:
   - `DiscoveryOrchestrator`, `DiscoveryPlan`, `DiscoveryResult`
   - `collectors`, `Collector`, `CollectorContext`, `CollectorResult`
   - `CheckpointManager`, `PermissionChecker`, `publishBundle`
   - Composite aggregators (`OrgMetadataAggregator`, `RepositoryDeepDiscoveryAggregator`, `TeamHierarchyAndAccessAggregator`)
5. Update `apps/cli/src/commands/discover.ts` and `apps/cli/src/index.ts` to consume `@ghec/discovery`.
6. Verify that `ghec-consultant-cli discover` behavior, arguments, flags, dry-run, output files, and exit codes remain 100% identical.

## Acceptance Criteria

- `packages/discovery` builds cleanly with `npm run build -w @ghec/discovery`.
- `apps/cli` builds cleanly with `npm run build -w ghec-consultant-cli`.
- All 116 existing monorepo tests pass without error (`npm test`).
- Running `ghec-consultant-cli discover --help` and dry-run produces identical output.

## Tests

- Run `npm test` across all workspaces.
- Verify `apps/cli/tests/cli.test.ts` and `apps/cli/tests/orchestrator.test.ts` pass without changes.

## Documentation

- Create `packages/discovery/README.md` detailing public exports.
- Update `agents/agent-communications/handoffs.md` upon completion.

## Risks / Notes

- **Zero Functional Regression:** Ensure no CLI flags or configuration resolution logic are broken during the extraction.

## Completion Notes

- `@ghec/discovery` created at `packages/discovery`; collectors, aggregators, orchestrator, checkpoint manager, permission checker/matrix, and publisher/sanitizer moved with `git mv` (history preserved).
- `DiscoveryPlan` and a new `DiscoveryConfig` now live in the package (`plan.ts`, `config.ts`) so it no longer imports from the CLI. `parseDiscoveryOptions`, `loadConfig` and arg/env handling stay in `apps/cli`; `CliConfig` is an alias of `DiscoveryConfig`.
- `apps/cli/src/index.ts` consumes `DiscoveryOrchestrator` and `PreflightPermissionError` from `@ghec/discovery`. CLI flags, help text, and exit codes are untouched.
- The CLI keeps thin re-export shims at the old module paths used by existing tests (including `apps/dashboard/tests/portfolio.test.ts`, which imports `ORG_REPOSITORIES_QUERY`). See DEC-017.
- `scripts/collectors/probe-api-surface.ts` now reads `packages/discovery/src/engine/orchestrator.ts`.
- Root `build`/`typecheck` build `@ghec/discovery` after `@ghec/github-client` and before the CLI.
- Evidence: `npm run check` green, 116/116; `discover --help`, dry-run, and unknown-command paths verified manually.
