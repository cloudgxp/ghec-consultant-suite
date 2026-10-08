---
id: TASK-020
title: 'Warn about lost Dependabot and Code Scanning alerts'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-020: Warn about lost Dependabot and Code Scanning alerts

## 1. Objective & Context

GEI does not migrate code scanning results or Dependabot alerts. Users must be advised that these will be re-evaluated post-migration and historical alerts will be lost.

## 2. Dependencies & Prerequisites

- [ ] Review security tab.

## 3. Scope of Changes

- Add advisory to security breakdown.

## 4. Implementation Checklist

- [ ] UI warning
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features (sub-issues, packages, dependabot alerts, code search delays, LFS limits, size limits).
- Verification Evidence: npm run check passed successfully.
