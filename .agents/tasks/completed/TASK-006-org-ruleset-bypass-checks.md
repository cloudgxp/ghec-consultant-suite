---
id: TASK-006
title: 'Collect Organization-level Rulesets and check for migration bypasses'
status: completed
owner: antigravity
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/dashboard', '@ghec/contracts']
---

# TASK-006: Collect Organization-level Rulesets and check for migration bypasses

## 1. Objective & Context

According to `setting-ruleset-bypasses-for-repository-migrations.md`, if an organization or enterprise has rulesets that affect pushed refs during a migration, the migration can time out and fail unless the `Repository migrations` bypass is set to `Exempt` on those rulesets. The current `policies.ts` collector in `@ghec/discovery` only queries repository-level rulesets (and does not check bypasses). This task updates the discovery process to fetch organization-level rulesets (and their bypass lists if the API allows), and surfaces a warning in the Dashboard if organization rulesets are present without the required `Exempt` bypass for migrations.

## 2. Dependencies & Prerequisites

- [ ] Identify the GraphQL or REST API for fetching organization-level rulesets and bypass actors.

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Update schemas if needed for organization-level rulesets or bypass data.
- `packages/discovery/src/collectors/policies.ts` (or create a new `org-policies.ts`): Implement GraphQL or REST call to fetch org-level rulesets and their bypass configurations.
- `apps/dashboard/src/...`: Add UI to display warnings if blocking org-level rulesets are found.

## 4. Implementation Checklist

- [ ] **Step 1: Interface / Schema definition**
  - Add bypass info and org-level policy metadata to `@ghec/contracts`.
- [ ] **Step 2: Core implementation**
  - Query org-level rulesets via API.
- [ ] **Step 3: Dashboard warnings**
  - Present a high-severity warning in the dashboard's assessment or planning tab.
- [ ] **Step 4: Deterministic offline tests**
  - Mock the new API calls with synthetic fixtures.
- [ ] **Step 5: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence
