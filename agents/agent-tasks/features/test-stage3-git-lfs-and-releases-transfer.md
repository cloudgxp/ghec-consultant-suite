# Test Task: Stage 3 — Git LFS and Release Asset Transfer Mechanisms

## Status

open

## Priority

P1

## Category

Features / Asset Transfer & Strategies

## Location

`agents/agent-tasks/features/test-stage3-git-lfs-and-releases-transfer.md`

## Scope Level

Repository

## Objective

Validate specialized large asset migration mechanisms:

1. `strategy-git-lfs` (Task 023): Dual-remote streamed Git LFS mirroring, preflight quota validation, chunked push, and pointer verification.
2. `strategy-releases-fallback` (Task 024): Large release recreator and streaming asset transfer for releases bypassed by GEI `--skip-releases`.
   Enforce dry-run safety and verify no remote git pushes or asset uploads occur in dry-run mode.

## Background

GEI has strict limits on Git LFS data and release asset sizes. When a repository contains large releases or Git LFS tracking, standard GEI migrations either fail or drop assets. The suite detects these during Stage 1 preflight and switches to dedicated fallback transfer strategies during Stage 4 of the repository migration pipeline.

## Dependencies

- Task 023: Git LFS Migration Strategy
- Task 024: Large Releases Fallback Strategy
- Prereq tasks: `prereq-dryrun-git-lfs.md` and `prereq-dryrun-releases.md`

## Commands to Invoke

### Step 1: Preflight Quota & LFS Detection Test

Run automated unit and integration tests for Git LFS and Large Releases strategies:

```bash
node --import tsx --test packages/migration/tests/git-lfs.test.ts
node --import tsx --test packages/migration/tests/releases.test.ts
node --import tsx --test packages/migration/tests/orchestrator/pipeline.test.ts
```

### Step 2: Dry-Run Pipeline Execution with Specialized Strategies

Execute the repository migration pipeline in dry-run mode against a test repository configured with LFS and large release assets:

```bash
ghec-consultant-cli migrate \
  --scope ./scopes/repo-scope.json \
  --dry-run \
  --output ./scans/stage3-lfs-releases-dryrun.json \
  --verbose
```

### Step 3: Verify Dry-Run Output

Inspect `./scans/stage3-lfs-releases-dryrun.json` to verify that both `git-lfs` and `releases-fallback` report completed/simulated without executing external CLI git commands or uploading release binaries.

## Expected Output & State

1. **Preflight Evaluation:**
   - Preflight inspection correctly flags `usesLfs: true` when `.gitattributes` contains `filter=lfs`.
   - Preflight inspection correctly flags `shouldSkipReleases: true` when total release size exceeds 10 GiB.
2. **Dry-Run Pipeline Logs:**
   - Console logs `[Stage 4] Evaluating specialized transfer strategies...`.
   - Dry-run records status `completed` without creating git mirror staging directories or calling `git lfs push`.
3. **Report Output:**
   - `specializedResults['git-lfs'].status === 'completed'`
   - `specializedResults['releases-fallback'].status === 'completed'`
   - Execution report records `dryRun: true`.

## Pass/Fail Acceptance Criteria

- [ ] All tests in `git-lfs.test.ts`, `releases.test.ts`, and `pipeline.test.ts` pass cleanly.
- [ ] In dry-run mode, no git commands mutate the target remote repository.
- [ ] No release assets uploaded to destination during dry-run.
