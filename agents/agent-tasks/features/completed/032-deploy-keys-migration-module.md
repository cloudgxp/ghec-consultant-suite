# Task 032: Repository Deploy Keys Migration Module

## Status

complete

## Owner

Antigravity

## Priority

Medium-High (Gap from Mona-Actions Feature Parity Audit)

## Module Identification

- **Module ID**: `deploy-keys`
- **Display Name**: `Repository Deploy Keys Rehydration`
- **Scope Level**: `repository`
- **Dependencies**: `['gei-repo']`

## Objective

Build the repository deploy keys migration module (`deploy-keys`) in `packages/migration/src/modules/deploy-keys/`. Recreate repository-level public SSH deploy keys (with titles and read-only/read-write permissions) on destination repositories, adhering to the 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`) with complete dry-run and discrepancy auditing.

## Background & Mona-Actions Reference

Deploy keys grant access to a single GitHub repository and are widely used by CI/CD build servers, deployment pipelines, provisioning agents, and IoT devices. GitHub Enterprise Importer (GEI) does **not** transfer deploy keys.
In `mona-actions`, `gh-migrate-deploy-keys` uses a 1,360-line bash script to query deploy keys via GraphQL/REST and recreate them using `gh api`.

This task provides an enterprise-grade TypeScript implementation natively integrated into the `@ghec/migration` module DAG, handling duplicate key detection, fingerprint comparison, and read-only flag preservation.

## GitHub Documentation References

- `references/github-docs/content/rest/deploy-keys/deploy-keys.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module (Reference lifecycle implementation)
- Task 014 / 015: GEI Repository Migration Pipeline

## Files / Areas Expected to Change

- `packages/migration/src/modules/deploy-keys/`
  - `module.ts`: Implements `MigrationModule<DeployKeysMigrationData>`
  - `types.ts`: TypeScript contracts for deploy keys, key payloads, and plan types
  - `fingerprint.ts`: SSH public key normalization and SHA-256 / MD5 fingerprint computation
  - `index.ts`: Public module exports
- `packages/migration/src/core/registry.ts`: Register `DeployKeysMigrationModule` in `createDefaultModuleRegistry()`
- `packages/migration/tests/modules/deploy-keys.test.ts`: Unit test suite

## Detailed Requirements

1. **Stage 1: Discover (`discover`)**:
   - Accepts `MigrationContext` and optional cached `DiscoveryBundle`.
   - Reads source deploy keys via `GET /repos/{owner}/{repo}/keys` (paginated, 100/page).
   - Extracts:
     - `id`: Key ID
     - `key`: Public SSH key string (e.g., `ssh-rsa AAAAB3NzaC1yc2E...` or `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...`)
     - `title`: Descriptive key label
     - `read_only`: Boolean flag indicating write restriction
     - `verified`: Verification status
     - `created_at`: Creation timestamp
   - Returns structured `DeployKeysMigrationData`.

2. **Stage 2: Plan (`plan`)**:
   - Queries target repository deploy keys via `GET /repos/{owner}/{repo}/keys`.
   - Compares source keys against target keys:
     - Normalizes SSH key strings and matches on key content and/or computed fingerprint.
     - Also matches on `title`.
   - For missing keys: emits `create` planned operation with payload `{ title, key, read_only }`.
   - For matching keys: emits `noop` operation.
   - Emits warning if target repository already has a key with the same title but a different SSH public key.

3. **Stage 3: Apply (`apply`)**:
   - In `dryRun: true`: logs planned key additions, returns simulated success.
   - In live run:
     - For each `create` operation: calls `POST /repos/{owner}/{repo}/keys` via `TargetWriteClient` with payload `{ title, key, read_only }`.
     - Handles HTTP 422 errors gracefully (e.g. key already in use as a deploy key or user SSH key across GitHub).
     - Records individual `OperationExecutionResult` records.

4. **Stage 4: Verify (`verify`)**:
   - Queries target repository deploy keys via `GET /repos/{owner}/{repo}/keys`.
   - Verifies that all expected keys exist on the destination repository with matching `read_only` permissions.
   - Emits `VerificationDiscrepancy` records if any key is missing or permission is mismatched.

## Acceptance Criteria

- [ ] `DeployKeysMigrationModule` satisfies `MigrationModule<DeployKeysMigrationData>`.
- [ ] Registered in `ModuleRegistry` with `id: 'deploy-keys'` and dependency `['gei-repo']`.
- [ ] Key normalization correctly detects matching keys regardless of whitespace or trailing comments.
- [ ] Dry-run simulation produces zero write mutations.
- [ ] Unit tests pass with >= 90% coverage in `packages/migration/tests/modules/deploy-keys.test.ts`.
- [ ] `npm run check` clean.
