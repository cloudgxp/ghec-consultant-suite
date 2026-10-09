---
id: TASK-005
title: 'Surface Mannequin reclamation advice and planning info in Dashboard'
status: completed
owner: antigravity
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/dashboard']
---

# TASK-005: Surface Mannequin reclamation advice and planning info in Dashboard

## 1. Objective & Context

Migrations using GEI result in the creation of Mannequins in the destination org (placeholder identities for non-mapped users). According to `references/github-docs/content/migrations/overview/mannequins-and-user-activity.md`, reclaiming is an optional step that happens after a migration. The dashboard currently lacks planning or guidance around Mannequins. This task adds UI guidance/planning steps in the dashboard to advise users on how and when to reclaim Mannequins (e.g. post-migration via CLI and potential auto-reclaim for EMUs).

## 2. Dependencies & Prerequisites

- [ ] Review `mannequins-and-user-activity.md` for specific advice details.

## 3. Scope of Changes

- `apps/dashboard/src/...`: Add an informational component or a dedicated planning checklist item for "Mannequin Reclamation".

## 4. Implementation Checklist

- [ ] **Step 1: Dashboard UI component**
  - Add a panel or checklist item to the LiveConsoleTab or planning phase of the dashboard that advises users on Mannequin handling.
- [ ] **Step 2: Add EMU-specific advice**
  - Highlight that if using EMUs, they can optionally skip the invitation process and immediately reclaim the mannequin using the GitHub CLI.
- [ ] **Step 3: Deterministic offline tests**
  - Ensure the dashboard components render without errors.
- [ ] **Step 4: Quality gate verification**
  - Pass `npm run check`.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence
