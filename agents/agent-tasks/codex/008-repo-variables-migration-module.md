# Task 008: Implement `repo-variables` Migration Module

## Status

completed

## Owner

Codex

## Objective

Build the first concrete targeted API migration module: `repo-variables` under `packages/migration/src/modules/repo-variables/`. Implement the complete 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`) to prove the end-to-end migration module architecture.

## Background

Repository variables represent a clean, non-destructive slice of functionality: unlike secrets, variable values can be read via GitHub API (`GET /repos/{owner}/{repo}/actions/variables`). This allows testing full round-trip discovery, diffing, upserting, and post-migration verification without unblocking the complex secret-value ingestion problem.

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 007: Migration Planning & Diff Engine in `@ghec/migration`

## Files / Areas Expected to Change

- `packages/migration/src/modules/repo-variables/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/repo-variables.test.ts`

## Requirements

1. Implement `RepoVariablesMigrationModule` adhering to `MigrationModule`:
   - `id`: `'repo-variables'`
   - `displayName`: `'Repository Actions Variables'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo']` (or empty when testing independently)
2. `discover(ctx, cachedData?)`:
   - Cached mode: extracts `configuration-metadata` entities where `domain === 'actions'` and `configurationKind === 'variable'` for the repo.
   - Live mode: calls `GET /repos/{owner}/{repo}/actions/variables` via `SourceReadClient`.
3. `plan(ctx, sourceData)`:
   - Calls `GET /repos/{owner}/{repo}/actions/variables` on the target repository via `TargetWriteClient`.
   - Compares variable names and values:
     - Target missing variable -> `create` operation with payload `{ name, value }`.
     - Target has variable with different value -> `update` operation with payload `{ value }`.
     - Target has identical variable -> `noop` operation.
4. `apply(ctx, plan)`:
   - For `create`: calls `POST /repos/{owner}/{repo}/actions/variables` via `TargetWriteClient`.
   - For `update`: calls `PATCH /repos/{owner}/{repo}/actions/variables/{name}` via `TargetWriteClient`.
   - Returns `ModuleExecutionResult`.
5. `verify(ctx, plan)`:
   - Queries `GET /repos/{owner}/{repo}/actions/variables` on target.
   - Validates all planned variables exist and match expected values.
   - Returns `VerificationResult`.

## Acceptance Criteria

- Unit tests mock source and target endpoints, asserting that:
  - Missing variables emit `create` and call `POST`.
  - Changed variables emit `update` and call `PATCH`.
  - Matching variables emit `noop` and send 0 write requests.
  - Verification succeeds when variables match.
- Module registers cleanly in `ModuleRegistry`.
- `npm run check` passes.

## Tests

- `packages/migration/tests/modules/repo-variables.test.ts`

## Documentation

- Document the module in `packages/migration/src/modules/repo-variables/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Idempotency:** Applying an already-applied plan must not error; `noop` must skip write calls.

## Completion Notes

- Implemented `RepoVariablesMigrationModule` adhering to `MigrationModule<RepoVariablesData>` under `packages/migration/src/modules/repo-variables/`.
- Extended `MigrationContext` with optional `TargetWriteClient` / `TargetWriteOperation` seam in `packages/migration/src/core/types.ts`.
- Implemented full 4-stage lifecycle:
  - `discover`: Supports cached `DiscoveryBundle` extraction (`configuration-metadata` entities where `domain === 'actions'` and `configurationKind === 'variable'`) and live API queries via `sourceClient.readEndpoint('/repos/{owner}/{repo}/actions/variables')`.
  - `plan`: Fetches target variables via `targetClient`, diffs source vs target variables, generating `create`, `update`, and `noop` operations conforming to `ModulePlanSchema`.
  - `apply`: Dispatches mutations via `targetWriteClient` (`POST` for `create`, `PATCH` for `update`), skipping writes on `noop`, supporting dry-run execution (`dryRun: true`), and honoring `continueOnError`.
  - `verify`: Re-queries target variables and compares against source/plan, detecting discrepancies and conforming to `ModuleVerificationResultSchema`.
- Exported module from `packages/migration/src/modules/repo-variables/index.ts` and `packages/migration/src/index.ts`.
- Documented module architecture in `packages/migration/src/modules/repo-variables/README.md`.
- Added 8 comprehensive test cases in `packages/migration/tests/modules/repo-variables.test.ts`.
- All checks pass with 182/182 tests green (`npm run check`).
