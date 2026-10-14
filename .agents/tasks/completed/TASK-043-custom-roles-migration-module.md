---
id: TASK-043
title: 'Custom Roles Migration Module'
status: completed
owner: agent
created_at: 2026-10-09
dependencies: []
packages_affected:
  - '@ghec/contracts'
  - '@ghec/migration'
---

# TASK-043: Custom Roles Migration Module

## 1. Objective & Context

In GitHub Enterprise Cloud (GHEC) and GHEC-EMU, organizations define custom repository roles (`GET /orgs/{org}/custom-repository-roles`) and custom organization roles (`GET /orgs/{org}/organization-roles`) to enforce fine-grained, least-privilege access.

Currently, the suite has no migration module for custom roles. When teams or users have custom repository roles assigned, the migration suite degrades them to standard built-in roles (`pull`, `triage`, `push`, `maintain`, `admin`). Recreating custom repository and organization roles at the destination is a mandatory prerequisite for preserving custom role bindings for teams and collaborators.

This task implements `CustomRolesMigrationModule` adhering to the 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`) in `@ghec/migration` and registers it in `ModuleRegistry`.

## 2. Dependencies & Prerequisites

- [ ] Inspect REST specs: `docs/specs/collectors/rest.orgs.list-custom-repo-roles.md` and `docs/specs/collectors/rest.orgs.list-org-roles.md`
- [ ] Review GitHub documentation in `references/github-docs/content/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/`

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Contracts / schemas for custom role entities if required
- `packages/migration/src/modules/custom-roles/index.ts`: Module exports
- `packages/migration/src/modules/custom-roles/types.ts`: Interface definitions for Custom Repository and Organization roles
- `packages/migration/src/modules/custom-roles/module.ts`: `CustomRolesMigrationModule` (discover, plan, apply, verify)
- `packages/migration/src/modules/custom-roles/README.md`: Architecture and usage documentation
- `packages/migration/src/core/registry.ts`: Register `custom-roles` module
- `packages/migration/tests/modules/custom-roles.test.ts`: Offline deterministic test suite

## 4. Implementation Checklist

- [x] **Step 1: Interface & Schema Definition**
  - Define `CustomRepositoryRoleDefinition` (`name`, `description`, `base_role`, `permissions`)
  - Define `CustomOrganizationRoleDefinition` (`name`, `description`, `permissions`)
  - Define `CustomRolesMigrationData`
- [x] **Step 2: Module Discovery**
  - Query source organization custom repo roles: `GET /orgs/{org}/custom-repository-roles`
  - Query source organization custom org roles: `GET /orgs/{org}/organization-roles`
  - Gracefully handle organizations without custom roles or 404/403 responses
- [x] **Step 3: Module Planning**
  - Query target organization custom roles to detect existing roles
  - Plan `create` operations for missing roles
  - Plan `update` or `noop` for matching roles
- [x] **Step 4: Module Execution (Apply)**
  - Create custom repository roles: `POST /orgs/{org}/custom-repository-roles`
  - Create custom organization roles: `POST /orgs/{org}/organization-roles`
  - Support `dryRun` and `--continue-on-error`
- [x] **Step 5: Module Verification**
  - Verify target organization roles exist and permissions match
  - Emit structured `VerificationDiscrepancy` entries on mismatches
- [x] **Step 6: Registration & Test Coverage**
  - Register `custom-roles` in `packages/migration/src/core/registry.ts`
  - Implement full offline unit tests with mock adapters in `packages/migration/tests/modules/custom-roles.test.ts`
  - Pass `npm run check`

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Task-specific unit test
node --import tsx --test packages/migration/tests/modules/custom-roles.test.ts

# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-09
- Execution Summary:
  - Implemented `packages/migration/src/modules/custom-roles/` covering the full 4-stage lifecycle (`discover`, `plan`, `apply`, `verify`) for both Custom Repository Roles and Custom Organization Roles.
  - Exported and registered `CustomRolesMigrationModule` in `createDefaultModuleRegistry()` and monorepo exports.
  - Updated CLI `agent-review.ts` discrepancy categorization under `identity-and-access`.
  - Added unit test suite `packages/migration/tests/modules/custom-roles.test.ts` with 100% offline synthetic coverage.
- Verification Evidence:
  - `node --import tsx --test packages/migration/tests/modules/custom-roles.test.ts`: 5/5 tests passed in 564ms.
  - `npm run check`: 553/553 tests passed across 97 suites with clean lint, typecheck, and build steps.
