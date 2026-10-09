---
id: TASK-004
title: 'Surface Agent, Dependabot, and Codespaces secrets in Discovery and Dashboard'
status: completed
owner: antigravity
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery', '@ghec/dashboard', '@ghec/contracts']
---

# TASK-004: Surface Agent, Dependabot, and Codespaces secrets in Discovery and Dashboard

## 1. Objective & Context

The dashboard currently surfaces Actions secrets but omits other secret categories. The discovery `actions-secrets` collector currently flags `copilot` (Agent Secrets), `dependabot`, and `codespaces` coverages as `unsupported`. As requested by the user, we should surface these missing items (e.g. Agent Secrets) in the dashboard so users are aware of them, and ideally implement collectors for Dependabot and Codespaces secrets using the available REST APIs.

## 2. Dependencies & Prerequisites

- [ ] Existing dashboard and discovery packages are functional
- [ ] Appropriate GitHub REST API endpoints for Dependabot and Codespaces secrets identified

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Add `dependabot-secret` and `codespaces-secret` kinds.
- `packages/discovery/src/collectors/actions-secrets.ts`: Separate or update the collector to gather Dependabot and Codespaces secrets.
- `apps/dashboard/src/...`: Update the dashboard UI (e.g. `OperationsBreakdownTable.tsx`, `LiveConsoleTab.tsx`, `GlobalSearchModal.tsx`) to display Copilot Agent secrets (as unsupported or supported if an API exists) alongside Dependabot and Codespaces secrets.

## 4. Implementation Checklist

- [ ] **Step 1: Schema Updates**
  - Add appropriate literal kinds for the new secrets to `@ghec/contracts`.
- [ ] **Step 2: Collector Updates**
  - Implement collection for Dependabot and Codespaces secrets if the API allows.
  - Update coverage emissions to reflect the new state.
- [ ] **Step 3: Dashboard Updates**
  - Surface Copilot Agent secrets, Dependabot secrets, and Codespaces secrets in the secrets breakdown.
  - Show "unsupported" clearly for Copilot Agent secrets if the API is truly missing.
- [ ] **Step 4: Deterministic offline tests**
  - Add or update tests in `packages/discovery` and `apps/dashboard`.
- [ ] **Step 5: Quality gate verification**
  - Ensure `npm run check` passes completely.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence
