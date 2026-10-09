---
id: TASK-002
title: 'add-packages-module-to-dashboard'
status: completed
owner: antigravity
created_at: 2026-10-06
dependencies: []
packages_affected: ['apps/dashboard']
---

# TASK-002: Add `packages` module to Dashboard Canonical Modules

## 1. Objective & Context

The dashboard aims to provide parity with the underlying migration CLI. If a feature can be migrated, it should be displayed in the dashboard and vice versa.

Currently, the `packages` module is fully implemented in `packages/migration/src/modules/packages/module.ts` and registered in the `ModuleRegistry`, allowing CLI users to migrate GitHub Packages and GHCR container images. Furthermore, the dashboard even has a UI for it (`PackagesTab.tsx`) that attempts to display and dispatch it.

However, `packages` is missing from the `CANONICAL_MODULES` array in `apps/dashboard/src/lib/step-summary.ts`. Because of this omission, the operations breakdown aggregation ignores packages data, and the overview metrics will not account for it.

We need to add the `packages` module to the `CANONICAL_MODULES` array. Based on the module definition, it operates at the `organization` scope level, so it should be categorized under `organization`.

## 2. Dependencies & Prerequisites

- [ ] None. This is a straightforward array addition.

## 3. Scope of Changes

Expected files or directories to create or modify:

- `apps/dashboard/src/lib/step-summary.ts`

## 4. Implementation Checklist

- [ ] **Step 1: Update `CANONICAL_MODULES` array**
  - Add a new entry to `CANONICAL_MODULES` in `apps/dashboard/src/lib/step-summary.ts` for the `packages` module. Set its `id` to `'packages'`, `displayName` to `'Packages & GHCR Container Image Migration'`, and `category` to `'organization'`.
- [ ] **Step 2: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added packages module to Dashboard CANONICAL_MODULES array.
- Verification Evidence: npm run check passed successfully.
