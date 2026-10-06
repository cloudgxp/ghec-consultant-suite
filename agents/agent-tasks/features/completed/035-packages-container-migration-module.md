# Task 035: Packages & Container (GHCR) Migration Module

## Status

complete

## Owner

Antigravity

## Priority

Medium-High (Critical Gap from Mona-Actions Feature Parity Audit)

## Module Identification

- **Module ID**: `packages`
- **Display Name**: `Packages & GHCR Container Image Migration`
- **Scope Level**: `organization`
- **Dependencies**: `['org-variables', 'org-secrets']`

## Objective

Build the package and container registry migration module (`packages`) in `packages/migration/src/modules/packages/`. Support the discovery, planning, replication, and verification of container images (GHCR - GitHub Packages Container Registry) and language package artifacts (npm, NuGet, Maven, RubyGems) across organizations and EMU environments.

## Background & Mona-Actions Reference

GitHub Enterprise Importer (GEI) does **not** transfer GitHub Packages or container images (`ghcr.io`). Workflows and production systems relying on internal packages or base images fail post-migration unless packages are replicated.
In `mona-actions`, `gh-migrate-packages` provides an extension capable of pulling container images and pushing them to target registries via the Docker Engine SDK, and using `gpr` / package managers for language ecosystems.

This task integrates container image and package replication into the `@ghec/migration` module system.

## GitHub Documentation References

- `references/github-docs/content/rest/packages/packages.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 003: Extract `@ghec/discovery` Package (`packages.ts` collector)
- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 016: Org Variables & Secrets Modules

## Files / Areas Expected to Change

- `packages/migration/src/modules/packages/`
  - `module.ts`: Implements `MigrationModule<PackagesMigrationData>`
  - `types.ts`: TypeScript contracts for packages, versions, tags, and container registries
  - `registry-client.ts`: OCI Registry v2 client for layer blob streaming and manifest replication
  - `index.ts`: Public module exports
- `packages/migration/src/core/registry.ts`: Register `PackagesMigrationModule` in `createDefaultModuleRegistry()`
- `packages/migration/tests/modules/packages.test.ts`: Unit test suite

## Detailed Requirements

1. **Stage 1: Discover (`discover`)**:
   - Accepts `MigrationContext` and optional cached `DiscoveryBundle`.
   - Queries source organization packages across types (`container`, `npm`, `maven`, `rubygems`, `nuget`) via `GET /orgs/{org}/packages`.
   - For each package: retrieves all version metadata via `GET /orgs/{org}/packages/{package_type}/{package_name}/versions`.
   - Captures package names, ecosystems, version tags, digests (SHA-256), repository links, and visibility.
   - Returns structured `PackagesMigrationData`.

2. **Stage 2: Plan (`plan`)**:
   - Queries destination organization packages via `GET /orgs/{targetOrg}/packages`.
   - Diffs versions and tags:
     - For missing packages: emits `create-package` operation.
     - For missing versions/tags: emits `replicate-version` operation containing source digest and version tag.
     - For existing versions with matching digests: emits `noop` operation.
   - Warns if package is linked to a repository that does not exist in target organization.

3. **Stage 3: Apply (`apply`)**:
   - In `dryRun: true`: logs planned container and package replications, returns projected counts.
   - In live run:
     - Container Images (`ghcr.io`):
       - Uses OCI Registry v2 API / token exchange (`https://ghcr.io/token`).
       - Streams manifest and missing layer blobs directly from source to target without storing complete images on local disk.
       - Re-links package to target repository if repository mapping exists.
     - Language Packages (npm, nuget, maven, rubygems):
       - Downloads package version tarballs/archives.
       - Publishes to target registry endpoint with authentication.
     - Records individual `OperationExecutionResult` records.

4. **Stage 4: Verify (`verify`)**:
   - Queries target organization packages via `GET /orgs/{targetOrg}/packages`.
   - Verifies all planned package names, versions, and tags exist at destination.
   - Emits `VerificationDiscrepancy` records if any package or version is missing.

## Acceptance Criteria

- [ ] `PackagesMigrationModule` satisfies `MigrationModule<PackagesMigrationData>`.
- [ ] Registered in `ModuleRegistry` with `id: 'packages'` and dependencies `['org-variables', 'org-secrets']`.
- [ ] OCI Registry v2 client avoids unnecessary local disk usage during container replication.
- [ ] Dry-run mode produces zero mutations.
- [ ] Unit tests pass with >= 90% coverage in `packages/migration/tests/modules/packages.test.ts`.
- [ ] `npm run check` clean.
