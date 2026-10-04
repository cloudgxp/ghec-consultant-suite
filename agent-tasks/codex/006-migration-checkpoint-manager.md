# Task 006: Migration Checkpoint Manager in `@ghec/migration`

## Status

not-started

## Owner

Codex

## Objective

Implement `MigrationCheckpointManager` in `packages/migration/src/checkpoint/`. Provide atomic JSON persistence, execution stage tracking (GEI status, module status, errors), and checkpoint recovery to power `--resume [run-id|latest]`.

## Background

Large enterprise migrations can span hundreds of repositories and take several hours. Network failures, API rate-limit pauses, or process restarts must not require restarting from scratch. The migration checkpoint manager safely persists in-flight state to disk using atomic writes and provides fast resumption.

## Dependencies

- Task 004: Migration Schemas & Validation in `@ghec/contracts`

## Files / Areas Expected to Change

- `packages/migration/src/checkpoint/`
  - `manager.ts`
  - `manifest.ts`
  - `types.ts`
- `packages/migration/tests/checkpoint.test.ts`

## Requirements

1. Define checkpoint directory convention: `./migrations/.checkpoint-<runId>/`.
2. Implement atomic file writing using temporary files (`.tmp`) and atomic `renameSync` to prevent file corruption during sudden interrupts.
3. Manage `manifest.json`:
   - `runId`: string
   - `startedAt`, `updatedAt`: ISO 8601 strings
   - `scope`: `MigrationScope`
   - `repositories`: record of repository migration statuses:
     - `gei`: `{ status: 'pending' | 'in-progress' | 'completed' | 'failed', migrationId?, error? }`
     - `modules`: record of `{ status: 'completed' | 'failed' | 'skipped', error? }` per module ID
4. Implement query helpers:
   - `isRepositoryCompleted(repoName: string): boolean`
   - `isModuleCompleted(repoName: string, moduleId: string): boolean`
   - `recordModuleResult(repoName: string, moduleId: string, result: ModuleExecutionResult): void`
5. Implement locate helper: `MigrationCheckpointManager.locate(searchDirs, runIdOrLatest)`.
6. Implement cleanup helper: `cleanup(runId: string): void`.

## Acceptance Criteria

- Unit tests verify atomic writing, manifest creation, stage transitions, and resume state loading.
- Process crash simulation leaves previous checkpoint intact (no partial file truncation).
- Passes `npm test`.

## Tests

- `packages/migration/tests/checkpoint.test.ts`

## Documentation

- Record implementation notes in `packages/migration/README.md`.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- Restrict file permissions to `0600` and directories to `0700` to prevent unauthorized read access to state files.

## Completion Notes

_To be filled by Codex upon task completion._
