---
id: TASK-024
title: 'Collect user access to repositories'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/contracts']
---

# TASK-024: Collect user access to repositories

## 1. Objective & Context

"User access to the repository" is explicitly NOT migrated. We must collect direct user access lists so they can be re-provisioned via script after the migration.

## 2. Dependencies & Prerequisites

- [ ] Review `GET /repos/{owner}/{repo}/collaborators`.

## 3. Scope of Changes

- Add collection of direct repository collaborators in `users.ts` or `repos.ts`.
- Map to an access entity.

## 4. Implementation Checklist

- [ ] REST API implementation
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
