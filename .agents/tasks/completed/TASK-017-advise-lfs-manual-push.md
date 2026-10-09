---
id: TASK-017
title: 'Advise LFS manual push follow-up task'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-017: Advise LFS manual push follow-up task

## 1. Objective & Context

GEI migrates repositories using LFS, but the LFS objects themselves are not migrated. They must be manually pushed afterwards. The dashboard needs to explicitly list this follow-up action for any repository flagged by `lfs.ts`.

## 2. Dependencies & Prerequisites

- [ ] Review LFS collector output.

## 3. Scope of Changes

- Add post-migration checklist to dashboard for LFS.

## 4. Implementation Checklist

- [ ] UI Checklist logic
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features (sub-issues, packages, dependabot alerts, code search delays, LFS limits, size limits).
- Verification Evidence: npm run check passed successfully.
