---
id: TASK-008
title: 'Collect GitHub Environments and Protection Rules'
status: backlog
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/discovery']
---

# TASK-008: Collect GitHub Environments and Protection Rules

## 1. Objective & Context

The `@ghec/contracts` package already defines the `action-environment` entity, and the dashboard codebase contains UI logic to display it. However, the discovery module (`packages/discovery/src/collectors/actions.ts`) does not collect environments, and `actions-secrets.ts` explicitly marks environment coverage as `unsupported`. GitHub Environments are critical to CI/CD migrations as they hold protection rules, reviewers, and environment-level secrets/variables. We need to implement a collector for environments via the REST API (`GET /repos/{owner}/{repo}/environments`).

## 2. Dependencies & Prerequisites

- [ ] Review GitHub REST API docs for Environments.

## 3. Scope of Changes

- `packages/discovery/src/collectors/actions.ts` (or `environments.ts`): Add a collection phase to fetch environments for each repository.
- `packages/discovery/src/collectors/actions-secrets.ts`: Update the coverage matrix for `environment` from `unsupported` to `complete`/`partial` (and optionally fetch environment secrets/variables if that API is available).

## 4. Implementation Checklist

- [ ] **Step 1: Core implementation**
  - Implement REST API calls to `GET /repos/{owner}/{repo}/environments`.
  - Map the response to the existing `action-environment` contract.
- [ ] **Step 2: Environment Secrets (Optional but recommended)**
  - If the API allows, fetch metadata for environment secrets/variables and map them to `actions-secret` entities with `level: 'environment'`.
- [ ] **Step 3: Update Coverage**
  - Change the `environment` domain coverage to accurately reflect successful collection.
- [ ] **Step 4: Deterministic offline tests**
  - Add offline unit/integration tests with synthetic environment fixtures.
- [ ] **Step 5: Quality gate verification**
  - Ensure `npm run check` passes completely.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence
