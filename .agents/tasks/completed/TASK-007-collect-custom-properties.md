---
id: TASK-007
title: 'Collect Custom Properties for Organizations and Repositories'
status: backlog
owner: unassigned
created_at: 2026-10-06
dependencies: []
packages_affected: ['@ghec/contracts', '@ghec/discovery', '@ghec/dashboard']
---

# TASK-007: Collect Custom Properties for Organizations and Repositories

## 1. Objective & Context

The GitHub API now supports Custom Properties at the organization level, which are then assigned to repositories. Our schema in `@ghec/contracts` already defines `customProperties` on the `repository-portfolio` entity, but the discovery collector (`repos.ts`) currently hardcodes `customProperties: []` and makes no attempt to fetch them. Since custom properties are heavily used for repository classification and planning during migrations, we need to collect the custom property definitions at the organization level and the applied values at the repository level.

## 2. Dependencies & Prerequisites

- [ ] Review GitHub REST API docs for Custom Properties (`GET /orgs/{org}/properties/schema` and `GET /repos/{owner}/{repo}/properties/values`).

## 3. Scope of Changes

- `packages/contracts/src/index.ts`: Add an entity kind for org-level custom property definitions (e.g., `custom-property-definition`) so we know the type and allowed values.
- `packages/discovery/src/collectors/repos.ts` (or a new collector): Implement API calls to fetch custom properties and populate the `customProperties` array in the repository entity.
- `apps/dashboard/src/...`: Ensure custom properties are surfaced when viewing repository details.

## 4. Implementation Checklist

- [ ] **Step 1: Interface / Schema definition**
  - Add `custom-property-definition` schema to `@ghec/contracts`.
- [ ] **Step 2: Core implementation**
  - Fetch org-level definitions in the orgs or a new collector.
  - Fetch repo-level property values and map them to the `repository-portfolio` entity.
- [ ] **Step 3: Dashboard updates**
  - Display custom properties on the repository portfolio view.
- [ ] **Step 4: Deterministic offline tests**
  - Add unit/integration tests with mocked REST responses for custom properties.
- [ ] **Step 5: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

```bash
# Full repository verification gate
npm run check
```

## 6. Completion Summary & Evidence
