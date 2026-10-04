# Bug Fix Tasks

This directory contains bug fixes, defect resolutions, and regression corrections, including:

- Discovery CLI edge-case handling and error recovery
- UI layout, responsive display, and accessibility regressions
- Design system quality gate violations and token drift
- Process orchestration timeout, retry, and checkpoint fixes

## Task Lifecycle & Conventions

1. **New Tasks:** Place markdown task specifications directly in this directory (e.g., `fix-table-overflow.md`).
2. **Execution:** Antigravity agents read and execute pending tasks in this folder sequentially.
3. **Completion:** When a task meets all acceptance criteria and passes the root quality gate (`npm run check`), move the task specification into the [`completed/`](completed/) subfolder and record evidence in [`../CHANGELOG.md`](../CHANGELOG.md).
