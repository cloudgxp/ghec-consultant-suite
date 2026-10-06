# Task 033: Direct Collaborators Migration Module & Discovery Enhancement

## Status

complete

## Owner

Antigravity

## Priority

High (Gap from Mona-Actions Feature Parity Audit)

## Module Identification

- **Module ID**: `collaborators`
- **Display Name**: `Outside Collaborators & Direct Permissions Rehydration`
- **Scope Level**: `repository`
- **Dependencies**: `['gei-repo']`

## Objective

Build the repository collaborator migration module (`collaborators`) in `packages/migration/src/modules/collaborators/` and update `packages/discovery/src/collectors/users.ts` to actively inventory outside collaborators. Migrate repository-level direct outside collaborator access, map collaborator usernames across EMU and standard GitHub environments, and assign corresponding permissions (`pull`, `triage`, `push`, `maintain`, `admin`).

## Background & Mona-Actions Reference

In many organizations, vendors, contractors, and partners are granted access as direct repository collaborators rather than enterprise organization members. GitHub Enterprise Importer (GEI) does **not** transfer outside collaborators.
In `mona-actions`, `gh-migrate-collaborator-permission` handles this by querying direct repository collaborators via GraphQL/REST and applying them to the destination repository.
In `ghec-consultant-suite`, `packages/discovery/src/collectors/users.ts` currently sets `outsideCollaborator: false` by default, leaving a discovery gap, and no module exists to rehydrate collaborator permissions.

This task resolves both the discovery gap and the migration rehydration gap.

## GitHub Documentation References

- `references/github-docs/content/rest/collaborators/collaborators.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/data-not-migrated.md`

## Dependencies

- Task 003: Extract `@ghec/discovery` Package
- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 017: Teams and EMU Identity Mapping Module (`identity-mapper.ts`)
- Task 014 / 015: GEI Repository Migration Pipeline

## Files / Areas Expected to Change

- `packages/discovery/src/collectors/users.ts`: Update collector to query `GET /orgs/{org}/outside_collaborators`
- `packages/migration/src/modules/collaborators/`
  - `module.ts`: Implements `MigrationModule<CollaboratorsMigrationData>`
  - `types.ts`: TypeScript contracts for collaborator access, permissions, and plans
  - `index.ts`: Public module exports
- `packages/migration/src/core/registry.ts`: Register `CollaboratorsMigrationModule` in `createDefaultModuleRegistry()`
- `packages/discovery/tests/users-collector.test.ts`: Test outside collaborator discovery
- `packages/migration/tests/modules/collaborators.test.ts`: Unit test suite

## Detailed Requirements

1. **Discovery Enhancement (`packages/discovery/src/collectors/users.ts`)**:
   - Query `GET /orgs/{org}/outside_collaborators` (paginated, 100/page).
   - Tag discovered outside collaborators with `outsideCollaborator: true`.
   - Record membership status as `collaborator`.

2. **Stage 1: Discover (`discover`)**:
   - Accepts `MigrationContext`.
   - Calls `GET /repos/{owner}/{repo}/collaborators?affiliation=direct` (paginated).
   - Extracts:
     - `login`: Username
     - `id`: User ID
     - `permissions`: `{ admin: boolean, maintain: boolean, push: boolean, triage: boolean, pull: boolean }`
     - Normalized role permission: `admin | maintain | push | triage | pull`
   - Returns structured `CollaboratorsMigrationData`.

3. **Stage 2: Plan (`plan`)**:
   - Queries target repository direct collaborators via `GET /repos/{owner}/{repo}/collaborators?affiliation=direct`.
   - Maps usernames using `IdentityMapper` (supporting EMU handle transformations, e.g. `jdoe` -> `jdoe_tenant`).
   - If user cannot be resolved or mapped: emits warning.
   - For missing collaborators: emits `add` planned operation with payload `{ username, permission }`.
   - For existing collaborators with mismatched permissions: emits `update` operation.
   - For existing collaborators with matching permissions: emits `noop`.

4. **Stage 3: Apply (`apply`)**:
   - In `dryRun: true`: logs planned invitations/grants, returns simulated success.
   - In live run:
     - For each `add` or `update` operation: calls `PUT /repos/{owner}/{repo}/collaborators/{username}` via `TargetWriteClient` with payload:
       ```json
       { "permission": "push" }
       ```
     - Handles HTTP 404 (user does not exist in target enterprise) or HTTP 422 (outside collaborators disallowed by enterprise policy).
     - Records individual `OperationExecutionResult` records.

5. **Stage 4: Verify (`verify`)**:
   - Queries target repository direct collaborators.
   - Asserts all planned collaborators exist and have the expected permission level.
   - Emits `VerificationDiscrepancy` records for any missing collaborator or permission mismatch.

## Acceptance Criteria

- [ ] `packages/discovery/src/collectors/users.ts` correctly marks outside collaborators with `outsideCollaborator: true`.
- [ ] `CollaboratorsMigrationModule` satisfies `MigrationModule<CollaboratorsMigrationData>`.
- [ ] Registered in `ModuleRegistry` with `id: 'collaborators'` and dependency `['gei-repo']`.
- [ ] Identity translation works seamlessly with `identity-mapper.ts`.
- [ ] Dry-run mode produces zero mutations.
- [ ] Unit tests pass with >= 90% coverage in `packages/migration/tests/modules/collaborators.test.ts`.
- [ ] `npm run check` clean.
