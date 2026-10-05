# Prerequisite Task: Fix Module Identifiers & Org Post-Migration Decoupling in Repository Pipeline

## Status

open

## Priority

High (Prerequisite for Stage 6 pipeline reconciliation)

## Category

Bug Fix / Orchestrator Architecture

## Location

`agents/agent-tasks/bug-fixes/prereq-pipeline-module-identifiers-drift.md`

## Objective

Fix module identifier resolution drift in `RepositoryMigrationPipeline` Stage 6 (`packages/migration/src/orchestrator/pipeline.ts`), where `'repo-visibility'` is looked up instead of the registered `'repo-settings'` module ID. Also decouple the organization-scoped `post-migration-mannequins` engine from the per-repository migration loop to eliminate redundant whole-org CSV generations and invitations during multi-repository batch runs.

## Background & Audit Finding

1. **Identifier Drift:** In `pipeline.ts` Stage 6:

   ```typescript
   const postMigrationTasks: Array<
     | 'repo-visibility'
     | 'webhooks'
     | 'mannequins'
     | 'codeowners'
     | 'security'
   > = ['repo-visibility', 'webhooks', 'mannequins', 'codeowners', 'security'];
   for (const task of postMigrationTasks) {
     const mod =
       this.options.registry.get(task) ??
       this.options.registry.get(`post-migration-${task}`);
   ```

   The registered module ID in `createDefaultModuleRegistry()` is `repo-settings` (class `RepoSettingsMigrationModule`, implementing both repository visibility restoration and PR squash/merge commit settings reconciliation under Task 025). Neither `'repo-visibility'` nor `'post-migration-repo-visibility'` is registered. As a result, `pipeline.ts` silently marks `'repo-visibility'` as `skipped` on every repository migration run!

2. **Scope Mismatch in Stage 6:** `MannequinReclamationEngine` is an organization-level module (`scopeLevel: 'organization'`). Placing `mannequins` inside the repository migration loop causes whole-organization mannequin discovery and `gh gei reclaim-mannequin` commands to be spawned redundantly for each migrated repository rather than once as an organization-level post-migration phase.

## Dependencies

- Task 015: GEI Pipeline Orchestration
- Task 025: Repository Visibility & PR Settings Reconciliation

## Affected Files

- `packages/migration/src/orchestrator/pipeline.ts`
- `packages/migration/tests/orchestrator/pipeline.test.ts`

## Requirements

1. **Module ID Resolution:**
   - Update `pipeline.ts` Stage 6 lookup to support `'repo-settings'` directly, with an alias fallback to `'repo-visibility'`:
     ```typescript
     const mod =
       this.options.registry.get(task) ??
       this.options.registry.get(`post-migration-${task}`) ??
       (task === 'repo-visibility'
         ? this.options.registry.get('repo-settings')
         : undefined);
     ```
2. **Organization-Level Decoupling:**
   - Guard `mannequins` reclamation in Stage 6 or extract it to run once per unique target organization in multi-repo batches, ensuring an organization-level context is passed (`scope.level: 'organization'`).
3. **Regression Tests:**
   - Update `packages/migration/tests/orchestrator/pipeline.test.ts` to assert that `repo-settings` is resolved and executed in Stage 6 when present in the registry.

## Acceptance Criteria

- [ ] Stage 6 post-migration successfully resolves and executes `RepoSettingsMigrationModule`.
- [ ] No silently skipped `repo-visibility` tasks when `repo-settings` is in the registry.
- [ ] `packages/migration/tests/orchestrator/pipeline.test.ts` passes.
- [ ] `npm run check` clean.
