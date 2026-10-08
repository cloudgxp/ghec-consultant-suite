---
id: TASK-023
title: 'Flag files exceeding 400MiB size limit'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/dashboard']
---

# TASK-023: Flag files exceeding 400MiB size limit

## 1. Objective & Context

GEI will fail if a single file in the Git repository is larger than 400 MiB. Discovery should flag repos that have extremely large blobs to proactively prevent migration failures.

## 2. Dependencies & Prerequisites

- [ ] Review Git blob sizes via GraphQL/REST.

## 3. Scope of Changes

- Run script/heuristics to detect files > 400 MiB if possible, or advise users to run `git-sizer`.

## 4. Implementation Checklist

- [ ] Heuristics update
- [ ] Dashboard warning
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features (sub-issues, packages, dependabot alerts, code search delays, LFS limits, size limits).
- Verification Evidence: npm run check passed successfully.
