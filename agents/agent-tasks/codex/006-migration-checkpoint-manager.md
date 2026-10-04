# Task 006: Migration Checkpoint Manager in `@ghec/migration`

## Status

not-started

## Owner

Codex

## Objective

Implement `MigrationCheckpointManager` in `packages/migration/src/checkpoint/`. Provide atomic JSON persistence, 7-stage lifecycle tracking (Preflight, Target Prep, GEI, Specialized Strategies, API Modules, Post-Migration Reconciliations, Verification), and checkpoint recovery to power `--resume [run-id|latest]`.

## Background

Large enterprise migrations can span hundreds of repositories and take several hours. Network failures, API rate-limit pauses, or process restarts must not require restarting from scratch. The migration checkpoint manager safely persists in-flight state to disk using atomic writes and provides fast resumption across all migration phases.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`

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
   - `repositories`: record of repository migration stages:
     - `preflight`: `{ status: 'pending' | 'evaluated' | 'failed', assessment?: unknown }`
     - `targetPrep`: `{ status: 'pending' | 'completed' | 'failed' }`
     - `gei`: `{ status: 'pending' | 'in-progress' | 'completed' | 'failed', migrationId?: string, skippedReleases?: boolean, error?: string }`
     - `specializedStrategies`: record of `{ status: 'completed' | 'failed' | 'skipped', error?: string }` for `'git-lfs'` and `'releases-fallback'`
     - `apiModules`: record of `{ status: 'completed' | 'failed' | 'skipped', error?: string }` per module ID
     - `postMigration`: record of `{ status: 'completed' | 'failed' | 'skipped', error?: string }` for `'repo-visibility'`, `'webhooks'`, `'mannequins'`, `'codeowners'`
     - `verification`: `{ status: 'pending' | 'passed' | 'failed', reportUri?: string }`
4. Implement query helpers:
   - `isRepositoryCompleted(repoName: string): boolean`
   - `isStageCompleted(repoName: string, stage: string): boolean`
   - `isModuleCompleted(repoName: string, moduleId: string): boolean`
   - `recordStageResult(repoName: string, stage: string, result: unknown): void`
   - `recordModuleResult(repoName: string, moduleId: string, result: ModuleExecutionResult): void`
5. Implement locate helper: `MigrationCheckpointManager.locate(searchDirs, runIdOrLatest)`.
6. Implement cleanup helper: `cleanup(runId: string): void`.

## Acceptance Criteria

- Unit tests verify atomic writing, manifest creation, stage transitions across all 7 stages, and resume state loading.
- Resuming after simulated interruption during Stage 4 or 5 loads completed stages without re-executing GEI.
- Process crash simulation leaves previous checkpoint intact (no partial file truncation).
- Passes `npm test`.

## Tests

- `packages/migration/tests/checkpoint.test.ts`

## Documentation

- Record implementation notes in `packages/migration/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- Restrict file permissions to `0600` and directories to `0700` to prevent unauthorized read access to state files.

## Completion Notes

_To be filled by Codex upon task completion._
