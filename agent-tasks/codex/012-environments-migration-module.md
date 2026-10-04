# Task 012: Implement `environments` Migration Module

## Status

not-started

## Owner

Codex

## Objective

Build the `environments` migration module in `packages/migration/src/modules/environments/`. Migrate repository deployment environments, protection rules (required reviewers, wait timers), and deployment branch policies.

## Background

GitHub Enterprise Importer (GEI) migrates repository code, issues, and PRs, but does **not** transfer deployment environments or their protection policies. Critical CI/CD workflows fail if target repositories lack matching environment configurations.

## Dependencies

- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/environments/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/environments.test.ts`

## Requirements

1. Implement `EnvironmentsMigrationModule`:
   - `id`: `'environments'`
   - `displayName`: `'Deployment Environments & Protection Rules'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']`
2. `discover(ctx, cachedData?)`:
   - In cached mode: extracts `action-environment` entities for the repository.
   - In live mode: queries `GET /repos/{owner}/{repo}/environments` via `SourceReadClient`.
3. `plan(ctx, sourceData)`:
   - Queries `GET /repos/{owner}/{repo}/environments` on the target.
   - Compares environment names, wait timers, reviewer requirements, and deployment branch policies (`all`, `protected`, `selected`).
   - Maps source reviewer identities (teams/users) through EMU identity mapping rules where applicable.
   - Emits `create`, `update`, or `noop` operations.
4. `apply(ctx, plan)`:
   - Calls `PUT /repos/{owner}/{repo}/environments/{environment_name}` via `TargetWriteClient` with configured protection rules.
5. `verify(ctx, plan)`:
   - Queries target environments and asserts policies and branch rules match.

## Acceptance Criteria

- Unit tests verify environment discovery, reviewer mapping, and idempotent `PUT` calls.
- Verified environments reflect source protection rules.
- `npm run check` passes.

## Tests

- `packages/migration/tests/modules/environments.test.ts`

## Documentation

- Document the module in `packages/migration/src/modules/environments/README.md`.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **EMU Reviewer Mapping:** Reviewer user IDs differ between source and EMU target; handle missing users gracefully with warnings instead of fatal errors.

## Completion Notes

_To be filled by Codex upon task completion._
