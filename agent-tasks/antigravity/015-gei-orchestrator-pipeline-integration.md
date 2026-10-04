# Task 015: Orchestrate GEI with Post-GEI API Module Pipeline

## Status

not-started

## Owner

Antigravity

## Objective

Integrate GEI repository migration into `MigrationOrchestrator` in `packages/migration/src/orchestrator/`. Establish the end-to-end repository pipeline: Preflight Checks $\rightarrow$ GEI Migration $\rightarrow$ Post-GEI API Rehydration (variables, secrets, rulesets, environments) $\rightarrow$ Verification.

## Background

Migrating a repository is not a single API call: it requires preparing destination permissions, executing GEI for repository git content, waiting for GEI completion, and immediately executing all targeted API modules to restore configuration. The orchestrator coordinates this multi-stage workflow across all repositories in the scope.

## Dependencies

- Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands
- Task 013: Implement `rulesets` and `branch-protection` Migration Modules
- Task 014: GEI Preflight & Process Execution Wrapper

## Files / Areas Expected to Change

- `packages/migration/src/orchestrator/`
  - `orchestrator.ts`
  - `pipeline.ts`
  - `types.ts`
- `packages/migration/tests/orchestrator/pipeline.test.ts`

## Requirements

1. Implement `RepositoryMigrationPipeline`:
   - Stage 1 (Preflight): Verifies target org exists, target repository name is available, and credentials have admin rights.
   - Stage 2 (GEI Execution): Calls `GeiProcessExecutor` to transfer Git history, PRs, and issues. Updates checkpoint manifest upon completion.
   - Stage 3 (Post-GEI API Rehydration): For each selected API module (`repo-variables`, `repo-secrets`, `rulesets`, `environments`), executes `module.plan()` and `module.apply()`.
   - Stage 4 (Verification): Calls `module.verify()` and aggregates the verification status.
2. Checkpoint Integration:
   - Records each stage transition in `MigrationCheckpointManager`.
   - On resume: If GEI was already completed for a repository, skips Stage 2 and resumes at Stage 3.
3. Concurrency Control:
   - Limits parallel repository migrations (default concurrency = 2) to prevent target rate-limit exhaustion and network saturation.
4. Error Handling:
   - If GEI fails: records failure, skips Stage 3 and Stage 4 for that repository, and continues next repository if `--continue-on-error` is enabled.
5. Create comprehensive unit/mock tests validating stage ordering, checkpoint recovery, and error containment.

## Acceptance Criteria

- Integration tests verify the 4-stage pipeline executes in exact sequence.
- Resuming after simulated failure in Stage 3 skips Stage 2 and completes the pipeline.
- All monorepo checks pass with `npm run check`.

## Tests

- `packages/migration/tests/orchestrator/pipeline.test.ts`

## Documentation

- Update `packages/migration/README.md` with pipeline architecture diagrams.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- If GEI fails, dependent API modules must never be executed on a non-existent or corrupted target repository.

## Completion Notes

_To be filled by Antigravity upon task completion._
