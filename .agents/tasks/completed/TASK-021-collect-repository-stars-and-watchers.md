---
id: TASK-021
title: 'Collect repository stars and watchers'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/contracts']
---

# TASK-021: Collect repository stars and watchers

## 1. Objective & Context

Repository stars and watchers are not migrated. We should capture their counts so users understand the impact of losing these vanity metrics.

## 2. Dependencies & Prerequisites

- [ ] Review `stargazerCount` in GraphQL.

## 3. Scope of Changes

- Update `ORG_REPOSITORIES_QUERY` to fetch star and watcher counts.

## 4. Implementation Checklist

- [ ] GraphQL query update
- [ ] Schema update
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
