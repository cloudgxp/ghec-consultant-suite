# Task 017: Implement `teams` & Identity Mapping Migration Module

## Status

not-started

## Owner

Antigravity

## Objective

Build the `teams` migration module in `packages/migration/src/modules/teams/`. Recreate team trees (parent-child hierarchies) and repository permissions for repository migrations, reconcile base organization permissions, generate IdP Group Sync mapping artifacts for GHEC-EMU, and emit a team slug translation table for CODEOWNERS repair (DEC-005).

## Background

In GEI, organization migrations transfer teams and repository permissions but leave teams empty; repository migrations transfer **neither** teams nor team repository access. In GHEC-EMU, user membership in teams is governed out-of-band by Identity Provider (IdP) Group Sync (SCIM/SAML). Direct user membership assignment via the Teams API will either fail or conflict with IdP sync. The module recreates the team hierarchy and binds repository access rights (`read`, `triage`, `write`, `maintain`, `admin`), while generating IdP mapping blueprints for directory administrators.

## GitHub Documentation References

- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/about-migrations-between-github-products.md`
- `references/github-docs/content/migrations/using-github-enterprise-importer/migrating-between-github-products/overview-of-a-migration-between-github-products.md`
- `references/github-docs/data/reusables/enterprise-migration-tool/team-references.md`

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/teams/`
  - `module.ts`
  - `identity-mapper.ts`
  - `idp-exporter.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/teams.test.ts`

## Requirements

1. Implement `IdentityMappingEngine`:
   - Configured via `migration-scope.json` (`identityMapping`).
   - Supports username transformation: `login` $\rightarrow$ `${login}${suffix}` (e.g. `octocat` $\rightarrow$ `octocat_acme`).
   - Supports explicit dictionary map: source login $\rightarrow$ mapped target EMU login.
   - Handles unmapped identities by generating structured advisories (`warn`) rather than hard failures.
2. Implement `TeamsMigrationModule`:
   - `id`: `'teams'`
   - `displayName`: `'Teams, Access Permissions & IdP Sync Blueprint'`
   - `scopeLevel`: `'organization'`
3. Discover:
   - Reads `team` entities, `parentTeamId`, `description`, privacy (`closed`/`secret`), `membershipCount`, and repository permissions.
   - Reads organization base permissions (`default_repository_permission`).
4. Plan:
   - Diffs target organization teams.
   - Sorts team creation DAG topologically to guarantee parent teams are created before child teams.
   - Plans repository permission grants (`read`, `triage`, `write`, `maintain`, `admin`).
   - Plans base organization repository permission alignment.
   - Generates a `teamSlugMap` (`{ [sourceSlug]: targetSlug }`) consumed by Task 028 (CODEOWNERS repair).
5. Apply:
   - Creates missing teams: `POST /orgs/{org}/teams` (linking `parent_team_id`).
   - Binds repository permissions: `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`.
   - Updates base organization permission if authorized: `PATCH /orgs/{org}`.
   - Emits `idp-group-sync-blueprint.csv` matching each GitHub team to recommended IdP group identifiers.
6. Direct Collaborators Handling:
   - Queries direct repository collaborators; attempts EMU handle translation; logs warnings for outside collaborators if target enterprise forbids them.
7. Verify:
   - Asserts target teams exist in the correct hierarchy and possess expected repository permissions.

## Acceptance Criteria

- Unit tests verify team DAG ordering (parents always created before children).
- Repository permission diffing correctly binds `admin`, `maintain`, `write`, `triage`, and `read`.
- Generates `idp-group-sync-blueprint.csv` with team slugs and member counts.
- Exports `teamSlugMap` for downstream CODEOWNERS repair.
- Passes `npm run check`.

## Tests

- `packages/migration/tests/modules/teams.test.ts`

## Documentation

- Create `packages/migration/src/modules/teams/README.md` detailing GHEC-EMU IdP mapping patterns and SCIM constraints.
- Update `agents/agent-communications/handoffs.md`.

## Risks / Notes

- **SCIM Group Sync Precedence:** Direct API team membership modification will be rejected if SCIM Group Sync is enabled on the team; keep direct membership decoupled.

## Completion Notes

_To be filled by Antigravity upon task completion._
