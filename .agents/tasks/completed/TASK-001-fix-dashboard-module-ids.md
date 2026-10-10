---
id: TASK-001
title: 'fix-dashboard-module-ids'
status: completed
owner: antigravity
created_at: 2026-10-06
dependencies: []
packages_affected: ['apps/dashboard']
---

# TASK-001: Fix mismatching migration module IDs in Dashboard

## 1. Objective & Context

The dashboard UI tracks operations and statuses for migration modules, but it uses incorrect hardcoded string IDs for post-migration modules.
The canonical module IDs defined in `packages/migration` are:

- `post-migration-mannequins`
- `post-migration-codeowners`
- `security`

However, the dashboard is incorrectly referencing them as:

- `mannequins`
- `codeowners-repair`
- `ghas-security`

Because of this mismatch, when the dashboard tries to dispatch or read summary logs for these features, the data is lost or the generated CLI commands will fail (e.g., throwing `Module "mannequins" is not registered in the ModuleRegistry`). We must align the Dashboard to use the exact IDs defined in the migration package.

## 2. Dependencies & Prerequisites

- [ ] None. This is a direct string replacement and refactor in the dashboard app.

## 3. Scope of Changes

Expected files or directories to create or modify:

- `apps/dashboard/src/lib/step-summary.ts`
- `apps/dashboard/src/lib/verification-diff.ts`
- `apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx`
- `apps/dashboard/src/features/VirtualizedTeamsAndIdentitiesTab.tsx`

## 4. Implementation Checklist

- [ ] **Step 1: Update `CANONICAL_MODULES` array**
  - In `apps/dashboard/src/lib/step-summary.ts`, update the `id` field for the three post-migration modules to match `post-migration-mannequins`, `post-migration-codeowners`, and `security`.
- [ ] **Step 2: Update React Components & Verification Diff**
  - Search and replace `'mannequins'` with `'post-migration-mannequins'` in `apps/dashboard/src/features/TeamsAndIdentitiesTab.tsx` and `apps/dashboard/src/features/VirtualizedTeamsAndIdentitiesTab.tsx`.
  - Update `apps/dashboard/src/lib/verification-diff.ts` where it checks for `moduleId === 'mannequins'`.
- [ ] **Step 3: Quality gate verification**
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
- Execution Summary: Fixed mismatching migration module IDs in Dashboard by aligning them to post-migration-\* identifiers.
- Verification Evidence: npm run check passed successfully.
