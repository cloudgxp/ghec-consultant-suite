---
id: TASK-045
title: 'Wave 1 Org Settings & Member Privileges Migration Module'
status: completed
owner: agent
created_at: 2026-10-12
dependencies: []
packages_affected:
  - '@ghec/migration'
  - '@ghec/contracts'
---

# TASK-045: Wave 1 Org Settings & Member Privileges Migration Module

## 1. Objective & Context

Implement the 4-stage lifecycle migration module for Organization Settings & Member Privileges (`org-settings`) conforming to `orgSettingsBlueprint` in `packages/migration/src/blueprints/wave1-governance.ts`.
This module handles organization-level governance baselines, including:

- `default_repository_permission` ('read' | 'write' | 'admin' | 'none')
- `members_can_create_repositories`
- `members_can_create_public_repositories` (with EMU policy constraint awareness: disallow public or fallback safely)
- `members_can_create_private_repositories`
- `members_can_create_internal_repositories`
- `members_can_fork_private_repositories`
- `web_commit_signoff_required`
- `has_organization_projects`
- `has_repository_projects`

Lifecycle stages:

- `discover`: query source `GET /orgs/{org}`
- `plan`: diff against target `GET /orgs/{org}`, emit discrete `UPDATE_ORG_SETTING` operations with idempotent keys
- `apply`: execute mutations via `PATCH /orgs/{org}` using `targetWriteClient`, supporting dry-run
- `verify`: audit destination state against planned settings and return structured discrepancies

## 2. Dependencies & Prerequisites

- [x] Gap ledger manifest and wave 1 blueprints ratified (`wave1-governance.ts`)
- [x] `@ghec/contracts` and `@ghec/migration` foundational infrastructure in place

## 3. Scope of Changes

- `packages/migration/src/modules/org-settings/types.ts`
- `packages/migration/src/modules/org-settings/module.ts`
- `packages/migration/src/modules/org-settings/index.ts`
- `packages/migration/src/core/registry.ts`
- `packages/migration/tests/modules/org-settings.test.ts`

## 4. Implementation Checklist

- [x] **Step 1: Domain types and contracts**
  - Define `OrgSettingsData`, `OrgSettingsState`, and operational types in `types.ts`.
- [x] **Step 2: Core 4-stage module implementation**
  - Implement `discover(ctx, cachedData?)` querying `GET /orgs/{org}`.
  - Implement `plan(ctx, sourceData)` diffing settings with EMU visibility constraints.
  - Implement `apply(ctx, plan)` with dry-run support via `PATCH /orgs/{org}`.
  - Implement `verify(ctx, plan)` returning `ModuleVerificationResult`.
- [x] **Step 3: Module registration**
  - Register `OrgSettingsMigrationModule` in `ModuleRegistry` (`dependencies: []`).
- [x] **Step 4: Deterministic offline tests**
  - Create `packages/migration/tests/modules/org-settings.test.ts` testing all 4 stages, dry-run, EMU fallback, and discrepancy detection.

## 5. Verification Gate

```bash
node --import tsx --test packages/migration/tests/modules/org-settings.test.ts
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-12
- Execution Summary: Implemented 4-stage lifecycle `OrgSettingsMigrationModule` with EMU public repository creation policy handling, discrete `PATCH /orgs/{org}` mutations, dry-run support, and post-migration discrepancy auditing. Registered in `ModuleRegistry` and cataloged as implemented.
- Verification Evidence: All 8 unit tests in `org-settings.test.ts` passed; `gap-registry-alignment.test.ts` passed with 25 registered modules.
