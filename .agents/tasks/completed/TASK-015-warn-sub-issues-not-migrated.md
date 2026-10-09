---
id: TASK-015
title: 'Warn that sub-issues are not migrated'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-015: Warn that sub-issues are not migrated

## 1. Objective & Context

Sub-issues are explicitly listed in GEI docs as NOT migrated. Relationships will be broken. We need a dashboard warning advising users that sub-issue hierarchies must be reconstructed.

## 2. Dependencies & Prerequisites

- [ ] None. Purely dashboard UI.

## 3. Scope of Changes

- Dashboard planning tab warnings.

## 4. Implementation Checklist

- [ ] Add warning to Dashboard.
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features (sub-issues, packages, dependabot alerts, code search delays, LFS limits, size limits).
- Verification Evidence: npm run check passed successfully.
