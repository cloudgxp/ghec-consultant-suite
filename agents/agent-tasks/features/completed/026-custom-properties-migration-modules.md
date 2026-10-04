# Task 026: Custom Properties Migration Modules

## Status

complete

## Owner

Antigravity

## Objective

Build the organization custom property schema migration module (`org-custom-properties`) and repository custom property assignment module (`repo-custom-properties`) in `packages/migration/src/modules/org-custom-properties/` and `repo-custom-properties/`. Discover organization property definitions, recreate them on the target organization, and assign corresponding custom property values to migrated repositories.

## Background

GitHub Enterprise Importer does **not** transfer custom properties or repository properties. Custom properties allow organizations to track metadata, classification, compliance tiers, and ownership across their repositories. Migrating custom properties requires a two-step dependency chain: the organization property schema must exist before property values can be assigned to repositories.

## GitHub Documentation References

- `references/github-docs/content/rest/orgs/custom-properties.md`
- `references/github-docs/content/rest/repos/custom-properties.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/org-custom-properties/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/src/modules/repo-custom-properties/`
  - `module.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/custom-properties.test.ts`

## Requirements

1. Implement `OrgCustomPropertiesMigrationModule`:
   - `id`: `'org-custom-properties'`
   - `displayName`: `'Organization Custom Property Schemas'`
   - `scopeLevel`: `'organization'`
   - Discover: Calls `GET /orgs/{org}/properties/schema` via `SourceReadClient`. Extracts property names, types (`string`, `single_select`, `multi_select`, `true_false`), descriptions, allowed values, default values, and required flags.
   - Plan: Diffs schema with target organization schema (`GET /orgs/{targetOrg}/properties/schema`). Emits `create`, `update`, or `noop` operations.
   - Apply: Calls `PUT /orgs/{targetOrg}/properties/schema` via `TargetWriteClient` to define or update custom properties.
   - Verify: Asserts target organization property schema matches source definitions.
2. Implement `RepoCustomPropertiesMigrationModule`:
   - `id`: `'repo-custom-properties'`
   - `displayName`: `'Repository Custom Property Values'`
   - `scopeLevel`: `'repository'`
   - `dependencies`: `['gei-repo', 'org-custom-properties']`
   - Discover: Calls `GET /repos/{owner}/{repo}/properties/values`.
   - Plan: Queries target repository property values; compares values against source. Emits `update` or `noop` operations.
   - Apply: Batch-assigns property values to the target repository via `PATCH /orgs/{targetOrg}/properties/values`:
     ```json
     {
       "repository_names": [targetRepo],
       "properties": [
         { "property_name": "environment", "value": "production" },
         { "property_name": "data-classification", "value": "restricted" }
       ]
     }
     ```
   - Verify: Asserts target repository custom property values match planned values.

## Acceptance Criteria

- Unit tests verify organization schema diffing, allowed value mapping, and schema creation.
- Repository property assignments execute accurately after schema creation.
- Validates that repositories with no custom properties emit `noop` and send 0 write requests.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/custom-properties.test.ts`

## Documentation

- Create `packages/migration/src/modules/org-custom-properties/README.md`.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **Dependency Order:** `repo-custom-properties` must never execute before `org-custom-properties` creates the schema on the target organization; GitHub APIs reject property value assignments for non-existent property keys.

## Completion Notes

- **Implementation:** Antigravity implemented `OrgCustomPropertiesMigrationModule` (`org-custom-properties`) and `RepoCustomPropertiesMigrationModule` (`repo-custom-properties`) in `packages/migration/src/modules/org-custom-properties/` and `repo-custom-properties/`, with export in `packages/migration/src/index.ts` and registration in `createDefaultModuleRegistry`.
- **Hardening & Defensiveness:** Antigravity added defensive `try/catch` error boundaries around target schema and value reads (`ctx.targetClient.readSingle`) to safely tolerate non-existent resources or unmapped schemas.
- **Tests & Docs:** Antigravity added comprehensive unit tests in `packages/migration/tests/modules/custom-properties.test.ts` (9 tests covering full discover, plan, apply, verify lifecycle, schema updates, and dependency order) and documentation in `README.md` for both modules.
- **Verification:** All 171 migration tests passing, `npm run check` green.
