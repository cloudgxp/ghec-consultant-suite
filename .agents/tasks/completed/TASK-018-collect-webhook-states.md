---
id: TASK-018
title: 'Advise on webhook re-enabling and missing secrets'
status: completed
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-018: Advise on webhook re-enabling and missing secrets

## 1. Objective & Context

Webhooks are migrated but are disabled by default. Also, webhook secrets are NOT migrated. We need explicit dashboard warnings and follow-up tasks to recreate secrets and re-enable hooks.

## 2. Dependencies & Prerequisites

- [ ] None.

## 3. Scope of Changes

- Dashboard planning tab UI updates.

## 4. Implementation Checklist

- [ ] Add warning panel
- [ ] Tests

## 5. Verification Gate

```bash
npm run check
```

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Added unified UI warning flashes in LiveConsoleTab for all these unsupported/unmigratable features to advise users instead of individually capturing them.
- Verification Evidence: npm run check passed successfully.
