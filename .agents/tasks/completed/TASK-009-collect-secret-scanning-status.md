---
id: TASK-009
title: 'Collect Secret Scanning and Advanced Security status'
status: backlog
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/contracts', '@ghec/discovery', '@ghec/dashboard']
---

# TASK-009: Collect Secret Scanning and Advanced Security status

## 1. Objective & Context

The `security` entity in `@ghec/contracts` and the `security.ts` collector currently track `codeScanning` and `dependabot` status. However, GitHub Advanced Security (GHAS) also heavily features Secret Scanning and Secret Scanning Push Protection, which are critical for migrations (especially since alerts are migrated). We need to ensure we collect the `secretScanning` status from the API and include it in our schema and dashboard.

## 2. Dependencies & Prerequisites

- [ ] Verify GitHub REST API endpoints for secret scanning status (e.g. `GET /repos/{owner}/{repo}` -> `security_and_analysis`).

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Add `secretScanning: z.enum(['enabled', 'disabled', 'unknown'])` to the `security` entity.
- `packages/discovery/src/collectors/security.ts`: Implement logic to fetch secret scanning status.
- `apps/dashboard/src/...`: Display Secret Scanning status in the security/operations breakdown.

## 4. Implementation Checklist

- [ ] **Step 1: Interface / Schema definition**
  - Update `security` schema in `@ghec/contracts` to include `secretScanning`.
- [ ] **Step 2: Core implementation**
  - Update `security.ts` to either parse the repository REST endpoint for `security_and_analysis` or use the specific secret scanning APIs.
- [ ] **Step 3: Dashboard updates**
  - Ensure the dashboard shows Secret Scanning next to Dependabot and Code Scanning.
- [ ] **Step 4: Deterministic offline tests**
  - Add or update offline tests to assert secret scanning status is parsed correctly.
- [ ] **Step 5: Quality gate verification**
  - Ensure `npm run check` passes completely.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence
