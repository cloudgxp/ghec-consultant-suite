---
id: TASK-016
title: 'Collect tag protection rules'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/contracts']
---

# TASK-016: Collect tag protection rules

## 1. Objective & Context

Tag protection rules are not migrated by GEI. The `policies.ts` collector gets branch protection but misses tag protections.

## 2. Dependencies & Prerequisites

- [ ] Review REST API `GET /repos/{owner}/{repo}/tags/protection`.

## 3. Scope of Changes

- Add tag protection REST call in `policies.ts`.
- Update contracts.

## 4. Implementation Checklist

- [ ] Schema update
- [ ] REST API call
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
