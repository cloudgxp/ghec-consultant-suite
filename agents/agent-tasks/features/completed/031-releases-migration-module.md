# Task 031: Releases & Release Assets Migration Module

## Status

complete

## Owner

Antigravity

## Priority

High (Critical Gap from Mona-Actions Feature Parity Audit)

## Module Identification

- **Module ID**: `releases`
- **Display Name**: `Releases & Release Assets Migration`
- **Scope Level**: `repository`
- **Dependencies**: `['gei-repo']`

## Objective

Build the repository release and release asset migration module (`releases`) in `packages/migration/src/modules/releases/`. Replicate all repository releases, draft releases, prerelease tags, target commitish, release notes, and binary release assets from source to destination repository, providing an idempotent 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`) integrated into the `ModuleRegistry` and DAG.

## Background & Mona-Actions Reference

In GitHub Enterprise Importer (GEI), release objects, release notes, draft states, and binary release assets are **not** migrated. Teams migrating to GHEC/EMU lose software distribution artifacts, release notes, changelogs, and binary downloads.
The `mona-actions/gh-migrate-releases` extension addresses this by downloading assets locally and uploading them to recreated releases on the destination.

This task integrates this functionality directly into the `@ghec/migration` engine as a native, type-safe module adhering to the unified 4-stage contract.

## GitHub Documentation References

- `references/github-docs/content/rest/releases/releases.md`
- `references/github-docs/content/rest/releases/assets.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module (Reference lifecycle implementation)
- Task 014 / 015: GEI Repository Migration Pipeline

## Files / Areas Expected to Change

- `packages/migration/src/modules/releases/`
  - `module.ts`: Implements `MigrationModule<ReleasesMigrationData>`
  - `types.ts`: TypeScript contracts for releases, assets, options, and plans
  - `asset-transfer.ts`: Streaming download and upload helper with chunking and MIME detection
  - `index.ts`: Public module exports
- `packages/migration/src/core/registry.ts`: Register `ReleasesMigrationModule` in `createDefaultModuleRegistry()`
- `packages/migration/tests/modules/releases.test.ts`: Unit tests for 4-stage lifecycle and idempotency

## Detailed Requirements

1. **Stage 1: Discover (`discover`)**:
   - Accepts `MigrationContext` and optional cached `DiscoveryBundle`.
   - Live query: Calls `GET /repos/{owner}/{repo}/releases` (paginated, 100/page).
   - Extracts release attributes:
     - `id`: Source release ID
     - `tagName`: Tag name associated with release
     - `targetCommitish`: Branch/commit SHA target
     - `name`: Release title
     - `body`: Markdown release notes
     - `draft`: Boolean draft flag
     - `prerelease`: Boolean prerelease flag
     - `publishedAt` / `createdAt`: Timestamps
     - `assets`: Array of `{ id, name, size, contentType, downloadUrl }`
   - Returns structured `ReleasesMigrationData`.

2. **Stage 2: Plan (`plan`)**:
   - Queries target repository releases via `GET /repos/{owner}/{repo}/releases`.
   - Compares source releases against target releases matching on `tagName`.
   - For missing releases: emits `create` operation containing release payload and required asset transfer operations.
   - For existing releases: checks existing assets by name and byte size. Emits `upload` operations only for missing assets.
   - Emits `noop` operations when all releases and assets are already present at destination.

3. **Stage 3: Apply (`apply`)**:
   - For `dryRun: true`: logs planned actions, returns projected metrics (releases to recreate, assets to upload, total bytes).
   - For live run:
     - Recreates release on target via `POST /repos/{owner}/{repo}/releases`.
     - For each missing asset: streams binary data from source `GET /repos/{owner}/{repo}/releases/assets/{asset_id}` and pipes directly to target upload URL `POST https://uploads.github.com/repos/{owner}/{repo}/releases/{release_id}/assets?name={asset_name}` with correct `Content-Type` and `Content-Length`.
     - Handles transient network retries with exponential backoff.
     - Enforces idempotency: never overwrites or duplicates existing assets of identical size.

4. **Stage 4: Verify (`verify`)**:
   - Queries target repository releases and assets.
   - Asserts all planned releases exist and all planned assets have matching byte sizes.
   - Emits `VerificationDiscrepancy` records if releases or assets are missing or truncated.

## Acceptance Criteria

- [ ] `ReleasesMigrationModule` satisfies `MigrationModule<ReleasesMigrationData>`.
- [ ] Registered in `ModuleRegistry` with `id: 'releases'` and dependency `['gei-repo']`.
- [ ] Universal dry-run verified: zero mutations in dry-run mode.
- [ ] Streaming transfer handles large assets without memory exhaustion.
- [ ] Unit tests pass with >= 90% coverage in `packages/migration/tests/modules/releases.test.ts`.
- [ ] `npm run check` passes cleanly.
