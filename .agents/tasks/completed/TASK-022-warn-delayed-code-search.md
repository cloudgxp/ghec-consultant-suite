---
id: TASK-022
title: 'Advise on delayed code search post-migration'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-022: Advise on delayed code search post-migration

## 1. Objective & Context

GEI documentation notes that code search indexing can take a few hours post-migration. The dashboard should set this expectation for post-migration validation.

## 2. Dependencies & Prerequisites

- [ ] None.

## 3. Scope of Changes

- Add info banner to post-migration steps.

## 4. Implementation Checklist

- [ ] Add info banner
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features (sub-issues, packages, dependabot alerts, code search delays, LFS limits, size limits).
- Verification Evidence: npm run check passed successfully.
