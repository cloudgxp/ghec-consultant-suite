---
id: TASK-000
title: '<Task Title>'
status: backlog # backlog | in-progress | completed | blocked
owner: unassigned # agent | human | <name>
created_at: YYYY-MM-DD
dependencies: []
packages_affected: []
---

# TASK-000: <Task Title>

## 1. Objective & Context

<!--
Concise explanation of what needs to be implemented or fixed, and the rationale.
Link to relevant architectural decisions (docs/architecture/decisions.md) or specifications (docs/specs/).
-->

## 2. Dependencies & Prerequisites

- [ ] Upstream tasks completed or prerequisite PRs merged
- [ ] Required tools, fixtures, or environment settings in place

## 3. Scope of Changes

Expected files or directories to create or modify:

- `packages/<pkg>/src/...`
- `packages/<pkg>/tests/...`

## 4. Implementation Checklist

- [ ] **Step 1: Interface / Schema definition**
  - Define or update types and contracts adhering to `@ghec/contracts`.
- [ ] **Step 2: Core implementation**
  - Implement business logic with strict typing and no `any`.
- [ ] **Step 3: Deterministic offline tests**
  - Add unit/integration tests using `node:test` and synthetic fixtures.
- [ ] **Step 4: Quality gate verification**
  - Pass all lint, typecheck, build, and test steps.

## 5. Verification Gate

Commands required to validate this task before marking complete:

```bash
# Full repository verification gate
npm run check

# Task-specific test command (if applicable)
node --import tsx --test packages/<pkg>/tests/<test-file>.test.ts
```

## 6. Completion Summary & Evidence

<!--
To be populated upon completion before moving task to completed/:
- Completion Date: YYYY-MM-DD
- Execution Summary: Brief description of changes made
- Verification Evidence: Output from npm run check or targeted test runs
-->
