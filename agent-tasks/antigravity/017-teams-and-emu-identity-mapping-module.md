# Task 017: Implement `teams` & Identity Mapping Migration Module

## Status

not-started

## Owner

Antigravity

## Objective

Build the `teams` migration module in `packages/migration/src/modules/teams/`. Focus strictly on migrating team names, descriptions, parent-child hierarchy structures, and repository permission grants (DEC-005). Provide a pluggable foundation for EMU identity mapping while deliberately decoupling individual user membership synchronization.

## Background

In GHEC-EMU, team membership is frequently governed out-of-band by Identity Provider (IdP) Group Sync (SCIM/SAML). Direct user membership assignment via the Teams API is error-prone, requires non-trivial user identity mapping, and can conflict with IdP policies. Migrating team structures (parent/child hierarchy) and their repository access grants (`read`, `triage`, `write`, `maintain`, `admin`) ensures that when users are provisioned into IdP groups, the GitHub access permissions are immediately effective.

## Dependencies

- Task 005: Migration Core Framework & Module Registry in `@ghec/migration`
- Task 008: Implement `repo-variables` Migration Module

## Files / Areas Expected to Change

- `packages/migration/src/modules/teams/`
  - `module.ts`
  - `identity-mapper.ts`
  - `types.ts`
  - `index.ts`
- `packages/migration/tests/modules/teams.test.ts`

## Requirements

1. Implement `IdentityMappingEngine`:
   - Configured via `migration-scope.json` (`identityMapping`).
   - Supports username suffix transformation: `login` -> `${login}${suffix}`.
   - Supports explicit map lookup: `login` -> mapped target login.
   - Logs warnings for unmappable identities.
2. Implement `TeamsMigrationModule`:
   - `id`: `'teams'`
   - `displayName`: `'Teams & Access Permissions'`
   - `scopeLevel`: `'organization'`
3. Discover:
   - Reads `team` entities and their `parentTeamId`, `membershipCount`, and `repositoryAccess` lists.
4. Plan:
   - Queries target organization teams via `GET /orgs/{org}/teams`.
   - Compares team names and descriptions.
   - Resolves team hierarchy DAG: ensures parent teams are planned before child teams.
   - Diffs repository access permissions (`read`, `triage`, `write`, `maintain`, `admin`).
5. Apply:
   - Creates missing teams: `POST /orgs/{org}/teams` (linking `parent_team_id`).
   - Binds repository permissions: `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`.
6. Verify:
   - Asserts target teams exist and possess expected repository permissions.

## Acceptance Criteria

- Unit tests verify team hierarchy creation (parents before children).
- Repository permissions are applied accurately.
- Identity mapper handles EMU suffixing cleanly.
- `npm run check` passes.

## Tests

- `packages/migration/tests/modules/teams.test.ts`

## Documentation

- Create `packages/migration/src/modules/teams/README.md` detailing EMU IdP mapping rules.
- Update `agent-communications/handoffs.md`.

## Risks / Notes

- **IdP Group Sync Conflicts:** In EMU, if a team is managed by SCIM/SAML group sync, manual membership modifications via API will be rejected by GitHub; focus on team creation and repository permission grants rather than direct user membership insertion.

## Completion Notes

_To be filled by Antigravity upon task completion._
