---
id: TASK-003
title: 'fix-migration-orchestrator-planner-filtering'
status: completed
owner: antigravity
created_at: 2026-10-06
dependencies: []
packages_affected: ['packages/migration']
---

# TASK-003: Fix Module Filtering in MigrationOrchestrator Planner Invocation

## 1. Objective & Context

When executing a migration via the CLI, the user can pass specific modules to migrate (e.g., `--modules lfs,releases`). This is parsed and passed to the `MigrationOrchestrator` as `modulesFilter`.

Currently, `MigrationOrchestrator` instantiates the `MigrationPlanner` _without_ passing `this.modulesFilter` as the `modules` option. As a result, the `MigrationPlanner` is completely unaware of the user's intent to filter modules, and it proceeds to generate a comprehensive migration plan for _every_ registered module.

Only after the full plan is generated does `MigrationOrchestrator` apply the `modulesFilter` to the output array. This causes two severe issues:

1. Massive performance degradation, as the planner fetches resources and computes diffs for 21 modules across the entire organization when the user only asked for one.
2. Silent execution drops if the filter isn't aligned properly, or if dependencies are not resolved dynamically.

We need to pass the `modules` option down to `MigrationPlanner`.

## 2. Dependencies & Prerequisites

- [ ] None.

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/migration/src/orchestrator/migration-orchestrator.ts`
- `packages/migration/tests/orchestrator/migration-orchestrator.test.ts` (if applicable, to verify planner is called with the correct modules filter).

## 4. Implementation Checklist

- [ ] **Step 1: Fix Orchestrator Instantiation of Planner**
  - In `packages/migration/src/orchestrator/migration-orchestrator.ts`, within the `run` method, update the `new MigrationPlanner` options object to include `modules: this.modulesFilter`.
- [ ] **Step 2: Add or Update Tests**
  - Add or update deterministic offline tests to verify that `MigrationOrchestrator` passes the module filter down to the planner.
- [ ] **Step 3: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Task-specific test command
node --import tsx --test packages/migration/tests/orchestrator/migration-orchestrator.test.ts
```

## 6. Completion Summary & Evidence

## 6. Completion Summary & Evidence

- Completion Date: 2026-10-06
- Execution Summary: Fixed Module Filtering in MigrationOrchestrator by passing modulesFilter directly to MigrationPlanner.
- Verification Evidence: npm run check passed successfully.
