---
id: TASK-044
title: 'Team Roles and Non-IdP Membership Migration'
status: completed
owner: agent
created_at: 2026-10-09
dependencies:
  - 'TASK-043'
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
  - 'apps/cli'
---

# TASK-044: Team Roles and Non-IdP Membership Migration

## 1. Objective & Context

In GitHub Enterprise Cloud with Enterprise Managed Users (GHEC-EMU), enterprise members are provisioned via SCIM at the enterprise level, but teams do not have to be managed by IdP groups. Organizations can maintain unlinked (native GitHub) teams managed directly via the GitHub Teams API and Web UI.

Moreover, GitHub enforces strict mutual exclusivity:

- Once a team is connected to an IdP group, direct membership management via the Teams API is disabled.
- If a team has manual members, all members must be removed before it can be connected to an IdP group.

For teams that are **not** managed by IdP, organizations require complete access fidelity across destination organizations:

1. **Custom Repository Roles:** Teams must retain their custom repository roles (from TASK-043) on destination repositories rather than being degraded to standard base permissions.
2. **Organization-Level Team Roles:** Predefined team organization roles (e.g. Security Managers) and Custom Organization Roles assigned to teams must be discovered, planned, applied, and verified.
3. **Non-IdP Team Membership:** Provisioned EMU members must be added to unlinked teams using `IdentityMappingEngine` to translate source usernames to target EMU logins (`user` $\rightarrow$ `user_emu`), with support for `member` and `maintainer` team roles.

## 2. Dependencies & Prerequisites

- [x] `TASK-043` completed (Custom Roles Migration Module)
- [x] Review EMU team synchronization and membership documentation in `references/github-docs/content/admin/managing-iam/provisioning-user-accounts-with-scim/managing-team-memberships-with-identity-provider-groups.md`

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Update scope schema or team contracts if needed for team management configuration
- `packages/migration/src/modules/teams/types.ts`:
  - Support custom repository role names in `TeamRepositoryAccess`
  - Define `TeamOrgRoleBinding` (Security Manager, Custom Org Role)
  - Define `TeamMember` (`login`, `role: 'member' | 'maintainer'`)
- `packages/migration/src/modules/teams/module.ts`:
  - Enhance discovery for custom repo roles, org roles on teams, and members of unlinked teams
  - Enhance plan to generate `team-repo-permission`, `team-org-role`, and `team-member` operations
  - Enhance apply to bind custom repo roles, org roles, and populate EMU team members
  - Enhance verify to audit custom repo roles, org roles, and team membership
- `packages/migration/tests/modules/teams.test.ts`: Offline deterministic unit tests
- `apps/cli/src/commands/agent-review.ts`: Handle remediation for team role and membership discrepancies

## 4. Implementation Checklist

- [x] **Step 1: Contract & Type Enhancements**
  - Allow `permission` in `TeamRepositoryAccess` to hold custom repository role names
  - Add `orgRoles: readonly TeamOrgRoleBinding[]` to `TeamDefinition`
  - Add `members: readonly TeamMember[]` and `isIdpManaged?: boolean` to `TeamDefinition`
- [x] **Step 2: Custom Repository Role Preservation**
  - Update `TeamsMigrationModule` to detect if a team repository role is a custom role
  - Plan operation with `{ role_name: customRoleName }`
  - Apply custom role on target repository via `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`
- [x] **Step 3: Organization-Level Roles on Teams**
  - Discover Security Manager teams: `GET /orgs/{org}/security-managers`
  - Discover Custom Organization Roles on teams: `GET /orgs/{org}/organization-roles`
  - Apply Security Manager teams: `PUT /orgs/{org}/security-managers/teams/{team_slug}`
  - Apply Custom Organization Roles on teams: `PUT /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}`
- [x] **Step 4: Non-IdP Team Membership Migration**
  - For teams not marked as IdP-managed (or when configured via scope `teamManagementMode`), discover members via `GET /orgs/{org}/teams/{team_slug}/members`
  - Translate member logins using `IdentityMappingEngine`
  - Apply memberships via `PUT /orgs/{org}/teams/{team_slug}/memberships/{username}` with `{ role: member.role }`
- [x] **Step 5: Verification & Remediation**
  - Audit custom repo roles, org roles, and team members during `verify`
  - Add agent review remediation generators for missing team org roles and members
- [x] **Step 6: Test Suite & Quality Gate**
  - Add comprehensive offline tests to `packages/migration/tests/modules/teams.test.ts`
  - Pass `npm run check`

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Task-specific unit test
node --import tsx --test packages/migration/tests/modules/teams.test.ts

# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-09
- Execution Summary:
  - Enhanced `@ghec/contracts` (`TeamManagementSchema`, `TeamManagement`) to define team management modes (`idp`, `native`, `hybrid`).
  - Updated `TeamsMigrationModule` dependencies to include `['gei-repo', 'custom-roles']` ensuring topological sequencing.
  - Implemented custom repository role preservation in `deriveTeamRepoPermission`, `discover`, `plan`, `apply`, and `verify`.
  - Implemented team organization role migration for Security Manager teams and Custom Organization Roles assigned to teams.
  - Implemented non-IdP team member discovery, identity mapping with `IdentityMappingEngine`, and membership application/verification.
  - Added descriptive discrepancy handling to `agent-review.ts`.
  - Added unit test suites verifying all aspects of team custom repo roles, org roles, and EMU member mapping in `packages/migration/tests/modules/teams.test.ts`.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/modules/teams.test.ts`: 8/8 tests passed cleanly.
  - `npm run check`: 556/556 tests passed, 0 lint/format/typecheck errors, apps built cleanly.
