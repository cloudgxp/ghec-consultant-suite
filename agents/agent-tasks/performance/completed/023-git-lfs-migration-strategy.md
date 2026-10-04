# Task 023: Git LFS Migration Strategy

## Status

not-started

## Owner

Antigravity

## Objective

Build the specialized Git LFS migration strategy in `packages/migration/src/strategies/git-lfs/`. Provide dual-remote mirror-and-push orchestration (`git lfs fetch --all` from source, `git lfs push --all` to target), quota pre-checks, execution checkpointing, and post-transfer availability verification (DEC-011).

## Background

GitHub Enterprise Importer (GEI) transfers repository Git commit history, branches, tags, PRs, and issues, but **does not migrate Git LFS objects**. Repositories using Git LFS migrate with pointer files intact, but attempts to checkout or pull LFS files on the target repository result in 404 errors. This strategy orchestrates the official GitHub dual-remote mirroring flow to transfer all historical LFS objects.

## GitHub Documentation References

- `references/github-docs/data/reusables/enterprise-migration-tool/limitations-of-migration-tooling.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`
- `references/github-docs/content/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-git-lfs-objects-in-archives-of-your-repository.md`
- `references/github-docs/content/rest/repos/lfs.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 006: Migration Checkpoint Manager in `@ghec/migration`
- Task 014: GEI Preflight & Process Execution Wrapper

## Files / Areas Expected to Change

- `packages/migration/src/strategies/git-lfs/`
  - `strategy.ts`
  - `lfs-client.ts`
  - `verifier.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/strategies/git-lfs.test.ts`

## Requirements

1. Implement `GitLfsMigrationStrategy`:
   - `id`: `'strategy-git-lfs'`
   - `displayName`: `'Git LFS Dual-Remote Streamed Migration'`
   - Operates in Stage 4 of the repository migration pipeline (strictly post-GEI).
2. Pre-Transfer Checks:
   - Queries source repository for `.gitattributes` files containing `filter=lfs`.
   - Asserts that Git and Git LFS binaries (`git lfs version`) are installed on the execution runner.
   - Verifies target enterprise Git LFS storage and bandwidth quotas are enabled.
3. Transfer Orchestration:
   - Creates an isolated staging directory on persistent runner storage: `./migrations/.staging-lfs/<repoName>.git`.
   - Executes mirror clone:
     ```bash
     git clone --mirror "https://x-access-token:${SOURCE_PAT}@github.com/${SOURCE_ORG}/${REPO}.git" "/staging/${REPO}.git"
     ```
   - Fetches all historical LFS objects:
     ```bash
     cd "/staging/${REPO}.git"
     git lfs fetch --all origin
     ```
   - Updates remote URL to target repository:
     ```bash
     git remote set-url origin "https://x-access-token:${TARGET_PAT}@github.com/${TARGET_ORG}/${REPO}.git"
     ```
   - Pushes all LFS objects:
     ```bash
     git lfs push --all origin
     ```
   - Cleans up local mirror directory upon successful completion.
4. Error Containment & Streaming Diagnostics:
   - Streams progress through `sanitizeDiagnostics()` to ensure tokens never leak.
   - Handles partial transfer failures with retry backoff.
5. Verification:
   - Queries sample LFS object OIDs on target or queries `GET /repos/{owner}/{repo}` to assert LFS availability.
   - Emits transfer metrics: total objects transferred, total gigabytes pushed, duration.

## Acceptance Criteria

- Unit and mock subprocess tests verify mirror clone, `fetch --all`, remote re-pointing, and `push --all` argument construction.
- Credentials in remote URLs are scrubbed from all log streams and process traces.
- Checkpoint manager accurately records LFS transfer completion for the repository.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/strategies/git-lfs.test.ts`

## Documentation

- Create `packages/migration/src/strategies/git-lfs/README.md` with operational guidance and disk space requirements.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Disk Space Requirement:** Self-hosted runners executing Git LFS migration must have sufficient persistent scratch space to hold the uncompressed LFS objects of the largest repository in the cohort.

## Completion Notes

_Completed and verified._
