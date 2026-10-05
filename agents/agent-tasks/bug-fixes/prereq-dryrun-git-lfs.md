# Prerequisite Task: Universal Dry-Run Support in Git LFS Strategy

## Status

open

## Priority

High (Prerequisite for safe dry-run pipeline testing)

## Category

Bug Fix / Migration Strategy Hardening

## Location

`agents/agent-tasks/bug-fixes/prereq-dryrun-git-lfs.md`

## Objective

Add explicit `dryRun?: boolean` support to `GitLfsMigrationRequest` and `GitLfsMigrationStrategy.execute()`. When `dryRun: true` is passed, the strategy must perform source preflight, quota verification, and mirror planning without executing write mutations (`git lfs push` or remote mutation) against the target repository, and must record simulated checkpoint progress.

## Background & Audit Finding

The codebase audit of `@ghec/migration` revealed that while `RepositoryMigrationPipeline` currently performs an inline check for `this.options.dryRun` in Stage 4:

```typescript
if (this.options.dryRun) {
  specializedResults['git-lfs'] = { status: 'completed' };
}
```

the underlying `GitLfsMigrationStrategy` (`packages/migration/src/strategies/git-lfs/strategy.ts`) and its contract interface `GitLfsMigrationRequest` (`packages/migration/src/strategies/git-lfs/types.ts`) lack direct `dryRun` support. If `GitLfsMigrationStrategy.execute()` is invoked directly or by another orchestrator with a dry-run intent, it attempts live cloning, staging, and remote pushes to the target.

## Dependencies

- None (core strategy fix)

## Affected Files

- `packages/migration/src/strategies/git-lfs/types.ts`
- `packages/migration/src/strategies/git-lfs/strategy.ts`
- `packages/migration/tests/git-lfs.test.ts`

## Requirements

1. **Contract Update (`types.ts`):**
   - Add `readonly dryRun?: boolean | undefined;` to `GitLfsMigrationRequest`.
2. **Execution Logic (`strategy.ts`):**
   - In `GitLfsMigrationStrategy.execute(request)`:
     - Run `preflight(request)` to validate source LFS usage and target quota readiness.
     - If `preflight.usesLfs` is true and `request.dryRun === true`:
       - Do not create staging directories or execute `client.cloneMirror`, `client.fetchAll`, `client.setTargetRemote`, or `client.pushAll`.
       - Record stage checkpoint with status `completed` (marked simulated / dryRun).
       - Return `GitLfsMigrationResult` with `status: 'completed'` and `metrics` indicating projected transfer size/objects without network pushes.
3. **Pipeline Delegation (`pipeline.ts`):**
   - Pass `dryRun: Boolean(this.options.dryRun)` in `lfsStrategy.execute({...})` rather than completely bypassing the strategy instantiation.
4. **Unit Tests:**
   - Add test case verifying that `execute()` with `dryRun: true` invokes `preflight`, makes zero push calls, records checkpoint, and returns `status: 'completed'`.

## Acceptance Criteria

- [ ] `GitLfsMigrationRequest` exposes `readonly dryRun?: boolean | undefined`.
- [ ] `execute()` with `dryRun: true` skips all Git LFS network writes to destination.
- [ ] `npm test` passes across `@ghec/migration`.
- [ ] `npm run check` clean.
