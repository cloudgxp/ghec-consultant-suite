---
id: TASK-019
title: 'Clarify that GitHub Packages are not migrated by GEI'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-019: Clarify that GitHub Packages are not migrated by GEI

## 1. Objective & Context

The GEI docs state "Packages in GitHub Packages" are NOT migrated. The dashboard currently implies they are or needs clearer copy that a separate tool/script must be used.

## 2. Dependencies & Prerequisites

- [ ] Review `PackagesTab.tsx`.

## 3. Scope of Changes

- Update description in Packages tab to explicitly state GEI does not migrate them.

## 4. Implementation Checklist

- [ ] Edit copy
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features (sub-issues, packages, dependabot alerts, code search delays, LFS limits, size limits).
- Verification Evidence: npm run check passed successfully.
