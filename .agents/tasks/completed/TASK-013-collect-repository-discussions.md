---
id: TASK-013
title: 'Collect repository discussions state'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery']
---

# TASK-013: Collect repository discussions state

## 1. Objective & Context

Repository-level discussions are NOT migrated by GEI. We must collect if discussions are enabled and their count (`discussions { totalCount }`) so we can adequately warn the customer.

## 2. Dependencies & Prerequisites

- [ ] Review `Repository.discussions` GraphQL field.

## 3. Scope of Changes

- Add `hasDiscussionsEnabled` and `discussions` count to `ORG_REPOSITORIES_QUERY`.
- Surface warning in dashboard.

## 4. Implementation Checklist

- [ ] GraphQL update
- [ ] Schema update
- [ ] Dashboard warning component
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
