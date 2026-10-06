# Granular Per-Repository Migration Configuration

**Type:** Feature

**Status:** Completed

## Description

Our migration processes need fine-grained control at the repository level. A global "skip releases" or "skip LFS" flag is insufficient for enterprise migrations where different repositories have different constraints. The dashboard must allow users to configure specific flags (e.g., `--skip-releases` for GEI) on a per-repository basis, persist this configuration in the scope file, and have the CLI honor these settings during execution.

## Acceptance Criteria

- [x] The shared data schema (`packages/contracts`) supports a `repositoryOptions` mapping within the migration scope definition.
- [x] The dashboard UI allows users to toggle specific migration flags (e.g., Skip Releases, Skip LFS, Custom Timeout) for individual repositories.
- [x] The dashboard generates a customized `scope.json` that includes these granular configurations.
- [x] The CLI's `migrate` command and the GEI process wrapper correctly parse these per-repository options and apply the corresponding CLI arguments when migrating that specific repository.

## Component(s) Affected

- `packages/contracts` (Schema updates)
- `apps/dashboard` (UI for configuring repo-level options)
- `apps/cli` (Migration engine, GEI wrapper execution logic)

## Suggested Approach

1. Update the Zod schemas in `packages/contracts` to include an optional `options` object inside the repository scope definition.
2. In the dashboard's `MigrationReadinessTab` or similar, add an "Options" column/drawer where users can override default migration behaviors for a selected repository.
3. Update the `apps/cli` engine that loops over the scope to extract `repositoryOptions`.
4. Pass these options into the GEI preflight and execution wrapper (likely located in `apps/cli/src/engine` or `apps/cli/src/commands`), ensuring dynamic argument building (e.g., appending `--skip-releases` if `options.skipReleases === true`).

## Implementation Summary

- Extended `packages/contracts`: added `RepositoryOptionsSchema` (supporting `skipReleases`, `skipLfs`, `customTimeout`, `timeoutSeconds`, `lfsStrategy`, and `targetRepoVisibility`), added `options` to `RepositoryMappingSchema`, and added `repositoryOptions` mapping to `MigrationScopeSchema`.
- Updated `packages/migration`: added `options` to `MigrationScopeTarget`, resolved repository options in `MigrationOrchestrator`, `MigrationPlanner`, and `RepositoryMigrationPipeline`, and dynamically applied `skipReleases`, `timeoutMs`, and `targetRepoVisibility` in `GeiProcessExecutor` and `GeiRepoMigrationModule`.
- Updated `apps/dashboard`: extended `buildMigrationScope` in `scope-generator.ts` to accept and serialize per-repo options and `repositoryOptions` map. Added a granular overrides table to `ScopeBuilderModal.tsx` allowing users to configure per-repository migration flags.
- Added comprehensive unit tests in `packages/contracts/tests/migration-scope.test.ts`, `packages/migration/tests/modules/gei-repo.test.ts`, and `apps/dashboard/tests/scope-builder.test.ts`.
