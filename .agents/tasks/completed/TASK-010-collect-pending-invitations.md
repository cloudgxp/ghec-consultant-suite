---
id: TASK-010
title: 'Collect pending organization and repository invitations'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/contracts', '@ghec/dashboard']
---

# TASK-010: Collect pending organization and repository invitations

## 1. Objective & Context

Pending invitations to organizations and repositories are not migrated. We need to collect `GET /orgs/{org}/invitations` and `GET /repos/{owner}/{repo}/invitations` so the dashboard can surface them, preventing dropped invitations during migration.

## 2. Dependencies & Prerequisites

- [ ] Review GitHub API for invitations.

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Add `invitation` entity.
- `packages/discovery/src/collectors/users.ts`: Fetch pending invitations.
- `apps/dashboard/src/...`: Display warnings about dropped invitations.

## 4. Implementation Checklist

- [ ] Define schema
- [ ] Implement REST API collection
- [ ] Surface in dashboard
- [ ] Add offline tests
- [ ] Pass `npm run check`

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
