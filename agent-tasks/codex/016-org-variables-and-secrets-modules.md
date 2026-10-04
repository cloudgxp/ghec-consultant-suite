# Task 016: Implement `org-variables` and `org-secrets` Modules

## Status

not-started

## Owner

Codex

## Objective

Build organization-level migration modules for variables and secrets metadata in `packages/migration/src/modules/org-variables/` and `org-secrets/`. Handle visibility scoping (`all`, `private`, `selected`), repository selection lists, and metadata rehydration.

## Background

While repository modules migrate settings for individual repositories, enterprise customers also maintain organization-level variables and secrets shared across multiple repositories. These must be migrated before or alongside repository cohorts.

## Dependencies

- Task 008: Implement `repo-variables` Migration Module
- Task 011: Implement `repo-secrets` Metadata Rehydration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/org-variables/`
  - `module.ts`
  - `index.ts`
- `packages/migration/src/modules/org-secrets/`
  - `module.ts`
  - `index.ts`
- `packages/migration/tests/modules/org-variables.test.ts`
- `packages/migration/tests/modules/org-secrets.test.ts`

## Requirements

1. Implement `OrgVariablesMigrationModule`:
   - `id`: `'org-variables'`
   - `scopeLevel`: `'organization'`
   - Discover: calls `GET /orgs/{org}/actions/variables` (or extracts from discovery bundle).
   - Plan: diffs organization variables, handling visibility (`all`, `private`, `selected`) and selected repository IDs (mapped to target repository IDs).
   - Apply: calls `POST /orgs/{org}/actions/variables` or `PATCH /orgs/{org}/actions/variables/{name}`.
   - Verify: asserts organization variables match source state.
2. Implement `OrgSecretsMigrationModule`:
   - `id`: `'org-secrets'`
   - `scopeLevel`: `'organization'`
   - Discover: calls `GET /orgs/{org}/actions/secrets`.
   - Plan: diffs secret names and visibility scoping.
   - Apply: creates organization secrets using encrypted blank values (`""`) via `PUT /orgs/{org}/actions/secrets/{secret_name}` using the target organization public key (DEC-004), with support for client vault providers when configured.
   - Verify: asserts secret names exist on target organization with correct visibility scoping.
3. Write unit tests testing organization-level scoping and selected repository mapping.

## Acceptance Criteria

- Unit tests verify organization variables and secrets with all three visibility modes (`all`, `private`, `selected`).
- Selected repository IDs are mapped accurately from source repos to target repos.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/org-variables.test.ts`
- `packages/migration/tests/modules/org-secrets.test.ts`

## Documentation

- Document organization modules in `packages/migration/README.md`.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **Selected Repository Ordering:** If an org variable scopes to `selected` repositories, those repositories must exist on the target before binding, or the binding call must be deferred until repos are created.

## Completion Notes

_To be filled by Codex upon task completion._
