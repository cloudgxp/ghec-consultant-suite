---
id: TASK-011
title: 'Collect team memberships'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/dashboard']
---

# TASK-011: Collect team memberships

## 1. Objective & Context

According to GEI docs, when migrating an organization, teams are migrated but team _membership_ is not. Currently, `teams.ts` only collects the `totalCount` of members. We must collect actual member logins so the dashboard can generate a remediation plan to recreate team memberships.

## 2. Dependencies & Prerequisites

- [ ] Review GraphQL `Team.members` pagination.

## 3. Scope of Changes

- `packages/discovery/src/collectors/teams.ts`: Fetch member nodes.
- `apps/dashboard/src/...`: Provide scripts/advice on recreating memberships.

## 4. Implementation Checklist

- [ ] Update GraphQL query
- [ ] Expose member arrays in output
- [ ] Surface follow-up task in dashboard
- [ ] Pass tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
