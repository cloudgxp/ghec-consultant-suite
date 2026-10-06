# Prerequisite Task: Universal Dry-Run Support in Large Releases Strategy

## Status

complete

## Priority

High (Prerequisite for safe dry-run pipeline testing)

## Category

Bug Fix / Migration Strategy Hardening

## Location

`agents/agent-tasks/bug-fixes/prereq-dryrun-releases.md`

## Objective

Add explicit `dryRun?: boolean` support to `ReleaseMigrationRequest` and `LargeReleasesMigrationStrategy.execute()`. In dry-run mode, the strategy must discover source releases and assets, query target releases to detect missing releases/assets, calculate transfer volume, and return projected transfer metrics without invoking `ReleaseRecreator.recreate()` or `ReleaseAssetStreamer.stream()` network writes.

## Background & Audit Finding

In `@ghec/migration`, `LargeReleasesMigrationStrategy` (`packages/migration/src/strategies/releases/strategy.ts`) and `ReleaseMigrationRequest` (`packages/migration/src/strategies/releases/types.ts`) currently do not accept a `dryRun` flag. While `pipeline.ts` avoids invoking the strategy during a dry run:

```typescript
if (this.options.dryRun || !this.options.releaseTransport) {
  specializedResults['releases-fallback'] = { status: 'completed' };
}
```

direct strategy invocations cannot run a non-destructive dry-run probe. A caller executing `LargeReleasesMigrationStrategy.execute()` directly will unconditionally create releases and stream assets to the target repository.

## Dependencies

- None (core strategy fix)

## Affected Files

- `packages/migration/src/strategies/releases/types.ts`
- `packages/migration/src/strategies/releases/strategy.ts`
- `packages/migration/tests/releases.test.ts`

## Requirements

1. **Contract Update (`types.ts`):**
   - Add `readonly dryRun?: boolean | undefined;` to `ReleaseMigrationRequest`.
2. **Execution Logic (`strategy.ts`):**
   - In `LargeReleasesMigrationStrategy.execute(request)`:
     - Enforce `request.geiSkippedReleases` check.
     - Query source releases via `this.transport.listSourceReleases(request.signal)`.
     - Query target releases via `this.transport.listTargetReleases(request.signal)`.
     - When `request.dryRun === true`:
       - Match source releases against target releases by `tagName`.
       - For missing releases or missing assets, accumulate projected counts into `metrics.releasesRecreated`, `metrics.assetsTransferred`, and `metrics.bytesStreamed`.
       - Do **not** call `this.recreator.recreate()` or `this.streamer.stream()`.
       - Record completed stage checkpoint.
       - Return `ReleaseMigrationResult` with `status: 'completed'` and dry-run transfer projections.
3. **Pipeline Integration (`pipeline.ts`):**
   - Delegate dry-run execution to `LargeReleasesMigrationStrategy.execute({ ...request, dryRun: this.options.dryRun })` if `releaseTransport` is present.
4. **Unit Tests:**
   - Add unit tests in `packages/migration/tests/releases.test.ts` asserting that `execute()` with `dryRun: true` calculates diff metrics and calls neither `recreate` nor `uploadAsset`.

## Acceptance Criteria

- [ ] `ReleaseMigrationRequest` contains `dryRun?: boolean`.
- [ ] `execute()` with `dryRun: true` performs zero POST/PUT mutations against release endpoints.
- [ ] Accurate transfer simulation metrics are returned in the result.
- [ ] `npm test` passes across `@ghec/migration`.
- [ ] `npm run check` clean.
