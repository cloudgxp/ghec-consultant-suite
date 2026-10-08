---
trigger: always_on
description: 'Enforces in-repo task planning conventions, lifecycle state transitions (backlog -> in-progress -> completed), and offline verification gates.'
---

# Invariant: Task Planning & Execution Lifecycle

## 1. Single Source of Planning Truth

- When decomposing user requests into multi-phase plans or tracking ongoing implementation, agents must persist task definitions in `.agents/tasks/`.
- Tasks must use the canonical template at `.agents/tasks/templates/task-template.md` and follow the naming convention `TASK-<id>-<kebab-title>.md`.
- Tasks must declare affected packages, prerequisite dependencies, an actionable checklist (`- [ ]`), and explicit verification commands.

## 2. Lifecycle Transitions

All state transitions must use physical file moves (`git mv`) to maintain auditability in git status and diffs:

1. **Backlog (`.agents/tasks/backlog/`):**
   - New tasks start in `backlog/` with frontmatter `status: backlog`.
   - Never start implementing a task without moving it to `in-progress/`.

2. **In Progress (`.agents/tasks/in-progress/`):**
   - When an agent claims a task, move it from `backlog/` to `in-progress/`.
   - Update frontmatter: `status: in-progress` and assign `owner`.
   - As implementation proceeds, check off completed checklist items (`- [x]`).

3. **Completed (`.agents/tasks/completed/`):**
   - Before moving to `completed/`:
     1. All checklist items must be checked off.
     2. All required test suites and `npm run check` must pass cleanly.
     3. Populate Section 6 (Completion Summary & Evidence) with verification output and completion date.
   - Move the file to `completed/` and update frontmatter: `status: completed`.

## 3. Scope & Verification Boundaries

- Every task must define an offline verification command using `node:test` or repository scripts (e.g. `npm run check`, `npm test`).
- Tasks must adhere to the Zero-Exposure Secret Boundary (DEC-004) and Offline Test Determinism invariants.
- Completed task files serve as immutable execution history.
