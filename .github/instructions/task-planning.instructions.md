---
applyTo: '**'
---

# Invariant: Task Planning & Execution Lifecycle

## 1. Structured Planning & Verification

- When decomposing multi-phase requests or tracking implementation progress, define affected packages, prerequisite dependencies, an actionable checklist (`- [ ]`), and explicit offline verification commands.
- If a task board directory (`.agents/tasks/` or `specs/`) is present in the workspace, maintain task files using the canonical task template and physical `git mv` transitions (`backlog/` $\rightarrow$ `in-progress/` $\rightarrow$ `completed/`).

## 2. Quality & Verification Boundaries

- Every implementation task must define and pass an offline verification command using `node:test` or repository scripts (`npm run check`, `npm test`).
- Tasks must adhere to the Zero-Exposure Secret Boundary (`DEC-004`) and Offline Test Determinism rules.
