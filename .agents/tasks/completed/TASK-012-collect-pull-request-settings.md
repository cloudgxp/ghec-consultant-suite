---
id: TASK-012
title: 'Collect repository pull request settings'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/contracts']
---

# TASK-012: Collect repository pull request settings

## 1. Objective & Context

GEI docs state: "Repository settings for pull requests" are NOT migrated. This includes `mergeCommitAllowed`, `squashMergeAllowed`, `rebaseMergeAllowed`, and `deleteBranchOnMerge`. The discovery process completely ignores these fields.

## 2. Dependencies & Prerequisites

- [ ] Review `Repository` GraphQL fields.

## 3. Scope of Changes

- Update `ORG_REPOSITORIES_QUERY` to fetch PR settings.
- Add fields to `repository` contract.

## 4. Implementation Checklist

- [ ] Update GraphQL query
- [ ] Update schema
- [ ] Map fields
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
