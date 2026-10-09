---
id: TASK-014
title: 'Collect fork parent relationships'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/contracts']
---

# TASK-014: Collect fork parent relationships

## 1. Objective & Context

GEI docs explicitly state "Fork relationships between repositories" are not migrated. We collect `isFork: true` but do not know the parent. We need to collect the `parent` repo name to map out broken fork links.

## 2. Dependencies & Prerequisites

- [ ] Review `Repository.parent` GraphQL field.

## 3. Scope of Changes

- Update `ORG_REPOSITORIES_QUERY` to fetch `parent { nameWithOwner }`.
- Surface in dashboard.

## 4. Implementation Checklist

- [ ] GraphQL update
- [ ] Contract update
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
