# Task 015: Orchestrate GEI with Post-GEI API Module Pipeline

## Status

not-started

## Owner

Antigravity

## Objective

Integrate GEI repository migration and all post-GEI reconciliation strategies into `MigrationOrchestrator` in `packages/migration/src/orchestrator/`. Establish the authoritative 7-stage repository execution pipeline: Preflight Checks $\rightarrow$ Target Preparation $\rightarrow$ GEI Execution $\rightarrow$ Specialized Strategies (LFS / Releases Fallback) $\rightarrow$ Post-GEI API Rehydration $\rightarrow$ Post-Migration Reconciliations $\rightarrow$ Verification & Soundness Audit.

## Background

Migrating a repository is a complex multi-stage lifecycle: it requires inspecting source limits, verifying destination ruleset bypasses, executing GEI for core Git data, coordinating specialized transfer strategies for LFS objects and oversized release archives, rehydrating configuration modules, and reconciling visibility, webhooks, mannequins, and CODEOWNERS before final audit verification.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`
- `references/github-docs/content/migrations/troubleshooting/troubleshooting-your-migration-with-github-enterprise-importer.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/completing-your-migration-with-github-enterprise-importer/accessing-your-migration-logs-for-github-enterprise-importer.md`

## Dependencies

- Task 009: CLI Integration for `plan`, `migrate`, and `verify` Subcommands
- Task 013: Implement `rulesets` and `branch-protection` Migration Modules
- Task 014: GEI Preflight & Process Execution Wrapper
- Task 022: Source & Destination Migration Preflight Engine
- Task 023: Git LFS Migration Strategy
- Task 024: Large Releases & Assets Fallback Strategy
- Task 025: Repository Visibility & PR Settings Reconciliation Module
- Task 026: Custom Properties Migration Modules
- Task 027: Mannequin Reclamation & Attribution Engine

## Files / Areas Expected to Change

- `packages/migration/src/orchestrator/`
  - `orchestrator.ts`
  - `pipeline.ts`
  - `types.ts`
- `packages/migration/tests/orchestrator/pipeline.test.ts`

## Requirements

1. Implement `RepositoryMigrationPipeline` executing the authoritative 7 stages:
   - **Stage 1 (Preflight):** Invokes Task 022 preflight engine; evaluates repo sizing, commit size (<2 GiB), ref lengths, file limits, LFS usage, and release asset volume.
   - **Stage 2 (Target Preparation):** Asserts target org exists, target repository name is available, and destination rulesets have "Repository migrations" in **Exempt** bypass mode.
   - **Stage 3 (GEI Execution):** Spawns `GeiProcessExecutor` (Task 014). Passes `--skip-releases` if releases exceed 10 GiB or metadata exceeds 40 GiB. Passes `--target-repo-visibility`. Downloads migration log within 24-hour window.
   - **Stage 4 (Specialized Strategies):**
     - If repository uses LFS, triggers Git LFS mirror & push strategy (Task 023).
     - If `--skip-releases` was used, triggers Large Releases fallback REST streaming strategy (Task 024).
   - **Stage 5 (Post-GEI API Rehydration):** Sequentially executes planned API modules: `repo-variables`, `repo-secrets`, `rulesets`, `branch-protection` reconciliation, `environments`, `repo-custom-properties`.
   - **Stage 6 (Post-Migration Reconciliations):**
     - Reconciles repository visibility and PR commit message defaults (Task 025).
     - Reconciles active webhooks with secret rehydration (Task 018).
     - Triggers bulk mannequin reclamation with `--skip-invitation` (Task 027).
     - Inspects and rewrites CODEOWNERS team references (Task 028).
   - **Stage 7 (Verification & Audit):** Calls `module.verify()`, evaluates soundness check, and aggregates verification report.
2. Checkpoint Integration:
   - Records each stage transition in `MigrationCheckpointManager`.
   - On resume: Detects completed stages for each repository, skipping already-finished steps (e.g. if GEI succeeded, resumes at Stage 4 or 5).
3. Concurrency Control:
   - Limits parallel repository pipelines (default concurrency = 2) to prevent secondary rate-limit exhaustion and bandwidth contention.
4. Error Handling:
   - If GEI fails: records failure, skips subsequent stages for that repository, and continues next repository if `--continue-on-error` is enabled.
5. Create comprehensive unit/mock tests validating stage ordering, checkpoint recovery, and error containment.

## Acceptance Criteria

- Integration tests verify the 7-stage pipeline executes in exact sequence.
- Resuming after simulated failure in Stage 5 skips Stages 1–4 and completes the pipeline.
- If preflight flags release overflow, GEI is invoked with `--skip-releases` and Stage 4 triggers the release fallback engine.
- All monorepo checks pass with `npm run check`.

## Tests

- `packages/migration/tests/orchestrator/pipeline.test.ts`

## Documentation

- Update `packages/migration/README.md` with pipeline architecture diagrams.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- If GEI fails, dependent API modules and post-migration reconciliations must never be executed on an incomplete or corrupted target repository.

## Completion Notes

_To be filled by Antigravity upon task completion._
