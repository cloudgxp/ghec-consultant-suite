# Task 034: Git LFS Object Streaming Migration Module

## Status

complete

## Owner

Antigravity

## Priority

High (Critical Gap from Mona-Actions Feature Parity Audit)

## Module Identification

- **Module ID**: `lfs`
- **Display Name**: `Git LFS Object Batch Streaming`
- **Scope Level**: `repository`
- **Dependencies**: `['gei-repo']`

## Objective

Build the Git LFS migration module (`lfs`) in `packages/migration/src/modules/lfs/`, transitioning Git LFS migration into a first-class `MigrationModule` adhering to the 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`). Leverage the Git LFS Batch API (`/info/lfs/objects/batch`) to identify missing objects on the destination repository, stream LFS object binaries with SHA-256 integrity validation, and audit post-cutover object availability.

## Background & Mona-Actions Reference

In GitHub Enterprise Importer (GEI), Git LFS pointers in git trees are transferred, but the actual LFS binary objects stored in object storage are **not** migrated when moving across enterprises. Post-migration clone operations fail with smudge errors if LFS objects are missing.
In `mona-actions`, `gh-migrate-lfs` addresses this through the Git LFS Batch API, fetching objects from source and uploading missing objects directly to the target LFS store without checking out git refs.
While `ghec-consultant-suite` has a standalone strategy in `packages/migration/src/strategies/git-lfs/`, it is not integrated into `ModuleRegistry` as a standard 4-stage lifecycle module.

This task integrates Git LFS migration into the standard module architecture.

## GitHub Documentation References

- `https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 023: Git LFS Migration Strategy in `@ghec/migration`
- Task 014 / 015: GEI Repository Migration Pipeline

## Files / Areas Expected to Change

- `packages/migration/src/modules/lfs/`
  - `module.ts`: Implements `MigrationModule<LfsMigrationData>`
  - `types.ts`: TypeScript contracts for LFS batch requests, OIDs, and operations
  - `lfs-streamer.ts`: Streaming client for Git LFS Batch API and HTTP PUT uploads
  - `index.ts`: Public module exports
- `packages/migration/src/core/registry.ts`: Register `LfsMigrationModule` in `createDefaultModuleRegistry()`
- `packages/migration/tests/modules/lfs.test.ts`: Unit test suite

## Detailed Requirements

1. **Stage 1: Discover (`discover`)**:
   - Accepts `MigrationContext` and optional cached `DiscoveryBundle`.
   - Checks `.gitattributes` via `GET /repos/{owner}/{repo}/contents/.gitattributes` to verify LFS usage.
   - Discovers tracked LFS pointers (from discovery bundle entities or repository inspection).
   - Extracts list of LFS objects: OID (SHA-256) and expected size in bytes.
   - Returns structured `LfsMigrationData`.

2. **Stage 2: Plan (`plan`)**:
   - Executes Git LFS Batch API handshake against destination repository:
     - `POST https://{targetHostname}/{targetOrg}/{targetRepo}.git/info/lfs/objects/batch`
     - Header: `Accept: application/vnd.git-lfs+json`, `Content-Type: application/vnd.git-lfs+json`
     - Payload:
       ```json
       {
         "operation": "upload",
         "transfers": ["basic"],
         "objects": [{ "oid": "...", "size": 12345 }]
       }
       ```
   - Evaluates response:
     - Objects already present at destination return no upload action (or empty actions).
     - Missing objects return upload actions with `href` and optional headers.
   - For missing objects: emits `upload` planned operation with OID, size, and upload URL.
   - For existing objects: emits `noop` planned operation.

3. **Stage 3: Apply (`apply`)**:
   - In `dryRun: true`: logs planned LFS transfers, calculates total upload volume, returns simulated success.
   - In live run:
     - For each missing OID: streams object data from source (or local LFS cache) directly to target upload URL via HTTP PUT.
     - Verifies computed SHA-256 matches OID during streaming.
     - Calls LFS verify endpoint if returned by the batch handshake.
     - Implements worker pool concurrency (configurable concurrency, default 4).
     - Records `OperationExecutionResult` records.

4. **Stage 4: Verify (`verify`)**:
   - Performs Git LFS Batch API handshake with `operation: "download"` against destination repository.
   - Asserts all required OIDs return valid download actions without 404s.
   - Emits `VerificationDiscrepancy` records for any missing or corrupt LFS object.

## Acceptance Criteria

- [ ] `LfsMigrationModule` satisfies `MigrationModule<LfsMigrationData>`.
- [ ] Registered in `ModuleRegistry` with `id: 'lfs'` and dependency `['gei-repo']`.
- [ ] Batch API negotiation correctly filters out objects that already exist on target.
- [ ] SHA-256 validation prevents object corruption during upload.
- [ ] Dry-run mode produces zero network mutations.
- [ ] Unit tests pass with >= 90% coverage in `packages/migration/tests/modules/lfs.test.ts`.
- [ ] `npm run check` clean.
